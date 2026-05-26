import { getGeminiClient, ChatMessage } from "../utils/gemini-client";
import { ShoppingIntent, extractIntent } from "./intent-extractor";

// ─── Prompt ───────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a search-intent extractor for an e-commerce chatbot.

Given the recent conversation and the customer's latest message, output a single JSON object with these fields:

- "searchQuery": a clean, concise product search string. Incorporate brand, product type, or context from earlier messages when the current message is a short follow-up. Correct obvious typos (e.g. "jbç" -> "JBL"). If not a shopping request or clarification is needed, use "".
- "isShoppingIntent": true if the customer is looking for a product; false for pure greetings, thanks, or chitchat.
- "needsClarification": true when the customer has a clear shopping intent but hasn't specified what type of product they want. This happens when the request is based on occasion/purpose (e.g. "present for my mom", "something for the house") without naming a product category. Do NOT set this true if the product type is already clear (e.g. "headset", "tenis", "caixa de som").
- "filters": object with ONLY the fields explicitly stated by the customer:
  - "minPrice" (number, BRL)
  - "maxPrice" (number, BRL)
  - "gender": "masculino" | "feminino" | "infantil"
  - "size": string, e.g. "M", "GG", "42"
  - "category": string, e.g. "eletronicos", "calcados"

Output ONLY the JSON. No explanation, no markdown fences.

Examples:

User: "Quero um presente para minha mae de ate R$100"
{"searchQuery":"","isShoppingIntent":true,"needsClarification":true,"filters":{"maxPrice":100}}

User: "algo para decorar a casa"
{"searchQuery":"","isShoppingIntent":true,"needsClarification":true,"filters":{}}

User: "Tem algum produto JBL?"
{"searchQuery":"JBL","isShoppingIntent":true,"needsClarification":false,"filters":{}}

History: user said "Tem algum produto JBL?" / assistant asked "Qual categoria?"
User: "HeadSet game"
{"searchQuery":"JBL headset gamer","isShoppingIntent":true,"needsClarification":false,"filters":{}}

User: "nao, da jbc"
{"searchQuery":"JBL","isShoppingIntent":true,"needsClarification":false,"filters":{}}

User: "Oi tudo bem?"
{"searchQuery":"","isShoppingIntent":false,"needsClarification":false,"filters":{}}

User: "quero tenis masculino ate R$200"
{"searchQuery":"tenis masculino","isShoppingIntent":true,"needsClarification":false,"filters":{"gender":"masculino","maxPrice":200}}`;

// ─── Types ────────────────────────────────────────────────────────────────────

interface RawRewriteResult {
  searchQuery?: unknown;
  isShoppingIntent?: unknown;
  needsClarification?: unknown;
  filters?: {
    minPrice?: unknown;
    maxPrice?: unknown;
    gender?: unknown;
    size?: unknown;
    category?: unknown;
  };
}

// ─── Core ─────────────────────────────────────────────────────────────────────

function buildContextSnippet(history: ChatMessage[]): string {
  const recent = history.slice(-3);
  if (recent.length === 0) return "";
  return (
    "Recent conversation:\n" +
    recent
      .map(m => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.parts[0]?.text ?? ""}`)
      .join("\n") +
    "\n\n"
  );
}

function parseResult(raw: RawRewriteResult): ShoppingIntent {
  const searchQuery = typeof raw.searchQuery === "string" ? raw.searchQuery.trim() : "";
  const isShoppingIntent = raw.isShoppingIntent === true;
  const needsClarification = raw.needsClarification === true;

  const f = raw.filters ?? {};
  const filters: ShoppingIntent["filters"] = {};

  if (typeof f.minPrice === "number" && isFinite(f.minPrice)) filters.minPrice = f.minPrice;
  if (typeof f.maxPrice === "number" && isFinite(f.maxPrice)) filters.maxPrice = f.maxPrice;
  if (typeof f.gender   === "string" && f.gender.trim())      filters.gender   = f.gender.trim();
  if (typeof f.size     === "string" && f.size.trim())        filters.size     = f.size.trim().toUpperCase();
  if (typeof f.category === "string" && f.category.trim())    filters.category = f.category.trim();

  return {
    searchQuery: searchQuery || "produto",
    isShoppingIntent,
    needsClarification,
    filters,
  };
}

/**
 * Uses Gemini Flash Lite to rewrite the customer's message into a structured
 * ShoppingIntent, incorporating conversation history for context.
 *
 * Falls back to the rule-based extractIntent on any error so the chatbot
 * never breaks due to a failed rewrite call.
 */
export async function rewriteQuery(
  userMessage: string,
  history: ChatMessage[],
): Promise<ShoppingIntent> {
  try {
    const model = getGeminiClient().getGenerativeModel({
      model: "gemini-2.0-flash-lite",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
        maxOutputTokens: 128,
      } as never,
    });

    const contextSnippet = buildContextSnippet(history);
    const prompt = `${contextSnippet}Customer's latest message: "${userMessage}"`;

    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();

    const parsed = JSON.parse(text) as RawRewriteResult;
    const intent = parseResult(parsed);

    console.log(
      `[rewriter] "${userMessage}" -> query="${intent.searchQuery}" shopping=${intent.isShoppingIntent} clarify=${intent.needsClarification ?? false}`,
      Object.keys(intent.filters).length ? intent.filters : ""
    );

    return intent;
  } catch (err) {
    console.warn("[rewriter] Gemini rewrite failed, falling back to rule-based:", err);
    return extractIntent(userMessage);
  }
}
