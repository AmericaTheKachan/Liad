import { Request, Response, Router } from "express";
import rateLimit from "express-rate-limit";
import type { ChatMessage } from "../lib/gemini";
import { parseCsv } from "../lib/csv";
import { getAccountData, getLatestCsvForAccount, logConversation } from "../lib/firebase";
import {
  buildIndex,
  hasIndex,
  isIndexBuilding,
  getIndexHash,
  getIndexSize,
  csvHash,
} from "../catalog/index";
import { chatTurn } from "../pipeline";

const router: Router = Router();

// Rate limiter: 30 requests / minute per accountId (falls back to IP)
const limiter = rateLimit({
  windowMs: 60 * 1000,
  max: 30,
  keyGenerator: (req: Request) => {
    const body = req.body as { accountId?: string; apiKey?: string };
    const ip =
      (req.headers["x-forwarded-for"] as string)?.split(",")[0] ??
      req.socket.remoteAddress ??
      "unknown";
    return body?.apiKey ?? body?.accountId ?? ip;
  },
  handler: (_req: Request, res: Response) => {
    res.status(429).json({ error: "Muitas requisicoes. Aguarde um momento e tente novamente." });
  },
});

router.use(limiter);

router.post("/chat", async (req: Request, res: Response) => {
  const { apiKey, message, history } = req.body as {
    apiKey?: string;
    accountId?: string;
    message?: string;
    history?: ChatMessage[];
  };

  if (!apiKey || typeof apiKey !== "string") {
    res.status(400).json({ error: "apiKey e obrigatoria." });
    return;
  }

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message e obrigatorio." });
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
    const apiKeyAccount = await getAccountByApiKey(apiKey);
    if (!apiKeyAccount) {
      res.status(401).json({ error: "API Key invalida ou inativa." });
      return;
    }

    const { accountId, account } = apiKeyAccount;
    touchApiKeyUsage(accountId).catch(err => console.error("[touchApiKeyUsage]", err));

    const [rawCsv] = await Promise.all([
      getLatestCsvForAccount(accountId),
    ]);

    const storeName: string = account.storeName ?? "Loja";

    // Build / refresh index in the background when CSV changes
    if (rawCsv) {
      const currentHash = csvHash(rawCsv);
      const needsRebuild = !hasIndex(accountId) || getIndexHash(accountId) !== currentHash;

      if (needsRebuild && !isIndexBuilding(accountId)) {
        const products = parseCsv(rawCsv);
        if (products.length > 0) {
          buildIndex(accountId, products, currentHash).catch(err =>
            console.error("[buildIndex background]", err)
          );
        } else {
          console.warn(`[chat] parseCsv returned 0 products for account ${accountId}. Check CSV format.`);
        }
      }

      // Wait up to 30s for the first build — widget shows typing indicator during this
      if (!hasIndex(accountId)) {
        const deadline = Date.now() + 30_000;
        while (!hasIndex(accountId) && Date.now() < deadline) {
          await new Promise(r => setTimeout(r, 500));
        }
      }

      if (!hasIndex(accountId)) {
        res.json({
          reply: "Ainda estou carregando o catalogo de produtos. Por favor, repita sua pergunta em alguns instantes.",
          loading: true,
        });
        return;
      }
    } else {
      console.warn(`[chat] No CSV found for account ${accountId}.`);
    }

    const catalogSize = getIndexSize(accountId);

    const start = Date.now();
    const { reply, topProduct } = await chatTurn(
      accountId,
      storeName,
      message.trim(),
      safeHistory,
      catalogSize,
    );
    const responseTimeMs = Date.now() - start;

    // Log asynchronously — do not block the response
    logConversation(accountId, {
      messageCount: safeHistory.length + 1,
      topProduct,
      responseTimeMs,
    }).catch(err => console.error("[logConversation]", err));

    res.json({ reply });
  } catch (error) {
    const msg = error instanceof Error ? error.message : "Erro interno.";
    console.error("[/chat]", error);
    res.status(500).json({ error: msg });
  }
});

export default router;
