import fs from "fs";
import path from "path";
import { getGeminiClient, type ChatMessage } from "../lib/gemini";
import type { Product } from "../lib/csv";
import type { ShoppingIntent } from "./intent";
import { productsToPromptCsv } from "../lib/csv";

// ─── Search context ───────────────────────────────────────────────────────────

export interface SearchContext {
  /** exact_found  — user asked for a specific product and it's in the catalog.
   *                 First product in the list IS that exact item.
   *  exact_not_found — user asked for a specific product NOT in catalog.
   *                    List contains similar alternatives.
   *  browse      — generic search, no specific product requested (default). */
  mode: "exact_found" | "exact_not_found" | "browse";
  /** The name of the specific product the user asked for (for "not found" message). */
  specificProductName?: string;
}

// ─── Prompt building ──────────────────────────────────────────────────────────

// Prompt template loaded once at module initialization.
const PROMPT_TEMPLATE = fs.readFileSync(
  path.join(process.cwd(), "system-prompt.md"),
  "utf-8"
);

function buildSystemPrompt(
  storeName: string,
  csvContent: string,
  categories: string[],
  searchContext?: SearchContext,
): string {
  const catLine =
    categories.length > 0
      ? `Store categories available: ${categories.join(", ")}\n\n`
      : "";

  // Inject a search-mode instruction before the product list so the LLM
  // knows whether to present an exact hit or a "not found" + alternatives flow.
  let contextNote = "";
  if (searchContext?.mode === "exact_found") {
    contextNote =
      "[INSTRUÇÃO DE BUSCA: O PRIMEIRO produto na lista abaixo é EXATAMENTE o que o cliente pediu. " +
      "Apresente-o como o produto solicitado e, em seguida, sugira os demais como 'Também temos opções relacionadas:']\n\n";
  } else if (searchContext?.mode === "exact_not_found") {
    contextNote =
      `[INSTRUÇÃO DE BUSCA: O produto "${searchContext.specificProductName ?? "solicitado"}" ` +
      "NÃO está disponível no catálogo. Informe o cliente com empatia e apresente os produtos abaixo como alternativas similares.]\n\n";
  }

  return PROMPT_TEMPLATE
    .replace(/{storeName}/g, storeName)
    .replace("{csvContent}", contextNote + catLine + csvContent);
}

// ─── Response generation ──────────────────────────────────────────────────────

export async function generateResponse(
  storeName: string,
  userMessage: string,
  _intent: ShoppingIntent,
  rankedProducts: Product[],
  history: ChatMessage[],
  categories: string[] = [],
  searchContext?: SearchContext,
): Promise<string> {
  const systemPrompt = buildSystemPrompt(
    storeName,
    productsToPromptCsv(rankedProducts),
    categories,
    searchContext,
  );

  const model = getGeminiClient().getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: systemPrompt,
  });

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(userMessage);
  return result.response.text();
}
