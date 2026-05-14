import { Product, CatalogSchemaAnalysis } from "./schema-analysis";

export interface ScoredProduct {
  product: Product;
  score: number; // The semantic score (cosine similarity)
  finalScore?: number; // The adjusted score after hybrid ranking
}

/**
 * Adjusts the semantic vector scores using structured metadata.
 * Promotes in-stock items, popular items, or items on sale.
 */
export function rankProducts(
  scoredProducts: ScoredProduct[],
  schemaAnalysis?: CatalogSchemaAnalysis
): ScoredProduct[] {
  return scoredProducts.map(sp => {
    let finalScore = sp.score;
    const p = sp.product;

    // Standard business rules that apply to most catalogs

    // 1. Penalize out of stock
    const stockRaw = p.stock || p.estoque || p.quantidade;
    if (stockRaw !== undefined) {
      const stock = extractNumber(stockRaw);
      if (stock !== null && stock <= 0) {
        finalScore *= 0.5; // Heavy penalty for out of stock
      } else if (stock !== null && stock < 3) {
         finalScore *= 0.9; // Slight penalty for low stock
      }
    }

    // 2. Promote highly rated / popular items
    const ratingRaw = p.rating || p.avaliacao || p.stars;
    if (ratingRaw !== undefined) {
       const rating = extractNumber(ratingRaw);
       // Assuming a 5 star scale
       if (rating !== null && rating >= 4.5) {
           finalScore *= 1.05; // 5% boost for great ratings
       }
    }
    
    // 3. Dynamic schema-based ranking
    if (schemaAnalysis && schemaAnalysis.ranking_fields) {
       for (const rankField of schemaAnalysis.ranking_fields) {
          const val = extractNumber(p[rankField]);
          // Boost based on arbitrary numeric rank fields identified by AI
          // (Requires understanding if the field should be high or low, assuming high is better for now)
          if (val !== null && val > 0) {
             finalScore += (Math.log10(val + 1) * 0.01); // Small logarithmic boost
          }
       }
    }

    return { ...sp, finalScore };
  }).sort((a, b) => (b.finalScore ?? b.score) - (a.finalScore ?? a.score));
}

function extractNumber(val: any): number | null {
  if (typeof val === "number") return val;
  if (typeof val !== "string") return null;
  const clean = val.replace(/[^\d.,]/g, "").replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}