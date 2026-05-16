import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import crypto from "crypto";
import { Product, CatalogSchemaAnalysis } from "./schema-analysis";
import { buildEmbeddingText } from "./embedding-builder";

// ─── Lazy model init ──────────────────────────────────────────────────────────

function getEmbeddingModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in environment variables.");
  return new GoogleGenerativeAI(key).getGenerativeModel({ model: "gemini-embedding-001" });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface IndexedProduct {
  product: Product;
  embedding: number[];
  text: string; // The semantic text that was embedded
}

interface PersistedIndex {
  hash: string;
  items: IndexedProduct[];
  schemaAnalysis?: CatalogSchemaAnalysis;
}

// ─── State ────────────────────────────────────────────────────────────────────

const indexes = new Map<string, IndexedProduct[]>();
const indexHashes = new Map<string, string>();
const schemaCache = new Map<string, CatalogSchemaAnalysis>();
const indexBuilding = new Map<string, Promise<void>>();

// ─── Persistence ─────────────────────────────────────────────────────────────

const CACHE_DIR = path.join(process.cwd(), ".index-cache");

function cacheFilePath(accountId: string): string {
  return path.join(CACHE_DIR, `${accountId}.json`);
}

function saveIndexToDisk(accountId: string, hash: string, items: IndexedProduct[], schemaAnalysis?: CatalogSchemaAnalysis): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    const data: PersistedIndex = { hash, items, schemaAnalysis };
    fs.writeFileSync(cacheFilePath(accountId), JSON.stringify(data), "utf-8");
    console.log(`[semantic-search] Index persisted for account ${accountId}`);
  } catch (err) {
    console.warn("[semantic-search] Failed to persist index:", err);
  }
}

function loadIndexFromDisk(accountId: string): PersistedIndex | null {
  try {
    const file = cacheFilePath(accountId);
    if (!fs.existsSync(file)) return null;
    return JSON.parse(fs.readFileSync(file, "utf-8")) as PersistedIndex;
  } catch {
    return null;
  }
}

// ─── Vector Helpers ───────────────────────────────────────────────────────────

export async function getEmbedding(text: string): Promise<number[]> {
  const result = await getEmbeddingModel().embedContent(text);
  return result.embedding.values;
}

// Embeds a batch of texts in a single API call with exponential backoff on 429/5xx.
async function batchGetEmbeddingsWithRetry(texts: string[], maxRetries = 4): Promise<number[][]> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await getEmbeddingModel().batchEmbedContents({
        requests: texts.map(text => ({ content: { role: "user", parts: [{ text }] } })),
      });
      return result.embeddings.map(e => e.values);
    } catch (err: any) {
      const isRateLimit = err?.status === 429 || String(err?.message).includes("429");
      const isServer = err?.status >= 500;
      if (attempt === maxRetries || (!isRateLimit && !isServer)) throw err;
      const delay = Math.pow(2, attempt) * 1500; // 1.5s → 3s → 6s → 12s
      console.warn(`[semantic-search] Batch embed failed (attempt ${attempt + 1}), retrying in ${delay}ms...`);
      await new Promise(r => setTimeout(r, delay));
    }
  }
  throw new Error("Max embedding retries exceeded");
}

export function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function csvHash(csvContent: string): string {
  return crypto.createHash("md5").update(csvContent).digest("hex");
}

export function getIndexHash(accountId: string): string | undefined {
  return indexHashes.get(accountId);
}

export function getSchemaAnalysis(accountId: string): CatalogSchemaAnalysis | undefined {
  return schemaCache.get(accountId);
}

export function getIndexItems(accountId: string): IndexedProduct[] {
  return indexes.get(accountId) || [];
}

export function isIndexBuilding(accountId: string): boolean {
  return indexBuilding.has(accountId);
}

/**
 * Builds (or rebuilds) the vector index for an account's product list.
 * Deduplicates concurrent builds (returns in-progress promise if called again).
 * Uses batchEmbedContents (1 API call per 100 products) with exponential backoff.
 * Uses row-level content hashing for incremental updates.
 */
export function buildIndex(
  accountId: string,
  products: Product[],
  hash: string,
  schemaAnalysis?: CatalogSchemaAnalysis
): Promise<void> {
  const inProgress = indexBuilding.get(accountId);
  if (inProgress) return inProgress;

  const promise = _doBuildIndex(accountId, products, hash, schemaAnalysis)
    .finally(() => indexBuilding.delete(accountId));

  indexBuilding.set(accountId, promise);
  return promise;
}

async function _doBuildIndex(
  accountId: string,
  products: Product[],
  hash: string,
  schemaAnalysis?: CatalogSchemaAnalysis
): Promise<void> {
  // 1. Exact CSV hash match — load from disk, no work needed
  const cached = loadIndexFromDisk(accountId);
  if (cached && cached.hash === hash) {
    indexes.set(accountId, cached.items);
    indexHashes.set(accountId, hash);
    if (cached.schemaAnalysis) schemaCache.set(accountId, cached.schemaAnalysis);
    console.log(`[semantic-search] Index loaded from disk for ${accountId} (${cached.items.length} products)`);
    return;
  }

  console.log(`[semantic-search] Updating index for ${accountId} (${products.length} products)...`);

  const indexed: IndexedProduct[] = new Array(products.length);
  const BATCH = 100;

  // 2. Incremental path — reuse embeddings for rows whose content hasn't changed
  if (cached && cached.items.length > 0) {
    const oldByRowHash = new Map<string, IndexedProduct>();
    for (const item of cached.items) {
      const rowHash = crypto.createHash("md5").update(JSON.stringify(item.product)).digest("hex");
      oldByRowHash.set(rowHash, item);
    }

    const toEmbed: { product: Product; text: string; pos: number }[] = [];

    for (let i = 0; i < products.length; i++) {
      const rowHash = crypto.createHash("md5").update(JSON.stringify(products[i])).digest("hex");
      const existing = oldByRowHash.get(rowHash);
      if (existing) {
        indexed[i] = existing;
      } else {
        toEmbed.push({ product: products[i], text: buildEmbeddingText(products[i], schemaAnalysis), pos: i });
      }
    }

    console.log(`[semantic-search] Incremental: ${products.length - toEmbed.length} reused, ${toEmbed.length} to embed`);

    for (let b = 0; b < toEmbed.length; b += BATCH) {
      if (b > 0) await new Promise(r => setTimeout(r, 300)); // avoid burst 429
      const chunk = toEmbed.slice(b, b + BATCH);
      const embeddings = await batchGetEmbeddingsWithRetry(chunk.map(c => c.text));
      chunk.forEach(({ product, text, pos }, i) => {
        indexed[pos] = { product, embedding: embeddings[i], text };
      });
    }
  } else {
    // 3. Full build from scratch — 1 API call per 100 products.
    // Partial results are published after each batch so queries work immediately.
    for (let i = 0; i < products.length; i += BATCH) {
      if (i > 0) await new Promise(r => setTimeout(r, 300)); // avoid burst 429
      const chunk = products.slice(i, i + BATCH);
      const texts = chunk.map(p => buildEmbeddingText(p, schemaAnalysis));
      const embeddings = await batchGetEmbeddingsWithRetry(texts);
      chunk.forEach((product, j) => {
        indexed[i + j] = { product, embedding: embeddings[j], text: texts[j] };
      });
      // Publish whatever is indexed so far — hasIndex becomes true after the first batch
      indexes.set(accountId, (indexed as (IndexedProduct | undefined)[]).filter((x): x is IndexedProduct => x !== undefined));
    }
  }

  indexes.set(accountId, indexed);
  indexHashes.set(accountId, hash);
  if (schemaAnalysis) schemaCache.set(accountId, schemaAnalysis);

  saveIndexToDisk(accountId, hash, indexed, schemaAnalysis);
  console.log(`\n✅ [semantic-search] CSV indexing complete for account ${accountId} — ${indexed.length} products fully indexed and ready.\n`);
}

/**
 * Returns products with their raw semantic cosine similarity scores.
 */
export async function getSemanticScores(
  queryEmbedding: number[],
  candidateItems: IndexedProduct[]
): Promise<{ product: Product; score: number }[]> {
  const scored = candidateItems.map((item) => ({
    product: item.product,
    score: cosineSimilarity(queryEmbedding, item.embedding),
  }));

  return scored;
}

export function hasIndex(accountId: string): boolean {
  const index = indexes.get(accountId);
  return !!index && index.length > 0;
}

export function clearIndex(accountId: string): void {
  indexes.delete(accountId);
  indexHashes.delete(accountId);
  schemaCache.delete(accountId);
}

export function getIndexSize(accountId: string): number {
  return indexes.get(accountId)?.length ?? 0;
}