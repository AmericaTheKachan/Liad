import { Product } from "./schema-analysis";
import { ShoppingIntent } from "./intent-extractor";

/**
 * Applies strict metadata filters to a list of candidate products.
 * This should run BEFORE vector similarity search to narrow down the pool
 * and guarantee hard constraints (like size, gender, price) are met.
 */
export function filterProducts(products: Product[], intent: ShoppingIntent): Product[] {
  const { filters } = intent;
  
  // If no filters were extracted, return the whole catalog
  if (!filters || Object.keys(filters).length === 0) {
    return products;
  }

  return products.filter(product => {
    // Check Price Constraints
    if (filters.maxPrice !== undefined) {
      const pPrice = extractNumber(product.price || product.preco || product.valor);
      if (pPrice !== null && pPrice > filters.maxPrice) return false;
    }
    
    if (filters.minPrice !== undefined) {
      const pPrice = extractNumber(product.price || product.preco || product.valor);
      if (pPrice !== null && pPrice < filters.minPrice) return false;
    }

    // Check Gender Constraints (very simplistic text match)
    if (filters.gender) {
      const pGender = String(product.gender || product.genero || product.sexo || "").toLowerCase();
      if (pGender && !pGender.includes(filters.gender.toLowerCase())) {
         // If a gender is specified on the product, and it doesn't match the intent, exclude it.
         // (If the product has no gender field, we let it pass to be safe)
         return false;
      }
    }

    // Check Size Constraints
    if (filters.size) {
      const pSize = String(product.size || product.tamanho || product.sizes || "").toLowerCase();
      if (pSize && !pSize.split(/[,|;/]/).map(s => s.trim()).includes(filters.size.toLowerCase())) {
        return false;
      }
    }
    
    // Check Category Constraints
    if (filters.category) {
       const pCat = String(product.category || product.categoria || product.department || "").toLowerCase();
       // Only filter if the product has a category, and it doesn't loosely match the intent
       if (pCat && !pCat.includes(filters.category.toLowerCase()) && !filters.category.toLowerCase().includes(pCat)) {
         return false;
       }
    }

    return true;
  });
}

function extractNumber(val: any): number | null {
  if (typeof val === "number") return val;
  if (typeof val !== "string") return null;
  // Handle strings like "$59.90" or "R$ 150,00"
  const clean = val.replace(/[^\d.,]/g, "").replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}