import { Product, CatalogSchemaAnalysis } from "./schema-analysis";

/**
 * Builds the text string used for embedding generation based on the schema analysis.
 * Strips out IDs, SKUs, and unstructured/unhelpful data.
 */
export function buildEmbeddingText(product: Product, schemaAnalysis?: CatalogSchemaAnalysis): string {
  // If we have a schema analysis, strictly use the semantic fields defined by the architect AI
  if (schemaAnalysis && schemaAnalysis.semantic_fields.length > 0) {
    return schemaAnalysis.semantic_fields
      .map(field => {
        const val = product[field];
        if (val === undefined || val === null || val === "") return "";
        return `${field}: ${val}`;
      })
      .filter(text => text.length > 0)
      .join(" | ");
  }

  // Fallback: Best-effort heuristic if schema analysis fails or is missing
  const ignorePatterns = [/id/i, /sku/i, /url/i, /link/i, /image/i, /hash/i, /timestamp/i, /date/i, /stock/i, /qty/i, /quantity/i];
  
  return Object.entries(product)
    .filter(([k, v]) => {
      if (v === undefined || v === null || v === "") return false;
      // Skip numeric IDs or typical boolean flags (like 'isActive')
      if (typeof v === "boolean") return false;
      
      // Check ignore list
      return !ignorePatterns.some(pattern => pattern.test(k));
    })
    .map(([k, v]) => `${k}: ${v}`)
    .join(" | ");
}
