import { Product } from "./schema-analysis";
import { ShoppingIntent } from "./intent-extractor";
import { extractNumber } from "../utils/csv-utils";

/**
 * Applies hard metadata filters BEFORE vector search to enforce strict user constraints
 * (price range, gender, size, category). Falls back to full catalog if nothing passes.
 */
export function filterProducts(products: Product[], intent: ShoppingIntent): Product[] {
  const { filters } = intent;

  if (!filters || Object.keys(filters).length === 0) return products;

  return products.filter(product => {
    // Price upper bound
    if (filters.maxPrice !== undefined) {
      const price = extractNumber(product.price || product.preco || product.valor);
      if (price !== null && price > filters.maxPrice) return false;
    }

    // Price lower bound
    if (filters.minPrice !== undefined) {
      const price = extractNumber(product.price || product.preco || product.valor);
      if (price !== null && price < filters.minPrice) return false;
    }

    // Gender — only reject if the product explicitly declares a non-matching gender
    if (filters.gender) {
      const pGender = String(product.gender || product.genero || product.sexo || "").toLowerCase();
      if (pGender && !pGender.includes(filters.gender.toLowerCase())) return false;
    }

    // Size — only reject if the product has a size field that doesn't include the requested size
    if (filters.size) {
      const pSize = String(product.size || product.tamanho || product.sizes || "").toLowerCase();
      if (pSize) {
        const sizeList = pSize.split(/[,|;/]/).map(s => s.trim());
        if (!sizeList.includes(filters.size.toLowerCase())) return false;
      }
    }

    // Category — loose match, only reject on explicit mismatch
    if (filters.category) {
      const pCat = String(
        product.category || product.categoria || product.department || ""
      ).toLowerCase();
      if (
        pCat &&
        !pCat.includes(filters.category.toLowerCase()) &&
        !filters.category.toLowerCase().includes(pCat)
      ) {
        return false;
      }
    }

    return true;
  });
}
