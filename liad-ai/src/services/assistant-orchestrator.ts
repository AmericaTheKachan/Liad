import { ChatMessage } from "./gemini";
import { Product, analyzeCatalogSchema } from "./schema-analysis";
import { extractIntent } from "./intent-extractor";
import { filterProducts } from "./metadata-filter";
import { getEmbedding, getSemanticScores, getIndexItems, getSchemaAnalysis } from "./semantic-search";
import { rankProducts, ScoredProduct } from "./hybrid-ranker";
import { generateRecommendation } from "./recommendation-engine";

export async function processChatRequest(
    accountId: string,
    storeName: string,
    userMessage: string,
    history: ChatMessage[],
    catalogSize: number
): Promise<string> {
    
    // 1. Extract Intent from user message
    console.log(`[orchestrator] Extracting intent for: "${userMessage}"`);
    const intent = await extractIntent(userMessage);
    
    if (!intent.isShoppingIntent) {
        // Fallback for general greetings or non-shopping queries, just pass to Gemini
        return await generateRecommendation(storeName, userMessage, intent, [], history);
    }

    // 2. Fetch full indexed catalog
    const allIndexedItems = getIndexItems(accountId);
    const schemaAnalysis = getSchemaAnalysis(accountId);

    // 3. Metadata Filtering
    // Convert IndexedProducts back to Product array for filtering
    const allProducts = allIndexedItems.map(item => item.product);
    console.log(`[orchestrator] Filtering ${allProducts.length} items using intent filters:`, intent.filters);
    const filteredProducts = filterProducts(allProducts, intent);
    console.log(`[orchestrator] ${filteredProducts.length} items passed metadata filters.`);

    // If filtering was too strict, fallback to the full catalog (optional behavior)
    const candidates = filteredProducts.length > 0 ? filteredProducts : allProducts;

    // Find the corresponding embeddings for our candidate products
    const candidateIndexedItems = candidates.map(cp => {
       return allIndexedItems.find(item => item.product === cp)!; // Should always exist
    });

    // 4. Semantic Search (Vector)
    console.log(`[orchestrator] Generating vector for semantic query: "${intent.searchQuery}"`);
    const queryEmbedding = await getEmbedding(intent.searchQuery);
    
    const semanticScores = await getSemanticScores(queryEmbedding, candidateIndexedItems);

    // 5. Hybrid Ranking
    console.log(`[orchestrator] Ranking items using hybrid heuristics.`);
    const ranked: ScoredProduct[] = rankProducts(semanticScores, schemaAnalysis);

    // Dynamic Top K - return more for large catalogs to give LLM context
    const topK = catalogSize < 30 ? catalogSize : 8;
    
    // Take the top K products based on the final hybrid score
    const finalProducts = ranked.slice(0, topK).map(r => r.product);

    // 6. Recommendation Generation
    console.log(`[orchestrator] Generating final response with ${finalProducts.length} candidate products.`);
    const response = await generateRecommendation(storeName, userMessage, intent, finalProducts, history);

    return response;
}