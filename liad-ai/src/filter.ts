import type { Product } from "./lib/csv";
import type { ShoppingIntent } from "./chat/intent";
import { extractNumber } from "./lib/csv";
import { PRICE_FIELDS, GENDER_FIELDS, SIZE_FIELDS, CATEGORY_FIELDS, firstValue } from "./catalog/fields";

export function filterProducts(products: Product[], intent: ShoppingIntent): Product[] {
  const { filters } = intent;

  if (!filters || Object.keys(filters).length === 0) return products;

  return products.filter(product => {
    // Price upper bound
    if (filters.maxPrice !== undefined) {
      const price = extractNumber(firstValue(product, PRICE_FIELDS));
      if (price !== null && price > filters.maxPrice) return false;
    }

    // Price lower bound
    if (filters.minPrice !== undefined) {
      const price = extractNumber(firstValue(product, PRICE_FIELDS));
      if (price !== null && price < filters.minPrice) return false;
    }

    // Gender — only reject if the product explicitly declares a non-matching gender
    if (filters.gender) {
      const pGender = String(firstValue(product, GENDER_FIELDS) ?? "").toLowerCase();
      if (pGender && !pGender.includes(filters.gender.toLowerCase())) return false;
    }

    // Size — only reject if the product has a size field that doesn't include the requested size
    if (filters.size) {
      const pSize = String(firstValue(product, SIZE_FIELDS) ?? "").toLowerCase();
      if (pSize) {
        const sizeList = pSize.split(/[,|;/]/).map(s => s.trim());
        if (!sizeList.includes(filters.size.toLowerCase())) return false;
      }
    }

    // Category — loose match, only reject on explicit mismatch
    if (filters.category) {
      const pCat = String(firstValue(product, CATEGORY_FIELDS) ?? "").toLowerCase();
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
