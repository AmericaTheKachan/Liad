import { parse } from "csv-parse/sync";
import { Product } from "../services/schema-analysis";

// --- CSV Parsing ---

/**
 * Heuristic: count delimiters in the first non-empty line and pick the most common one.
 * Handles the common Brazilian Excel pattern of ";" as the column separator.
 */
function detectDelimiter(csv: string): string {
  const BOM = "﻿";
  const firstLine =
    csv.replace(BOM, "").split(/\r?\n/).find((l) => l.trim().length > 0) ?? "";
  const counts: Record<string, number> = {
    ",": (firstLine.match(/,/g) ?? []).length,
    ";": (firstLine.match(/;/g) ?? []).length,
    "\t": (firstLine.match(/\t/g) ?? []).length,
  };
  return Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];
}

export function parseCsv(csvContent: string): Product[] {
  // Strip UTF-8 BOM that Excel adds when saving as CSV
  const BOM = "﻿";
  const content = csvContent.startsWith(BOM) ? csvContent.slice(1) : csvContent;
  const delimiter = detectDelimiter(content);

  try {
    const rows = parse(content, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      delimiter,
      relax_column_count: true,
    }) as Product[];
    if (rows.length > 0) {
      console.log(
        `[csv-utils] Parsed ${rows.length} products (delimiter="${
          delimiter === "\t" ? "\\t" : delimiter
        }")`
      );
    }
    return rows;
  } catch (err) {
    console.warn("[csv-utils] CSV parse failed:", err);
    return [];
  }
}

// --- CSV Formatting ---

export function productsToPromptCsv(products: Product[]): string {
  if (products.length === 0) return "No products found.";
  const headers = Object.keys(products[0]);
  const rows = products.map((p) => headers.map((h) => p[h] ?? "").join(","));
  return [headers.join(","), ...rows].join("\n");
}

// --- Number Extraction ---
// Handles values like "$59.90", "R$ 150,00", or plain numbers.

export function extractNumber(val: unknown): number | null {
  if (typeof val === "number") return val;
  if (typeof val !== "string") return null;
  const clean = val.replace(/[^\d.,]/g, "").replace(",", ".");
  const num = parseFloat(clean);
  return isNaN(num) ? null : num;
}

// --- Product Name Extraction ---

const NAME_FIELDS = [
  "name", "nome", "produto", "title", "titulo", "product_name", "item_name",
  "Name", "Nome", "Produto", "Title", "Titulo",
];

export function extractProductName(product: Product): string | null {
  for (const field of NAME_FIELDS) {
    const val = product[field];
    if (typeof val === "string" && val.trim()) return val.trim();
  }
  const found = Object.values(product).find(
    (v) => typeof v === "string" && (v as string).trim().length > 0
  );
  return typeof found === "string" ? found : null;
}
