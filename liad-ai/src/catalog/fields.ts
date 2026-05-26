// ─── Product field name aliases ───────────────────────────────────────────────
//
// Single source of truth for product field name aliases.
// Catalogs vary: PT vs EN, snake_case vs camelCase, capitalized headers from Excel.
//
// Consumers:
//   catalog/embeddings.ts — SKIP_EMBED_RE
//   catalog/search.ts     — SKIP_BM25_RE, BM25_BOOST_FIELDS, NAME_FIELDS
//   catalog/index.ts      — CATEGORY_FIELDS
//   filter.ts             — PRICE_FIELDS, GENDER_FIELDS, SIZE_FIELDS, CATEGORY_FIELDS
//   pipeline.ts           — STOCK_FIELDS, RATING_FIELDS

export const CATEGORY_FIELDS = [
  "category", "categoria", "department", "departamento", "tipo", "type",
] as const;

// Includes capitalized variants from Excel-exported CSVs (e.g. "Name", "Nome")
export const NAME_FIELDS = [
  "name", "nome", "produto", "title", "titulo",
  "product_name", "item_name",
  "Name", "Nome", "Produto", "Title", "Titulo",
] as const;

export const PRICE_FIELDS  = ["price", "preco", "valor"] as const;
export const STOCK_FIELDS  = ["stock", "estoque", "quantidade"] as const;
export const RATING_FIELDS = ["rating", "avaliacao", "stars"] as const;
export const GENDER_FIELDS = ["gender", "genero", "sexo"] as const;
export const SIZE_FIELDS   = ["size", "tamanho", "sizes"] as const;

// Fields excluded from BM25 indexing (IDs, URLs, images)
export const SKIP_BM25_RE = /^(_?id$|sku|url|link|image|img|foto|hash|uuid)/i;

// Fields excluded from embedding text (numeric/structural fields belong in metadata layer)
export const SKIP_EMBED_RE =
  /^(_?id$|sku|url|link|image|img|foto|hash|uuid|price|preco|valor|stock|estoque|quantidade|codigo|code|ref|cep|cnpj|cpf)/i;

// Name/title/description fields get 2× BM25 boost (checked with toLowerCase)
export const BM25_BOOST_FIELDS = new Set([
  "name", "nome", "produto", "title", "titulo",
  "product_name", "item_name", "description", "descricao", "descricção",
]);

// ─── Helper ───────────────────────────────────────────────────────────────────

/**
 * Returns the first non-empty value found for any of the given field names.
 * Handles catalogs with mixed PT/EN field names without scattered || chains.
 */
export function firstValue(
  record: Record<string, unknown>,
  fields: readonly string[],
): unknown {
  for (const f of fields) {
    const v = record[f];
    if (v !== null && v !== undefined && v !== "") return v;
  }
  return undefined;
}
