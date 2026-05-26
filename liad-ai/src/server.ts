import path from "path";
import fs from "fs";
import express, { Request, Response } from "express";
import cors from "cors";
import { loadEnvFile } from "./lib/env";
import chatRouter from "./routes/chat";
import metricsRouter from "./routes/metrics";
import { getAllAccountIds, getLatestCsvForAccount, invalidateCsvCache } from "./lib/firebase";
import { buildIndex, csvHash, clearIndex, clearAllIndexes } from "./catalog/index";
import { parseCsv } from "./lib/csv";

loadEnvFile(path.join(process.cwd(), ".env"));

const app = express();
const port = Number(process.env.PORT ?? "3001");

function findWidgetFile(): string | null {
  const candidates = [
    path.join(process.cwd(), "public", "widget.js"),
    path.join(__dirname, "..", "public", "widget.js"),
  ];
  return candidates.find((c) => fs.existsSync(c)) ?? null;
}

app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/widget.js", (_req: Request, res: Response) => {
  const widgetFile = findWidgetFile();
  if (!widgetFile) {
    res.status(404).type("text/plain").send("LIAD widget not found.");
    return;
  }
  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader(
    "Cache-Control",
    process.env.NODE_ENV === "production" ? "public, max-age=300" : "no-store",
  );
  res.sendFile(widgetFile);
});

app.use("/", chatRouter);
app.use("/", metricsRouter);

/**
 * Admin: cache management
 *
 * Requires X-Admin-Key header matching ADMIN_KEY env var.
 *   DELETE /admin/index-cache              — clears BM25+vector index for all accounts
 *   DELETE /admin/index-cache?accountId=x  — clears index for one account
 *
 * Also invalidates the CSV memory cache so the next request fetches fresh data
 * from Firebase and triggers an immediate index rebuild.
 */
app.delete("/admin/index-cache", async (req: Request, res: Response) => {
  const adminKey = process.env.ADMIN_KEY;
  if (!adminKey) {
    res.status(403).json({ error: "Admin endpoint disabled. Set ADMIN_KEY in .env to enable." });
    return;
  }
  if (req.headers["x-admin-key"] !== adminKey) {
    res.status(401).json({ error: "Invalid admin key." });
    return;
  }

  const accountId = req.query["accountId"] as string | undefined;
  if (accountId) {
    clearIndex(accountId);
    invalidateCsvCache(accountId);
    console.log(`[admin] Cleared index cache for account ${accountId}`);
    res.json({ cleared: accountId });
  } else {
    await clearAllIndexes();
    console.log("[admin] Cleared all index caches.");
    res.json({ cleared: "all" });
  }
});

app.listen(port, () => {
  console.log(`LIAD AI rodando em http://localhost:${port}`);
  preloadIndexes().catch(err => console.error("[preload] Failed:", err));
});

async function preloadIndexes(): Promise<void> {
  let accountIds: string[];
  try {
    accountIds = await getAllAccountIds();
  } catch (err) {
    console.error("[preload] Could not fetch account list:", err);
    return;
  }

  console.log(`[preload] Preloading indexes for ${accountIds.length} accounts...`);

  for (const accountId of accountIds) {
    console.log(`[preload] Building index for account ${accountId}...`);
    try {
      const rawCsv = await getLatestCsvForAccount(accountId);
      if (!rawCsv) continue;
      const products = parseCsv(rawCsv);
      if (products.length === 0) continue;
      await buildIndex(accountId, products, csvHash(rawCsv));
      console.log(`[preload] Index built for account ${accountId} (${products.length} products)`);
    } catch (err) {
      console.error(`[preload] Failed to build index for account ${accountId}:`, err);
    }
  }
}
