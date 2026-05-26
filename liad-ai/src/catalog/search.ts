import MiniSearch from "minisearch";
import type { Product } from "../lib/csv";
import { SKIP_BM25_RE, BM25_BOOST_FIELDS, NAME_FIELDS } from "./fields";

// ─── FAISS dynamic import ─────────────────────────────────────────────────────

interface FaissIndexFlatIP {
  add(vectors: number[]): void;
  search(query: number[], k: number): { distances: number[]; labels: number[] };
  ntotal: number;
}

interface FaissModule {
  IndexFlatIP: new (dimension: number) => FaissIndexFlatIP;
}

let faissModule: FaissModule | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  faissModule = require("faiss-node") as FaissModule;
  console.log("[faiss] Native bindings loaded ✓");
} catch {
  console.warn("[faiss] faiss-node not available — using cosine fallback");
}

// ─── Vector index ─────────────────────────────────────────────────────────────
// VectorIndex is an opaque handle — callers never see FAISS or cosine internals.

export interface VectorIndex {
  search(queryEmbedding: number[], k: number): Array<{ productIdx: number; score: number }>;
  readonly size: number;
  readonly dimension: number;
}

class _VectorIndexImpl implements VectorIndex {
  private faissIdx: FaissIndexFlatIP | null = null;
  private rawEmbeddings: number[][] | null = null;
  private readonly productIndices: number[];

  readonly dimension: number;
  readonly backend: "faiss" | "cosine";

  constructor(embeddings: number[][], productIndices: number[]) {
    this.productIndices = productIndices;
    this.dimension = embeddings[0]?.length ?? 0;

    if (faissModule && this.dimension > 0) {
      try {
        this.faissIdx = new faissModule.IndexFlatIP(this.dimension);
        this.faissIdx.add(embeddings.flatMap(v => normalizeL2(v)));
        this.backend = "faiss";
      } catch (err) {
        console.warn("[faiss] Index build failed, falling back to cosine:", err);
        this.rawEmbeddings = embeddings;
        this.backend = "cosine";
      }
    } else {
      this.rawEmbeddings = embeddings;
      this.backend = "cosine";
    }
  }

  search(queryEmbedding: number[], k: number): Array<{ productIdx: number; score: number }> {
    const actualK = Math.min(k, this.productIndices.length);
    if (actualK === 0) return [];
    return this.faissIdx
      ? this._faissSearch(queryEmbedding, actualK)
      : this._cosineSearch(queryEmbedding, actualK);
  }

  private _faissSearch(q: number[], k: number): Array<{ productIdx: number; score: number }> {
    const { distances, labels } = this.faissIdx!.search(normalizeL2(q), k);
    const out: Array<{ productIdx: number; score: number }> = [];
    for (let i = 0; i < labels.length; i++) {
      const pos = labels[i];
      if (pos < 0 || pos >= this.productIndices.length) continue;
      out.push({ productIdx: this.productIndices[pos], score: Math.max(0, Math.min(1, distances[i])) });
    }
    return out;
  }

  private _cosineSearch(q: number[], k: number): Array<{ productIdx: number; score: number }> {
    if (!this.rawEmbeddings) return [];
    const scored = this.rawEmbeddings.map((emb, i) => ({
      productIdx: this.productIndices[i],
      score: cosineSimilarity(q, emb),
    }));
    scored.sort((a, b) => b.score - a.score);
    return scored.slice(0, k);
  }

  get size(): number { return this.productIndices.length; }
}

export function buildVectorIndex(
  allEmbeddings: number[][],
  candidateIndices?: number[],
): VectorIndex {
  const indices = candidateIndices ?? allEmbeddings.map((_, i) => i);
  const valid = indices
    .map(i => ({ emb: allEmbeddings[i], idx: i }))
    .filter((x): x is { emb: number[]; idx: number } => x.emb != null && x.emb.length > 0);

  const impl = new _VectorIndexImpl(valid.map(x => x.emb), valid.map(x => x.idx));
  console.log(
    `[vector] Index built: ${impl.size} vectors, ` +
    `dim=${valid[0]?.emb.length ?? 0}, backend=${impl.backend}`,
  );
  return impl;
}

export function searchVector(
  index: VectorIndex,
  queryEmbedding: number[],
  k: number,
): Array<{ productIdx: number; score: number }> {
  if (index.dimension > 0 && queryEmbedding.length !== index.dimension) {
    console.error(
      `[vector] Dimension mismatch: query=${queryEmbedding.length}, index=${index.dimension} — ` +
      `verifique se outputDimensionality é consistente em embedQuery e embedProductsBatched`,
    );
    return [];
  }

  const t0 = Date.now();
  const results = index.search(queryEmbedding, k);
  console.log(
    `[vector] search k=${k} → ${results.length} results in ${Date.now() - t0}ms` +
    (results[0] ? `, top=${results[0].score.toFixed(4)}` : ""),
  );
  return results;
}

// ─── BM25 index ───────────────────────────────────────────────────────────────

function getIndexableFields(product: Product): string[] {
  return Object.keys(product).filter(k => !SKIP_BM25_RE.test(k));
}

function buildFieldBoosts(fields: string[]): Record<string, number> {
  const boost: Record<string, number> = {};
  for (const f of fields) {
    if (BM25_BOOST_FIELDS.has(f.toLowerCase())) boost[f] = 2;
  }
  return boost;
}

export async function buildBm25Index(products: Product[]): Promise<MiniSearch> {
  if (products.length === 0) return new MiniSearch({ fields: [] });

  const fields = getIndexableFields(products[0]);
  const boosts = buildFieldBoosts(fields);

  const miniSearch = new MiniSearch({
    idField: "_idx",
    fields,
    storeFields: ["_idx"],
    searchOptions: {
      boost: boosts,
      fuzzy: 0.25,
      prefix: true,
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
  console.log(`[bm25] Index built: ${products.length} products, fields=[${fields.join(", ")}]`);
  return miniSearch;
}

export function searchBm25(
  miniSearch: MiniSearch,
  query: string,
  candidateIndices: Set<number> | undefined,
  topK: number,
): Array<{ productIdx: number; score: number }> {
  const opts: Record<string, unknown> = {};
  if (candidateIndices) {
    opts["filter"] = (r: { [k: string]: unknown }) => candidateIndices.has(r["_idx"] as number);
  }
  const results = miniSearch.search(query, opts as never);
  return results.slice(0, topK).map(r => ({
    productIdx: r["_idx"] as number,
    score: r.score as number,
  }));
}

// ─── Hybrid ranking ───────────────────────────────────────────────────────────

export const DEFAULT_ALPHA = 0.3;

export interface HybridScoredResult {
  productIdx: number;
  semanticScore: number;
  lexicalScore: number;
  finalScore: number;
}

export function hybridRank(
  bm25Results: Array<{ productIdx: number; score: number }>,
  vectorResults: Array<{ productIdx: number; score: number }>,
  topK: number,
  alpha = DEFAULT_ALPHA,
): HybridScoredResult[] {
  const maxBm25 = bm25Results[0]?.score ?? 1;
  const lexicalMap = new Map<number, number>();
  for (const r of bm25Results) {
    lexicalMap.set(r.productIdx, r.score / Math.max(maxBm25, 1));
  }

  const semanticMap = new Map<number, number>();
  for (const r of vectorResults) {
    semanticMap.set(r.productIdx, r.score);
  }

  const combined: HybridScoredResult[] = [];
  for (const productIdx of new Set([...lexicalMap.keys(), ...semanticMap.keys()])) {
    const semanticScore = semanticMap.get(productIdx) ?? 0;
    const lexicalScore  = lexicalMap.get(productIdx) ?? 0;
    combined.push({
      productIdx,
      semanticScore,
      lexicalScore,
      finalScore: (1 - alpha) * semanticScore + alpha * lexicalScore,
    });
  }

  combined.sort((a, b) => b.finalScore - a.finalScore);
  return combined.slice(0, topK);
}

export function logHybridResults(
  results: HybridScoredResult[],
  products: Array<{ [k: string]: unknown }>,
  n = 5,
): void {
  for (const r of results.slice(0, n)) {
    const p = products[r.productIdx];
    const name = NAME_FIELDS.map(f => p?.[f]).find(v => typeof v === "string") ?? `idx=${r.productIdx}`;
    console.log(
      `[hybrid] #${r.productIdx} "${String(name).slice(0, 35).padEnd(35)}" ` +
      `sem=${r.semanticScore.toFixed(3)} lex=${r.lexicalScore.toFixed(3)} ` +
      `final=${r.finalScore.toFixed(3)}`,
    );
  }
}

// ─── Math helpers (module-private) ───────────────────────────────────────────

function normalizeL2(v: number[]): number[] {
  let norm = 0;
  for (const x of v) norm += x * x;
  norm = Math.sqrt(norm);
  return norm === 0 ? v : v.map(x => x / norm);
}

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
