import fs from "fs";
import path from "path";
import { getGeminiClient, ChatMessage } from "../utils/gemini-client";
import { Product } from "./schema-analysis";
import { ShoppingIntent } from "./intent-extractor";
import { productsToPromptCsv } from "../utils/csv-utils";

// Prompt template loaded once from system-prompt.md at the project root.

let _promptTemplate: string | null = null;

function getPromptTemplate(): string {
  if (_promptTemplate) return _promptTemplate;
  const filePath = path.join(process.cwd(), "system-prompt.md");
  _promptTemplate = fs.readFileSync(filePath, "utf-8");
  return _promptTemplate;
}

/**
 * Builds the final system prompt.
 *
 * When `categories` is provided, a definitive category list is prepended to the
 * product catalog section so Gemini always has an accurate answer for
 * "what categories do you carry?" regardless of which products are sampled.
 */
function buildSystemPrompt(
  storeName: string,
  csvContent: string,
  categories: string[]
): string {
  const catLine =
    categories.length > 0
      ? `Store categories available: ${categories.join(", ")}\n\n`
      : "";

  return getPromptTemplate()
    .replace(/{storeName}/g, storeName)
    .replace("{csvContent}", catLine + csvContent);
}

export async function generateRecommendation(
  storeName: string,
  userMessage: string,
  intent: ShoppingIntent,
  rankedProducts: Product[],
  history: ChatMessage[],
  categories: string[] = []
): Promise<string> {
  const systemPrompt = buildSystemPrompt(
    storeName,
    productsToPromptCsv(rankedProducts),
    categories
  );

  // systemInstruction must go on getGenerativeModel, NOT on startChat.
  const model = getGeminiClient().getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: systemPrompt,
  });

  const chat = model.startChat({ history });
  const result = await chat.sendMessage(userMessage);
  return result.response.text();
}
