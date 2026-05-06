import { GoogleGenerativeAI } from "@google/generative-ai";
import fs from "fs";
import path from "path";
import crypto from "crypto";

// ─── Lazy model init ──────────────────────────────────────────────────────────

function getEmbeddingModel() {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in environment variables.");
  return new GoogleGenerativeAI(key).getGenerativeModel({ model: "gemini-embedding-001" });
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface Product {
  [key: string]: string;
}

interface IndexedProduct {
  product: Product;
  embedding: number[];
  text: string;
}

interface PersistedIndex {
  hash: string;
  items: IndexedProduct[];
}

// ─── State ────────────────────────────────────────────────────────────────────

const indexes     = new Map<string, IndexedProduct[]>();
const indexHashes = new Map<string, string>();

// ─── Persistence ─────────────────────────────────────────────────────────────

const CACHE_DIR = path.join(process.cwd(), ".index-cache");

function cacheFilePath(accountId: string): string {
  return path.join(CACHE_DIR, `${accountId}.json`);
}

function saveIndexToDisk(accountId: string, hash: string, items: IndexedProduct[]): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) fs.mkdirSync(CACHE_DIR, { recursive: true });
    const data: PersistedIndex = { hash, items };
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

// ─── Helpers ──────────────────────────────────────────────────────────────────

function productToText(product: Product): string {
  return Object.entries(product)
    .filter(([, v]) => v && v.trim())
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ");
}

async function getEmbedding(text: string): Promise<number[]> {
  const result = await getEmbeddingModel().embedContent(text);
  return result.embedding.values;
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot   += a[i] * b[i];
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

/**
 * Builds (or rebuilds) the vector index for an account's product list.
 * Tries to load from disk first — only calls the embedding API if needed.
 * Persists the result to disk after building.
 */
export async function buildIndex(
  accountId: string,
  products: Product[],
  hash: string
): Promise<void> {
  // 1. Try loading from disk cache
  const cached = loadIndexFromDisk(accountId);
  if (cached && cached.hash === hash) {
    indexes.set(accountId, cached.items);
    indexHashes.set(accountId, hash);
    console.log(`[semantic-search] Index loaded from disk for account ${accountId} (${cached.items.length} products)`);
    return;
  }

  // 2. Build fresh index via embedding API
  console.log(`[semantic-search] Building new index for account ${accountId}...`);
  const BATCH = 20;
  const indexed: IndexedProduct[] = [];

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (product) => {
        const text = productToText(product);
        const embedding = await getEmbedding(text);
        return { product, embedding, text };
      })
    );
    indexed.push(...results);
  }

  indexes.set(accountId, indexed);
  indexHashes.set(accountId, hash);
  saveIndexToDisk(accountId, hash, indexed);
  console.log(`[semantic-search] Index built for account ${accountId}: ${indexed.length} products`);
}

/**
 * Returns the top-k most relevant products for a given query.
 * topK is auto-adjusted for small catalogs.
 */
export async function searchProducts(
  accountId: string,
  query: string,
  topK = 8
): Promise<Product[]> {
  const index = indexes.get(accountId);

  if (!index || index.length === 0) return [];

  // Small catalog — return everything, no need for semantic filtering
  const effectiveTopK = Math.min(topK, index.length);
  if (index.length <= effectiveTopK) return index.map((i) => i.product);

  const queryEmbedding = await getEmbedding(query);

  const scored = index.map((item) => ({
    product: item.product,
    score: cosineSimilarity(queryEmbedding, item.embedding),
  }));

  scored.sort((a, b) => b.score - a.score);

  return scored.slice(0, effectiveTopK).map((s) => s.product);
}

/** Checks if a valid in-memory index exists for the given account. */
export function hasIndex(accountId: string): boolean {
  const index = indexes.get(accountId);
  return !!index && index.length > 0;
}

/** Clears in-memory index (disk cache is preserved). */
export function clearIndex(accountId: string): void {
  indexes.delete(accountId);
  indexHashes.delete(accountId);
}


/** Returns the number of products in the index for an account. */
export function getIndexSize(accountId: string): number {
  return indexes.get(accountId)?.length ?? 0;
}