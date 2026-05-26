import { ChatMessage } from "../utils/gemini-client";
import { extractProductName } from "../utils/csv-utils";
import { rewriteQuery } from "./query-rewriter";
import { filterProducts } from "./metadata-filter";
import {
  getAllProducts,
  hybridSearch,
  getSchemaAnalysis,
  getCatalogSample,
  getCatalogCategories,
} from "./product-index";
import { rankProducts } from "./metadata-ranker";
import { generateRecommendation } from "./recommendation-engine";

export interface OrchestratorResult {
  reply: string;
  topProduct: string | null;
}

/**
 * RAG pipeline for a single chat turn:
 *   rewriteQuery (Gemini Flash Lite -- understands context, typos, follow-ups)
 *   -> filterProducts (hard metadata constraints)
 *   -> hybridSearch (BM25 + vector, falls back gracefully)
 *   -> rankProducts (metadata nudges: stock, rating, popularity)
 *   -> generateRecommendation (Gemini Flash -- final response)
 */
export async function processChatRequest(
  accountId: string,
  storeName: string,
  userMessage: string,
  history: ChatMessage[],
  catalogSize: number,
): Promise<OrchestratorResult> {

  const categories = getCatalogCategories(accountId);

  // 1. Rewrite query -- Gemini Flash Lite understands context, typos, follow-ups
  //    Falls back to rule-based extractIntent on failure
  console.log(`[orchestrator] Rewriting query for: "${userMessage}"`);
  const intent = await rewriteQuery(userMessage, history);

  // For non-shopping queries, pass a catalog sample so Gemini has context
  if (!intent.isShoppingIntent) {
    const sample = getCatalogSample(accountId, 20);
    console.log(`[orchestrator] Non-shopping intent -- catalog sample (${sample.length} products)`);
    const reply = await generateRecommendation(storeName, userMessage, intent, sample, history, categories);
    return { reply, topProduct: null };
  }

  // For vague intent queries (e.g. "presente para minha mae", "algo para casa"),
  // skip the search entirely and let Gemini ask one focused clarifying question.
  // We pass a diverse catalog sample so Gemini knows what categories are available.
  if (intent.needsClarification) {
    const sample = getCatalogSample(accountId, 20);
    console.log(`[orchestrator] Clarification needed -- skipping search, passing catalog sample (${sample.length} products)`);
    const reply = await generateRecommendation(storeName, userMessage, intent, sample, history, categories);
    return { reply, topProduct: null };
  }

  // 2. Full product list
  const allProducts = getAllProducts(accountId);
  console.log(`[orchestrator] Catalog size for ${accountId}: ${allProducts.length} products`);

  if (allProducts.length === 0) {
    const reply = await generateRecommendation(storeName, userMessage, intent, [], history, categories);
    return { reply, topProduct: null };
  }

  // 3. Hard metadata filters (price, gender, size, category)
  const filteredProducts = filterProducts(allProducts, intent);
  console.log(`[orchestrator] ${filteredProducts.length} / ${allProducts.length} passed metadata filters`);

  const candidates = filteredProducts.length > 0 ? filteredProducts : allProducts;
  const topK = catalogSize < 30 ? catalogSize : 20;

  // 4. Hybrid search: BM25 + semantic vector
  console.log(`[orchestrator] Hybrid search: "${intent.searchQuery}" across ${candidates.length} candidates (topK=${topK})`);
  const searchResults = await hybridSearch(accountId, intent.searchQuery, candidates, topK);

  // 4b. Fallback when keyword search finds nothing but filters are active.
  //     Show filter-matched candidates so Gemini has something real to work with.
  if (searchResults.length === 0) {
    const hasFilters = Object.keys(intent.filters).length > 0;

    if (hasFilters) {
      const fallback = candidates.slice(0, topK);
      console.log(`[orchestrator] No keyword match -- using ${fallback.length} filter-matched products`);
      const reply = await generateRecommendation(storeName, userMessage, intent, fallback, history, categories);
      const topProduct = fallback[0] != null ? extractProductName(fallback[0]) : null;
      return { reply, topProduct };
    }

    console.log(`[orchestrator] No results for "${intent.searchQuery}" -- product not in catalog`);
    const reply = await generateRecommendation(storeName, userMessage, intent, [], history, categories);
    return { reply, topProduct: null };
  }

  // 5. Metadata reranking -- nudge scores for stock/rating/popularity
  const schemaAnalysis = getSchemaAnalysis(accountId);
  const scored = searchResults.map((p, i) => ({
    product: p,
    score: 1 - (i / Math.max(searchResults.length, 1)) * 0.5,
  }));
  const ranked = rankProducts(scored, schemaAnalysis);
  const finalProducts = ranked.map(r => r.product);

  // 6. Generate response -- Gemini Flash with ranked product catalog
  console.log(`[orchestrator] Generating response with ${finalProducts.length} products`);
  const reply = await generateRecommendation(storeName, userMessage, intent, finalProducts, history, categories);

  const topProduct = finalProducts[0] != null ? extractProductName(finalProducts[0]) : null;
  return { reply, topProduct };
}
