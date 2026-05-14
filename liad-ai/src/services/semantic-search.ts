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

/**
 * Builds (or rebuilds) the vector index for an account's product list.
 * Utilizes schema analysis and embedding builder for cleaner vectors.
 */
export async function buildIndex(
  accountId: string,
  products: Product[],
  hash: string,
  schemaAnalysis?: CatalogSchemaAnalysis
): Promise<void> {
  // 1. Try loading from disk cache
  const cached = loadIndexFromDisk(accountId);
  if (cached && cached.hash === hash) {
    indexes.set(accountId, cached.items);
    indexHashes.set(accountId, hash);
    if (cached.schemaAnalysis) {
      schemaCache.set(accountId, cached.schemaAnalysis);
    }
    console.log(`[semantic-search] Index loaded from disk for account ${accountId} (${cached.items.length} products)`);
    return;
  }

  // 2. Build fresh index via embedding API
  console.log(`[semantic-search] Building new index for account ${accountId}...`);
  const BATCH = 100;
  const indexed: IndexedProduct[] = [];

  for (let i = 0; i < products.length; i += BATCH) {
    const batch = products.slice(i, i + BATCH);
    const results = await Promise.all(
      batch.map(async (product) => {
        const text = buildEmbeddingText(product, schemaAnalysis);
        const embedding = await getEmbedding(text);
        return { product, embedding, text };
      })
    );
    indexed.push(...results);
  }

  indexes.set(accountId, indexed);
  indexHashes.set(accountId, hash);
  if (schemaAnalysis) schemaCache.set(accountId, schemaAnalysis);

  saveIndexToDisk(accountId, hash, indexed, schemaAnalysis);
  console.log(`[semantic-search] Index built for account ${accountId}: ${indexed.length} products`);
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