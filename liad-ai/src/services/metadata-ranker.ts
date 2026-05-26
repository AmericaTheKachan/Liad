import { Product, CatalogSchemaAnalysis } from "./schema-analysis";
import { extractNumber } from "../utils/csv-utils";

export interface ScoredProduct {
  product: Product;
  score: number;
  finalScore?: number;
}

/**
 * Adjusts hybrid BM25+vector scores using structured metadata signals.
 * Promotes in-stock, highly-rated, or popular items without changing the
 * overall ranking dramatically — nudges rather than overrides.
 *
 * Note: this is NOT a hybrid ranker in the BM25+vector sense — for that,
 * see hybridSearch() in product-index.ts. This layer applies metadata boosts
 * on top of the already-computed hybrid score.
 */
export function rankProducts(
  scoredProducts: ScoredProduct[],
  schemaAnalysis?: CatalogSchemaAnalysis,
): ScoredProduct[] {
  return scoredProducts
    .map(sp => {
      let finalScore = sp.score;
      const p = sp.product;

      // 1. Penalize out-of-stock items
      const stockRaw = p.stock ?? p.estoque ?? p.quantidade;
      if (stockRaw !== undefined) {
        const stock = extractNumber(stockRaw);
        if (stock !== null && stock <= 0) finalScore *= 0.5;
        else if (stock !== null && stock < 3) finalScore *= 0.9;
      }

      // 2. Promote highly-rated items (≥ 4.5 stars)
      const ratingRaw = p.rating ?? p.avaliacao ?? p.stars;
      if (ratingRaw !== undefined) {
        const rating = extractNumber(ratingRaw);
        if (rating !== null && rating >= 4.5) finalScore *= 1.05;
      }

      // 3. Schema-guided boost for popularity/sales fields (if detected)
      if (schemaAnalysis?.ranking_fields) {
        for (const field of schemaAnalysis.ranking_fields) {
          const val = extractNumber(p[field]);
          if (val !== null && val > 0) {
            finalScore += Math.log10(val + 1) * 0.01;
          }
        }
      }

      return { ...sp, finalScore };
    })
    .sort((a, b) => (b.finalScore ?? b.score) - (a.finalScore ?? a.score));
}
