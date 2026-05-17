import MiniSearch from "minisearch";
import crypto from "crypto";
import { Product, CatalogSchemaAnalysis, analyzeCatalogSchema } from "./schema-analysis";
import { getGeminiClient } from "../utils/gemini-client";

// ─── Types ────────────────────────────────────────────────────────────────────

interface AccountIndex {
  miniSearch: MiniSearch;
  products: Product[];
  productToIdx: Map<Product, number>; // O(1) lookup — replaces the O(n²) indexOf pattern
  hash: string;
  embeddings: number[][] | null;      // null = generation still in progress
  schemaAnalysis?: CatalogSchemaAnalysis;
  categories: string[];
}

// ─── In-memory state ──────────────────────────────────────────────────────────

const indexes = new Map<string, AccountIndex>();
const indexBuilding = new Map<string, Promise<void>>();

// ─── Field configuration ──────────────────────────────────────────────────────

/** BM25: skip IDs, URLs, images */
const BM25_SKIP = /^(_?id$|sku|url|link|image|img|foto|hash|uuid)/i;

/**
 * Embeddings: skip IDs, URLs, images AND structured fields (price, stock, code).
 * We want embeddings to capture semantic meaning only — not numbers that belong
 * in the metadata-filter layer.
 */
const EMBED_SKIP = /^(_?id$|sku|url|link|image|img|foto|hash|uuid|price|preco|valor|stock|estoque|quantidade|codigo|code|ref|cep|cnpj|cpf)/i;

/** Name/title fields get 2× BM25 boost */
const BOOST_FIELDS = new Set([
  "name", "nome", "produto", "title", "titulo",
  "product_name", "item_name", "description", "descricao", "descricção",
]);

const CATEGORY_FIELDS = [
  "category", "categoria", "department", "departamento", "tipo", "type",
];

function getBm25Fields(product: Product): string[] {
  return Object.keys(product).filter(k => !BM25_SKIP.test(k));
}

function buildBoosts(fields: string[]): Record<string, number> {
  const boost: Record<string, number> = {};
  for (const f of fields) {
    if (BOOST_FIELDS.has(f.toLowerCase())) boost[f] = 2;
  }
  return boost;
}

/**
 * Builds a single string from semantic product fields for embedding.
 * Excludes structured/numeric fields that belong in metadata filters.
 */
function buildEmbeddingText(product: Product): string {
  return Object.entries(product)
    .filter(([k, v]) => !EMBED_SKIP.test(k) && v !== null && v !== undefined && v !== "")
    .map(([, v]) => String(v))
    .join(" ")
    .slice(0, 2000); // cap to avoid token limit issues
}

// ─── Cosine similarity ────────────────────────────────────────────────────────

function cosineSimilarity(a: number[], b: number[]): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot  += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  const denom = Math.sqrt(normA) * Math.sqrt(normB);
  return denom === 0 ? 0 : dot / denom;
}

// ─── Embedding generation ─────────────────────────────────────────────────────

const BATCH_SIZE = 100;
const BATCH_DELAY_MS = 250; // avoid rate-limiting between batches

async function generateEmbeddingsBatched(texts: string[]): Promise<number[][]> {
  const model = getGeminiClient().getGenerativeModel({ model: "text-embedding-004" });
  const results: number[][] = [];

  for (let i = 0; i < texts.length; i += BATCH_SIZE) {
    const batch = texts.slice(i, i + BATCH_SIZE);

    const batchResult = await model.batchEmbedContents({
      requests: batch.map(text => ({
        content: { role: "user" as const, parts: [{ text }] },
        taskType: "RETRIEVAL_DOCUMENT" as never,
      })),
    });

    for (const emb of batchResult.embeddings) {
      results.push(emb.values);
    }

    if (i + BATCH_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  return results;
}

async function embedQuery(query: string): Promise<number[]> {
  const model = getGeminiClient().getGenerativeModel({ model: "text-embedding-004" });
  const result = await model.embedContent({
    content: { role: "user", parts: [{ text: query }] },
    taskType: "RETRIEVAL_QUERY" as never,
  });
  return result.embedding.values;
}

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

export function getIndexHash(accountId: string): string | undefined {
  return indexes.get(accountId)?.hash;
}

export function getIndexSize(accountId: string): number {
  return indexes.get(accountId)?.products.length ?? 0;
}

export function getAllProducts(accountId: string): Product[] {
  return indexes.get(accountId)?.products ?? [];
}

export function getSchemaAnalysis(accountId: string): CatalogSchemaAnalysis | undefined {
  return indexes.get(accountId)?.schemaAnalysis;
}

export function getCatalogCategories(accountId: string): string[] {
  return indexes.get(accountId)?.categories ?? [];
}

/**
 * Returns a diverse sample — one product per distinct category where possible,
 * filling remaining slots from the top of the catalog.
 * Used for meta-questions like "what do you carry?" so Gemini has real context.
 */
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

  const fields = getBm25Fields(products[0]);
  const boosts = buildBoosts(fields);

  console.log(`[index] Building BM25 for ${accountId} — ${products.length} products, fields: ${fields.join(", ")}`);

  const miniSearch = new MiniSearch({
    idField: "_idx",
    fields,
    storeFields: ["_idx"],
    searchOptions: {
      boost: boosts,
      fuzzy: 0.25,  // ~1 typo per 4 chars — catches "jbç" → "jbl", "headsset" → "headset"
      prefix: true, // "teni" → "tenis"
      combineWith: "OR",
    },
  });

  const docs = products.map((p, i) => {
    const doc: Record<string, unknown> = { _idx: i };
    for (const f of fields) {
      const v = p[f];
      if (v !== undefined && v !== null && v !== "") {
        doc[f] = typeof v === "number" ? v : String(v);
      }
    }
    return doc;
  });

  await miniSearch.addAllAsync(docs, { chunkSize: 500 });

  // O(1) product → index map (fixes the previous O(n²) indexOf pattern)
  const productToIdx = new Map<Product, number>();
  for (let i = 0; i < products.length; i++) {
    productToIdx.set(products[i], i);
  }

  // Extract unique category values
  const categorySet = new Set<string>();
  for (const p of products) {
    for (const f of CATEGORY_FIELDS) {
      const v = p[f];
      if (typeof v === "string" && v.trim()) { categorySet.add(v.trim()); break; }
    }
  }

  // Store BM25 index immediately — chat requests can start being served now
  indexes.set(accountId, {
    miniSearch,
    products,
    productToIdx,
    hash,
    embeddings: null, // will be filled in background
    categories: [...categorySet],
  });

  console.log(`[index] BM25 ready for ${accountId} — ${products.length} products, ${categorySet.size} categories: ${[...categorySet].join(", ")}`);

  // Generate embeddings in the background — does not block the first chat response
  _generateEmbeddings(accountId, products, hash).catch(err => {
    console.error(`[index] Embedding generation failed for ${accountId}:`, err);
  });

  // Schema analysis also in background — used only by metadata-ranker
  analyzeCatalogSchema(products[0])
    .then(schema => {
      const idx = indexes.get(accountId);
      if (idx && idx.hash === hash) {
        idx.schemaAnalysis = schema;
        console.log(`[index] Schema analysis cached for ${accountId}`);
      }
    })
    .catch(() => {});
}

async function _generateEmbeddings(
  accountId: string,
  products: Product[],
  hash: string,
): Promise<void> {
  const batchCount = Math.ceil(products.length / BATCH_SIZE);
  console.log(`[index] Generating embeddings for ${accountId} — ${products.length} products (${batchCount} batches)...`);

  const texts = products.map(buildEmbeddingText);
  const embeddings = await generateEmbeddingsBatched(texts);

  const idx = indexes.get(accountId);
  if (idx && idx.hash === hash) {
    idx.embeddings = embeddings;
    console.log(`[index] Embeddings ready for ${accountId} (${embeddings.length} vectors, dim=${embeddings[0]?.length ?? 0})`);
  }
}

// ─── Internal BM25 search ─────────────────────────────────────────────────────

function _bm25Search(
  idx: AccountIndex,
  query: string,
  candidateIndices: Set<number> | undefined,
  topK: number,
): Array<{ productIdx: number; score: number }> {
  const searchOpts: Record<string, unknown> = {};
  if (candidateIndices) {
    searchOpts["filter"] = (r: { [k: string]: unknown }) =>
      candidateIndices.has(r["_idx"] as number);
  }
  const results = idx.miniSearch.search(query, searchOpts as never);
  return results.slice(0, topK).map(r => ({
    productIdx: r["_idx"] as number,
    score: r.score as number,
  }));
}

// ─── Hybrid search (BM25 + vector) ───────────────────────────────────────────

/**
 * Hybrid BM25 + semantic vector search.
 *
 * Strategy:
 *  1. BM25 search over candidates (wider pool = topK × 3)
 *  2. If embeddings are ready: compute cosine similarity for all candidates
 *  3. Combine scores: alpha × BM25 + (1 - alpha) × cosine
 *  4. If embeddings not ready yet: fall back to BM25 only (graceful degradation)
 *
 * @param candidates  Pre-filtered products from metadata-filter (or allProducts if no filters).
 * @param topK        Max results to return.
 * @param alpha       BM25 weight in [0, 1]. Default 0.4 — vectors carry more weight.
 */
export async function hybridSearch(
  accountId: string,
  query: string,
  candidates: Product[],
  topK = 20,
  alpha = 0.4,
): Promise<Product[]> {
  const idx = indexes.get(accountId);
  if (!idx) return [];

  const isFullCatalog = candidates.length === idx.products.length;

  // Build candidate index set in O(|candidates|) using the productToIdx map
  const candidateIndices = isFullCatalog
    ? undefined
    : new Set(
        candidates
          .map(p => idx.productToIdx.get(p))
          .filter((i): i is number => i !== undefined),
      );

  // BM25 — wider pool for better recall before vector fusion
  const bm25Pool = Math.min(topK * 3, idx.products.length);
  const bm25Results = _bm25Search(idx, query, candidateIndices, bm25Pool);

  // ── Fallback: no embeddings yet ───────────────────────────────────────────
  if (!idx.embeddings) {
    console.log(`[search] Embeddings not ready for ${accountId} — using BM25 only`);
    return bm25Results.slice(0, topK).map(r => idx.products[r.productIdx]);
  }

  // ── Generate query embedding ──────────────────────────────────────────────
  let queryEmbedding: number[];
  try {
    queryEmbedding = await embedQuery(query);
  } catch (err) {
    console.warn(`[search] Query embedding failed, falling back to BM25:`, err);
    return bm25Results.slice(0, topK).map(r => idx.products[r.productIdx]);
  }

  // Normalize BM25 scores to [0, 1]
  const maxBm25 = bm25Results.length > 0 ? bm25Results[0].score : 1;
  const bm25ScoreMap = new Map<number, number>();
  for (const r of bm25Results) {
    bm25ScoreMap.set(r.productIdx, r.score / Math.max(maxBm25, 1));
  }

  // ── Score all candidates with hybrid score ────────────────────────────────
  const candidateList = isFullCatalog ? idx.products : candidates;
  const scored: Array<{ productIdx: number; score: number }> = [];

  for (const product of candidateList) {
    const productIdx = idx.productToIdx.get(product);
    if (productIdx === undefined) continue;

    const embedding = idx.embeddings[productIdx];
    if (!embedding) continue;

    const vecScore  = cosineSimilarity(queryEmbedding, embedding);
    const bm25Score = bm25ScoreMap.get(productIdx) ?? 0;
    const finalScore = alpha * bm25Score + (1 - alpha) * vecScore;

    scored.push({ productIdx, score: finalScore });
  }

  scored.sort((a, b) => b.score - a.score);
  return scored.slice(0, topK).map(s => idx.products[s.productIdx]);
}

// ─── Cache management ─────────────────────────────────────────────────────────

export function clearIndex(accountId: string): void {
  indexes.delete(accountId);
}

// Kept async for API compatibility
export async function clearDiskIndex(accountId: string): Promise<void> {
  clearIndex(accountId);
}

export async function clearAllDiskIndexes(): Promise<void> {
  indexes.clear();
}
