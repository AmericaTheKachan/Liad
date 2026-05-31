import type { ChatMessage } from "./lib/gemini";
import { extractProductName, extractNumber } from "./lib/csv";
import { STOCK_FIELDS, RATING_FIELDS, firstValue } from "./catalog/fields";
import { parseIntent } from "./chat/intent";
import { generateResponse, type SearchContext } from "./chat/respond";
import { filterProducts } from "./filter";
import {
  getAllProducts,
  hybridSearch,
  findExactProduct,
  getSchemaRankingFields,
  getCatalogSample,
  getCatalogCategories,
} from "./catalog/index";
import type { Product } from "./lib/csv";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ChatTurnResult {
  reply: string;
  topProduct: string | null;
}

interface ScoredProduct {
  product: Product;
  score: number;
  finalScore?: number;
}

// ─── Metadata re-ranking ──────────────────────────────────────────────────────
// Applies soft business-rule nudges on top of the hybrid BM25+vector score.
// Promotes in-stock, highly-rated, or popular items without overriding ranking.

function rankProducts(
  scoredProducts: ScoredProduct[],
  rankingFields: string[],
): ScoredProduct[] {
  return scoredProducts
    .map(sp => {
      let finalScore = sp.score;
      const p = sp.product;

      const stockRaw = firstValue(p, STOCK_FIELDS);
      if (stockRaw !== undefined) {
        const stock = extractNumber(stockRaw);
        if (stock !== null && stock <= 0) finalScore *= 0.5;
        else if (stock !== null && stock < 3) finalScore *= 0.9;
      }

      const ratingRaw = firstValue(p, RATING_FIELDS);
      if (ratingRaw !== undefined) {
        const rating = extractNumber(ratingRaw);
        if (rating !== null && rating >= 4.5) finalScore *= 1.05;
      }

      for (const field of rankingFields) {
        const val = extractNumber(p[field]);
        if (val !== null && val > 0) {
          finalScore += Math.log10(val + 1) * 0.01;
        }
      }

      return { ...sp, finalScore };
    })
    .sort((a, b) => (b.finalScore ?? b.score) - (a.finalScore ?? a.score));
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

export async function chatTurn(
  accountId: string,
  storeName: string,
  userMessage: string,
  history: ChatMessage[],
  catalogSize: number,
): Promise<ChatTurnResult> {

  const pipelineStart = Date.now();
  const categories = getCatalogCategories(accountId);

  // 1. Extract shopping intent (Gemini Flash Lite → regex fallback)
  const t1 = Date.now();
  console.log(`[pipeline] Rewriting query: "${userMessage}"`);
  const intent = await parseIntent(userMessage, history);
  console.log(`[pipeline] Intent: ${Date.now() - t1}ms`);

  // 2. Non-shopping or clarification needed — skip search
  if (!intent.isShoppingIntent || intent.needsClarification) {
    const sample = getCatalogSample(accountId, 20);
    const reason = !intent.isShoppingIntent ? "non-shopping" : "clarification needed";
    console.log(`[pipeline] ${reason} — catalog sample (${sample.length} products)`);
    const reply = await generateResponse(storeName, userMessage, intent, sample, history, categories);
    console.log(`[pipeline] Total: ${Date.now() - pipelineStart}ms`);
    return { reply, topProduct: null };
  }

  // 3. Candidate set
  const allProducts = getAllProducts(accountId);
  console.log(`[pipeline] Catalog: ${allProducts.length} products for ${accountId}`);

  if (allProducts.length === 0) {
    const reply = await generateResponse(storeName, userMessage, intent, [], history, categories);
    return { reply, topProduct: null };
  }

  // 4. Hard metadata filters
  const t4 = Date.now();
  const filteredProducts = filterProducts(allProducts, intent);
  console.log(
    `[pipeline] Filter: ${filteredProducts.length}/${allProducts.length} products ` +
    `in ${Date.now() - t4}ms`
  );

  const candidates = filteredProducts.length > 0 ? filteredProducts : allProducts;
  const topK = catalogSize < 30 ? catalogSize : 20;

  // 5. Hybrid search (BM25 + vector)
  const t5 = Date.now();
  console.log(
    `[pipeline] Hybrid search: "${intent.searchQuery}" ` +
    `over ${candidates.length} candidates (topK=${topK})`
  );
  const searchResults = await hybridSearch(accountId, intent.searchQuery, candidates, topK);
  console.log(`[pipeline] Hybrid search: ${searchResults.length} results in ${Date.now() - t5}ms`);

  // 6. Exact product lookup (only for specific product queries)
  let exactMatch: Product | null = null;
  if (intent.specificProduct) {
    exactMatch = findExactProduct(accountId, intent.specificProduct);
    console.log(
      `[pipeline] Exact lookup "${intent.specificProduct}": ` +
      (exactMatch ? `found — "${extractProductName(exactMatch)}"` : "not in catalog"),
    );
  }

  // 7. Fallback: no search results at all
  if (searchResults.length === 0 && !exactMatch) {
    const hasFilters = Object.keys(intent.filters).length > 0;

    if (hasFilters) {
      const fallback = candidates.slice(0, topK);
      console.log(`[pipeline] No keyword match — ${fallback.length} filter-matched products`);
      const reply = await generateResponse(storeName, userMessage, intent, fallback, history, categories);
      const topProduct = fallback[0] != null ? extractProductName(fallback[0]) : null;
      console.log(`[pipeline] Total: ${Date.now() - pipelineStart}ms`);
      return { reply, topProduct };
    }

    console.log(`[pipeline] No results for "${intent.searchQuery}" — product not in catalog`);
    const searchContext: SearchContext | undefined = intent.specificProduct
      ? { mode: "exact_not_found", specificProductName: intent.specificProduct }
      : undefined;
    const reply = await generateResponse(storeName, userMessage, intent, [], history, categories, searchContext);
    console.log(`[pipeline] Total: ${Date.now() - pipelineStart}ms`);
    return { reply, topProduct: null };
  }

  // 8. Metadata re-ranking
  const t8 = Date.now();
  const rankingFields = getSchemaRankingFields(accountId);
  const scored = searchResults.map((p, i) => ({
    product: p,
    score: 1 - (i / Math.max(searchResults.length, 1)) * 0.5,
  }));
  const ranked = rankProducts(scored, rankingFields);
  const rankedProducts = ranked.map(r => r.product);
  console.log(`[pipeline] Re-ranking: ${Date.now() - t8}ms`);

  // 9. Assemble final product list and search context
  //    exact_found  → [exactMatch, ...recommendations (excluindo o exact)]
  //    exact_not_found → [recommendations]
  //    browse       → [recommendations]
  let finalProducts: Product[];
  let searchContext: SearchContext | undefined;

  if (intent.specificProduct) {
    if (exactMatch) {
      const recommendations = rankedProducts.filter(p => p !== exactMatch).slice(0, 4);
      finalProducts = [exactMatch, ...recommendations];
      searchContext = { mode: "exact_found" };
    } else {
      finalProducts = rankedProducts;
      searchContext = { mode: "exact_not_found", specificProductName: intent.specificProduct };
    }
  } else {
    finalProducts = rankedProducts;
    searchContext = undefined;
  }

  // 10. Generate natural language response
  const t10 = Date.now();
  console.log(
    `[pipeline] Generating response: ${finalProducts.length} products` +
    (searchContext ? ` (mode=${searchContext.mode})` : ""),
  );
  const reply = await generateResponse(storeName, userMessage, intent, finalProducts, history, categories, searchContext);
  console.log(`[pipeline] LLM response: ${Date.now() - t10}ms`);

  const topProduct = finalProducts[0] != null ? extractProductName(finalProducts[0]) : null;

  console.log(
    `[pipeline] Complete: ${Date.now() - pipelineStart}ms total ` +
    `(topProduct="${topProduct ?? "none"}")`,
  );

  return { reply, topProduct };
}
