import MiniSearch from "minisearch";
import crypto from "crypto";
import type { Product } from "../lib/csv";
import { getGeminiClient } from "../lib/gemini";
import { buildProductText, embedQuery, embedProductsBatched } from "./embeddings";
import { loadEmbeddingsCache, saveEmbeddingsCache } from "./cache";
import { buildBm25Index, searchBm25, buildVectorIndex, searchVector, type VectorIndex, hybridRank, logHybridResults, DEFAULT_ALPHA } from "./search";
import { CATEGORY_FIELDS, NAME_FIELDS, firstValue } from "./fields";

// ─── Types ────────────────────────────────────────────────────────────────────

interface CatalogSchemaAnalysis {
  ranking_fields: string[];
}

interface AccountIndex {
  miniSearch: MiniSearch;
  vectorIndex: VectorIndex | null;
  products: Product[];
  productToIdx: Map<Product, number>;
  hash: string;
  embeddings: number[][] | null;
  schemaAnalysis?: CatalogSchemaAnalysis;
  categories: string[];
}

// ─── In-memory state ──────────────────────────────────────────────────────────

const indexes = new Map<string, AccountIndex>();
const indexBuilding = new Map<string, Promise<void>>();

// ─── Public accessors ─────────────────────────────────────────────────────────

export function csvHash(csvContent: string): string {
  return crypto.createHash("md5").update(csvContent).digest("hex");
}

export function hasIndex(accountId: string): boolean {
  const idx = indexes.get(accountId);
  return !!idx && idx.products.length > 0;
}

export function isIndexBuilding(accountId: string): boolean {
  return indexBuilding.has(accountId);
}

export function hasVectorIndex(accountId: string): boolean {
  return indexes.get(accountId)?.vectorIndex != null;
}

export function getIndexHash(accountId: string): string | undefined {
  return indexes.get(accountId)?.hash;
}

export function getIndexSize(accountId: string): number {
  return indexes.get(accountId)?.products.length ?? 0;
}

export function getAllProducts(accountId: string): Product[] {
  return indexes.get(accountId)?.products ?? [];
}

export function getCatalogCategories(accountId: string): string[] {
  return indexes.get(accountId)?.categories ?? [];
}

export function getSchemaRankingFields(accountId: string): string[] {
  return indexes.get(accountId)?.schemaAnalysis?.ranking_fields ?? [];
}

export function getCatalogSample(accountId: string, n = 20): Product[] {
  const idx = indexes.get(accountId);
  if (!idx || idx.products.length === 0) return [];

  const seenCategories = new Set<string>();
  const sample: Product[] = [];

  for (const p of idx.products) {
    if (sample.length >= n) break;
    let cat = "__none__";
    for (const f of CATEGORY_FIELDS) {
      const v = p[f];
      if (typeof v === "string" && v.trim()) { cat = v.trim().toLowerCase(); break; }
    }
    if (!seenCategories.has(cat)) {
      seenCategories.add(cat);
      sample.push(p);
    }
  }

  for (const p of idx.products) {
    if (sample.length >= n) break;
    if (!sample.includes(p)) sample.push(p);
  }

  return sample;
}

// ─── Index building ───────────────────────────────────────────────────────────

export function buildIndex(
  accountId: string,
  products: Product[],
  hash: string,
): Promise<void> {
  const inProgress = indexBuilding.get(accountId);
  if (inProgress) return inProgress;

  const promise = _doBuildIndex(accountId, products, hash)
    .finally(() => indexBuilding.delete(accountId));

  indexBuilding.set(accountId, promise);
  return promise;
}

async function _doBuildIndex(
  accountId: string,
  products: Product[],
  hash: string,
): Promise<void> {
  const existing = indexes.get(accountId);
  if (existing && existing.hash === hash) {
    console.log(`[index] Up-to-date for ${accountId} (${products.length} products)`);
    return;
  }

  if (products.length === 0) {
    console.warn(`[index] buildIndex called with 0 products for ${accountId}`);
    return;
  }

  console.log(`[index] Building for ${accountId} — ${products.length} products`);
  const t0 = Date.now();

  const miniSearch = await buildBm25Index(products);

  const productToIdx = new Map<Product, number>();
  for (let i = 0; i < products.length; i++) {
    productToIdx.set(products[i], i);
  }

  const categorySet = new Set<string>();
  for (const p of products) {
    for (const f of CATEGORY_FIELDS) {
      const v = p[f];
      if (typeof v === "string" && v.trim()) { categorySet.add(v.trim()); break; }
    }
  }

  indexes.set(accountId, {
    miniSearch,
    vectorIndex: null,
    products,
    productToIdx,
    hash,
    embeddings: null,
    categories: [...categorySet],
  });

  console.log(
    `[index] BM25 ready for ${accountId} in ${Date.now() - t0}ms ` +
    `— ${products.length} products, ${categorySet.size} categories`
  );

  _buildVectorIndexInBackground(accountId, products, hash).catch(err => {
    console.error(`[index] Embedding/vector index failed for ${accountId}:`, err);
  });

  _detectSchemaInBackground(accountId, products, hash).catch(() => {});
}

async function _buildVectorIndexInBackground(
  accountId: string,
  products: Product[],
  hash: string,
): Promise<void> {
  const t0 = Date.now();

  // Tenta carregar embeddings do disco antes de chamar a API
  let embeddings = loadEmbeddingsCache(hash, products.length);

  if (!embeddings) {
    console.log(`[index] Gerando embeddings para ${accountId} (${products.length} produtos)...`);
    const texts = products.map(buildProductText);
    embeddings = await embedProductsBatched(texts);
    saveEmbeddingsCache(hash, embeddings);
  } else {
    console.log(`[index] Cache hit — embeddings prontos sem chamada à API`);
  }

  const idx = indexes.get(accountId);
  if (!idx || idx.hash !== hash) return;

  idx.embeddings = embeddings;
  idx.vectorIndex = buildVectorIndex(embeddings);

  console.log(
    `[index] Vector index ready for ${accountId} in ${Date.now() - t0}ms ` +
    `(${embeddings.length} vectors)`
  );
}

async function _detectSchemaInBackground(
  accountId: string,
  products: Product[],
  hash: string,
): Promise<void> {
  const schema = await _analyzeCatalogSchema(products[0]);
  const idx = indexes.get(accountId);
  if (idx && idx.hash === hash) {
    idx.schemaAnalysis = schema;
    console.log(`[index] Schema analysis ready for ${accountId}:`, schema);
  }
}

// Asks Gemini to identify numeric fields that represent popularity/sales volume.
// Runs once per account in background — not on the critical path.
async function _analyzeCatalogSchema(sampleProduct: Product): Promise<CatalogSchemaAnalysis> {
  const model = getGeminiClient().getGenerativeModel({ model: "gemini-2.5-flash" });

  const prompt = `Analyze this e-commerce product schema and identify numeric fields that represent popularity or sales volume (e.g. sold_count, views, clicks, popularity_score, num_reviews).

Do NOT include: price, stock quantity, IDs, rating/stars (those are handled separately).
Return an empty array if no such fields exist.

Return ONLY valid JSON:
{"ranking_fields": ["field1", "field2"]}

Product schema:
${JSON.stringify(sampleProduct, null, 2)}`;

  try {
    const result = await model.generateContent({
      contents: [{ role: "user", parts: [{ text: prompt }] }],
      generationConfig: { responseMimeType: "application/json" },
    });
    const parsed = JSON.parse(result.response.text());
    return {
      ranking_fields: Array.isArray(parsed.ranking_fields) ? parsed.ranking_fields : [],
    };
  } catch {
    return { ranking_fields: [] };
  }
}

// ─── Hybrid search ────────────────────────────────────────────────────────────

export async function hybridSearch(
  accountId: string,
  query: string,
  candidates: Product[],
  topK = 20,
  alpha = DEFAULT_ALPHA,
): Promise<Product[]> {
  const idx = indexes.get(accountId);
  if (!idx) return [];

  const t0 = Date.now();
  const isFullCatalog = candidates.length === idx.products.length;

  const candidateIndices: Set<number> | undefined = isFullCatalog
    ? undefined
    : new Set(
        candidates
          .map(p => idx.productToIdx.get(p))
          .filter((i): i is number => i !== undefined),
      );

  const bm25PoolSize = Math.min(topK * 3, idx.products.length);
  const bm25Results = searchBm25(idx.miniSearch, query, candidateIndices, bm25PoolSize);

  if (!idx.embeddings || !idx.vectorIndex) {
    console.log(`[search] Embeddings not ready for ${accountId} — BM25 only`);
    return bm25Results.slice(0, topK).map(r => idx.products[r.productIdx]);
  }

  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedQuery(query);
  } catch (err) {
    console.warn(`[search] Query embedding failed, falling back to BM25:`, err);
    return bm25Results.slice(0, topK).map(r => idx.products[r.productIdx]);
  }

  let vectorResults: Array<{ productIdx: number; score: number }>;

  if (isFullCatalog) {
    vectorResults = searchVector(idx.vectorIndex, queryEmbedding, bm25PoolSize);
  } else {
    const candidateIdxArr = [...(candidateIndices ?? [])];
    const subsetEmbeddings = candidateIdxArr
      .map(i => idx.embeddings![i])
      .filter((e): e is number[] => e != null);
    const tempIndex = buildVectorIndex(subsetEmbeddings, candidateIdxArr);
    vectorResults = searchVector(tempIndex, queryEmbedding, bm25PoolSize);
  }

  const hybridResults = hybridRank(bm25Results, vectorResults, topK, alpha);

  console.log(
    `[search] Hybrid "${query.slice(0, 40)}" — ` +
    `bm25=${bm25Results.length} vec=${vectorResults.length} ` +
    `→ top${hybridResults.length} in ${Date.now() - t0}ms ` +
    `(alpha=${alpha}, ${isFullCatalog ? "full-catalog FAISS" : "filtered cosine"})`
  );

  logHybridResults(hybridResults, idx.products as Array<{ [k: string]: unknown }>);

  return hybridResults.map(r => idx.products[r.productIdx]);
}

// ─── Exact product lookup ─────────────────────────────────────────────────────

/**
 * Tries to find an exact product match for a specific product request.
 *
 * Strategy: BM25 candidates → check if the product name contains ALL
 * significant terms from `specificProduct` (brand + model tokens).
 * Returns the first matching product, or null if not found in catalog.
 */
export function findExactProduct(
  accountId: string,
  specificProduct: string,
): Product | null {
  const idx = indexes.get(accountId);
  if (!idx) return null;

  // Tokenize: keep meaningful terms, drop short stopwords
  const STOPWORDS = new Set(["de", "do", "da", "o", "a", "um", "uma", "para", "com", "e", "ou", "os", "as", "no", "na"]);
  const terms = specificProduct
    .toLowerCase()
    .split(/\s+/)
    .filter(t => t.length > 1 && !STOPWORDS.has(t));

  if (terms.length === 0) return null;

  // BM25 gives us the most lexically similar products
  const bm25 = searchBm25(idx.miniSearch, specificProduct, undefined, 10);

  for (const r of bm25.slice(0, 5)) {
    const product = idx.products[r.productIdx];
    const name = String(firstValue(product, NAME_FIELDS) ?? "").toLowerCase();

    // All key terms must appear in the product name
    if (terms.every(t => name.includes(t))) {
      return product;
    }
  }

  return null;
}

// ─── Cache management ─────────────────────────────────────────────────────────

export function clearIndex(accountId: string): void {
  indexes.delete(accountId);
}

export async function clearAllIndexes(): Promise<void> {
  indexes.clear();
}
