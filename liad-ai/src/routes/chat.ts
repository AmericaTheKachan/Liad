import { Request, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import { askGemini, ChatMessage } from "../services/gemini";
import { getAccountData, getLatestCsvForAccount } from "../services/firebase-admin";
import {
  buildIndex,
  hasIndex,
  isIndexBuilding,
  getIndexHash,
  getIndexSize,
  getIndexItems,
  getEmbedding,
  getSemanticScores,
  getSchemaAnalysis,
  csvHash,
} from "../services/semantic-search";
import { Product } from "../services/schema-analysis";
import { rankProducts } from "../services/hybrid-ranker";
import fs from "fs";
import path from "path";
import { parse } from "csv-parse/sync";

const router: Router = Router();

// ─── Rate limiter ─────────────────────────────────────────────────────────────
// 30 requests / minute per accountId (falls back to IP)

const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req: Request) => {
    const body = req.body as { accountId?: string };
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ??
      req.socket.remoteAddress ??
      "unknown";
    return body?.accountId ?? ip;
  },
  handler: (_req: Request, res: Response) => {
    res
      .status(429)
      .json({ error: "Muitas requisições. Aguarde um momento e tente novamente." });
  },
});

router.use(limiter);

// ─── CSV helpers ──────────────────────────────────────────────────────────────

function parseCsv(csvContent: string): Product[] {
  try {
    return parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Product[];
  } catch {
    return [];
  }
}

function productsToPromptCsv(products: Product[]): string {
  if (products.length === 0) return "No products found.";
  const headers = Object.keys(products[0]);
  const rows = products.map((p) => headers.map((h) => p[h] ?? "").join(","));
  return [headers.join(","), ...rows].join("\n");
}

// ─── Semantic search ──────────────────────────────────────────────────────────

async function searchProducts(
  accountId: string,
  query: string,
  topK: number
): Promise<{ product: Product; score: number }[]> {
  const items = getIndexItems(accountId);
  if (items.length === 0) return [];

  const queryEmbedding = await getEmbedding(query);
  const scored = await getSemanticScores(queryEmbedding, items);

  return scored
    .sort((a, b) => b.score - a.score)
    .slice(0, topK);
}

// ─── Prompt builder ───────────────────────────────────────────────────────────

function buildSystemPrompt(storeName: string, csvContent: string): string {
  const promptPath = path.join(__dirname, "system-prompt.md");
  let template = fs.readFileSync(promptPath, "utf-8");
  template = template.replace("{storeName}", storeName);
  template = template.replace("{csvContent}", csvContent);
  return template;
}

// ─── Route ────────────────────────────────────────────────────────────────────

router.post("/chat", async (req: Request, res: Response) => {
  const { accountId, message, history } = req.body as {
    accountId?: string;
    message?: string;
    history?: ChatMessage[];
  };

  if (!accountId || typeof accountId !== "string") {
    res.status(400).json({ error: "accountId é obrigatório." });
    return;
  }

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message é obrigatório." });
    return;
  }

  // Validate + trim history — keep only last 6 turns (3 exchanges)
  const safeHistory = (
    Array.isArray(history)
      ? history.filter(
        (msg) =>
          msg &&
          (msg.role === "user" || msg.role === "model") &&
          Array.isArray(msg.parts) &&
          msg.parts.length > 0 &&
          typeof msg.parts[0].text === "string" &&
          msg.parts[0].text.trim().length > 0
      )
      : []
  ).slice(-6) as ChatMessage[];

  try {
    const [rawCsv, account] = await Promise.all([
      getLatestCsvForAccount(accountId),
      getAccountData(accountId),
    ]);

    if (!account) {
      res.status(404).json({ error: "Conta não encontrada." });
      return;
    }

    const storeName: string = account.storeName ?? "Loja";

    // ── Build/refresh index in the background ─────────────────────────────
    if (rawCsv) {
      const currentHash = csvHash(rawCsv);
      const needsRebuild =
        !hasIndex(accountId) || getIndexHash(accountId) !== currentHash;

      if (needsRebuild && !isIndexBuilding(accountId)) {
        const products = parseCsv(rawCsv);
        if (products.length > 0) {
          buildIndex(accountId, products, currentHash).catch(err =>
            console.error("[buildIndex background]", err)
          );
        }
      }

      // Wait up to 15s for the first batch to land (partial index published per batch)
      if (!hasIndex(accountId)) {
        const deadline = Date.now() + 15_000;
        while (!hasIndex(accountId) && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      if (!hasIndex(accountId)) {
        res.json({ reply: "..." });
        return;
      }
    }

    const catalogSize = getIndexSize(accountId);
    // Retrieve a wider candidate set, then rerank to finalTopK for Gemini
    const searchTopK = catalogSize < 30 ? catalogSize : Math.min(catalogSize, 30);
    const finalTopK = catalogSize < 30 ? catalogSize : 20;

    // ── Semantic search — enrich query with last user turn for context ─────
    const lastUserMsg =
      safeHistory.filter((m) => m.role === "user").slice(-1)[0]?.parts[0]
        ?.text ?? "";

    const searchQuery = lastUserMsg
      ? `${lastUserMsg} ${message.trim()}`
      : message.trim();

    const scoredProducts = await searchProducts(accountId, searchQuery, searchTopK);

    // ── Hybrid rerank: boost in-stock / highly-rated, then take top N ─────
    const schemaAnalysis = getSchemaAnalysis(accountId);
    const reranked = rankProducts(scoredProducts, schemaAnalysis);
    const relevantProducts = reranked.slice(0, finalTopK).map((r) => r.product);

    const filteredCsv = productsToPromptCsv(relevantProducts);

    // ── Call Gemini with filtered catalog ─────────────────────────────────
    const systemPrompt = buildSystemPrompt(storeName, filteredCsv);
    const reply = await askGemini(systemPrompt, safeHistory, message.trim());

    res.json({ reply });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno.";
    console.error("[/api/chat]", error);
    res.status(500).json({ error: msg });
  }
});

export default router;