import { getGeminiClient } from "../lib/gemini";
import type { Product } from "../lib/csv";
import { SKIP_EMBED_RE, NAME_FIELDS, firstValue } from "./fields";

// ─── Batch config ─────────────────────────────────────────────────────────────

export const EMBEDDING_BATCH_SIZE = 100;
const BATCH_DELAY_MS = 250;
const MODEL = "gemini-embedding-2";
const OUTPUT_DIM = 768;

// ─── Retry ────────────────────────────────────────────────────────────────────

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastErr: unknown;
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastErr = err;
      if (attempt < maxRetries) {
        const delay = Math.min(1000 * Math.pow(2, attempt), 8000);
        console.warn(`[embeddings] Retry ${attempt + 1}/${maxRetries} in ${delay}ms — ${err}`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }
  throw lastErr;
}

// ─── Product text builder ─────────────────────────────────────────────────────

export function buildProductText(product: Product): string {
  const title = String(firstValue(product, NAME_FIELDS) ?? "none");

  const body = Object.entries(product)
    .filter(([k, v]) =>
      !SKIP_EMBED_RE.test(k) &&
      v !== null &&
      v !== undefined &&
      v !== ""
    )
    .map(([, v]) => String(v))
    .join(" ")
    .slice(0, 1800);

  return `title: ${title} | text: ${body}`;
}

// ─── Query embedding ──────────────────────────────────────────────────────────

export async function embedQuery(query: string): Promise<number[]> {
  const t0 = Date.now();
  const model = getGeminiClient().getGenerativeModel({ model: MODEL });
  const prefixed = `task: search result | query: ${query}`;

  const result = await withRetry(() =>
    model.embedContent({
      content: { role: "user", parts: [{ text: prefixed }] },
      outputDimensionality: OUTPUT_DIM,
    } as never)
  );

  const values = (result as { embedding: { values: number[] } }).embedding.values;
  console.log(`[embeddings] Query "${query.slice(0, 40)}" embedded in ${Date.now() - t0}ms (dim=${values.length})`);
  return values;
}

// ─── Batch document embedding ─────────────────────────────────────────────────

export async function embedProductsBatched(texts: string[]): Promise<number[][]> {
  const model = getGeminiClient().getGenerativeModel({ model: MODEL });
  const results: number[][] = [];
  const batchCount = Math.ceil(texts.length / EMBEDDING_BATCH_SIZE);
  const t0 = Date.now();

  for (let i = 0; i < texts.length; i += EMBEDDING_BATCH_SIZE) {
    const batch = texts.slice(i, i + EMBEDDING_BATCH_SIZE);
    const batchIdx = Math.floor(i / EMBEDDING_BATCH_SIZE) + 1;

    const batchResult = await withRetry(() =>
      model.batchEmbedContents({
        requests: batch.map(text => ({
          content: { role: "user" as const, parts: [{ text }] },
          outputDimensionality: OUTPUT_DIM,
        })),
      } as never)
    );

    for (const emb of (batchResult as { embeddings: { values: number[] }[] }).embeddings) {
      results.push(emb.values);
    }

    console.log(
      `[embeddings] Batch ${batchIdx}/${batchCount} complete ` +
      `(${results.length}/${texts.length} vectors)`
    );

    if (i + EMBEDDING_BATCH_SIZE < texts.length) {
      await new Promise(r => setTimeout(r, BATCH_DELAY_MS));
    }
  }

  const elapsed = Date.now() - t0;
  const dim = results[0]?.length ?? 0;
  console.log(
    `[embeddings] Generated ${results.length} vectors in ${elapsed}ms ` +
    `(dim=${dim}, ~${Math.round(elapsed / Math.max(results.length, 1))}ms/vec)`
  );

  return results;
}
