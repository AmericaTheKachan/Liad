import { ChatMessage } from "../utils/gemini-client";
import { extractProductName } from "../utils/csv-utils";
import { extractIntent } from "./intent-extractor";
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
 * When the current search query is short (a follow-up like "HeadSet game"),
 * prepend meaningful terms from the last 2 user messages in history so that
 * brand/product context established earlier is not lost.
 *
 * Example:
 *   history user[-2]: "Tem algum produto JBL?"
 *   current query:    "HeadSet game"
 *   enriched query:   "JBL HeadSet game"
 */
function enrichQueryWithHistory(currentQuery: string, history: ChatMessage[]): string {
  // Only enrich short queries -- a long, specific query is already self-contained
  const wordCount = currentQuery.trim().split(/\s+/).length;
  if (wordCount > 4) return currentQuery;

  // Collect the last 2 user turns from history
  const recentUserTexts = history
    .filter(m => m.role === "user")
    .slice(-2)
    .map(m => (m.parts[0]?.text ?? "").trim())
    .filter(t => t.length > 0);

  if (recentUserTexts.length === 0) return currentQuery;

  // Extract candidate terms: words >=2 chars that are not pure numbers
  // and that are NOT already present in the current query (case-insensitive)
  const currentLower = new Set(currentQuery.toLowerCase().split(/\s+/));
  const extraTerms: string[] = [];

  for (const text of recentUserTexts) {
    for (const word of text.split(/\s+/)) {
      const clean = word.replace(/[^a-zA-Z0-9]/g, "").trim();
      if (
        clean.length >= 2 &&
        !/^\d+$/.test(clean) &&
        !currentLower.has(clean.toLowerCase())
      ) {
        extraTerms.push(clean);
        currentLower.add(clean.toLowerCase()); // deduplicate
      }
    }
  }

  if (extraTerms.length === 0) return currentQuery;
  return `${extraTerms.join(" ")} ${currentQuery}`;
}

/**
 * RAG pipeline for a single chat turn:
 *   extractIntent (rule-based, sync, no Gemini)
 *   -> filterProducts (hard metadata constraints)
 *   -> hybridSearch (BM25 + vector, falls back gracefully)
 *   -> rankProducts (metadata nudges: stock, rating, popularity)
 *   -> generateRecommendation (the single Gemini call per request)
 */
export async function processChatRequest(
  accountId: string,
  storeName: string,
  userMessage: string,
  history: ChatMessage[],
  catalogSize: number,
): Promise<OrchestratorResult> {

  const categories = getCatalogCategories(accountId);

  // 1. Extract intent -- synchronous, rule-based, no Gemini call
  console.log(`[orchestrator] Extracting intent for: "${userMessage}"`);
  const intent = extractIntent(userMessage);

  // For non-shopping queries, pass a catalog sample so Gemini has context
  if (!intent.isShoppingIntent) {
    const sample = getCatalogSample(accountId, 20);
    console.log(`[orchestrator] Non-shopping intent -- catalog sample (${sample.length} products)`);
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
  // Enrich the query with context from recent history when the current message is a short follow-up
  const enrichedQuery = enrichQueryWithHistory(intent.searchQuery, history);
  if (enrichedQuery !== intent.searchQuery) {
    console.log(`[orchestrator] Query enriched from history: "${intent.searchQuery}" -> "${enrichedQuery}"`);
  }
  console.log(`[orchestrator] Hybrid search: "${enrichedQuery}" across ${candidates.length} candidates (topK=${topK})`);
  const searchResults = await hybridSearch(accountId, enrichedQuery, candidates, topK);

  if (searchResults.length === 0) {
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

  // 6. Generate response -- the single Gemini call per shopping request
  console.log(`[orchestrator] Generating response with ${finalProducts.length} products`);
  const reply = await generateRecommendation(storeName, userMessage, intent, finalProducts, history, categories);

  const topProduct = finalProducts[0] != null ? extractProductName(finalProducts[0]) : null;
  return { reply, topProduct };
}
