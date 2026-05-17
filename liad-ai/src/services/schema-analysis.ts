import { getGeminiClient } from "../utils/gemini-client";

export interface Product {
  [key: string]: string | number | boolean | null | undefined;
}

/**
 * Result of catalog schema analysis.
 * Intentionally minimal — only the fields that are actually consumed by the pipeline.
 *
 * ranking_fields: numeric fields that represent popularity, sales, or views.
 *   Used by metadata-ranker to boost more popular products.
 *   Examples: "sold_count", "views", "popularity_score".
 *   NOT: price, stock, rating — those are handled separately.
 */
export interface CatalogSchemaAnalysis {
  ranking_fields: string[];
}

/**
 * Asks Gemini to identify which numeric fields in the catalog schema should be
 * used for popularity-based ranking. Runs once per account in the background
 * (not on the critical path of chat requests).
 */
export async function analyzeCatalogSchema(sampleProduct: Product): Promise<CatalogSchemaAnalysis> {
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
