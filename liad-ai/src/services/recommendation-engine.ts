import { GoogleGenerativeAI } from "@google/generative-ai";
import { Product } from "./schema-analysis";
import { ShoppingIntent } from "./intent-extractor";

export async function generateRecommendation(
  storeName: string,
  userMessage: string,
  intent: ShoppingIntent,
  rankedProducts: Product[],
  history: any[]
): Promise<string> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in environment variables.");
  
  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const productCsv = productsToPromptCsv(rankedProducts);

  const systemPrompt = `You are a conversational AI shopping assistant for the store "${storeName}".

### YOUR GOALS
1. Act as a friendly, expert salesperson.
2. Recommend products from the provided catalog based on the user's request.
3. Suggest complementary products (e.g., if they buy a shirt, suggest matching pants).
4. Explain WHY a product fits their needs.

### CRITICAL RULES
- NEVER HALLUCINATE OR INVENT PRODUCTS.
- ONLY recommend products listed in the "RETRIEVED CATALOG" section below.
- Do NOT mention product IDs or SKUs to the user.
- If no products match, politely explain that you couldn't find exactly what they were looking for and suggest alternatives from the catalog.

### RETRIEVED CATALOG (Top matches for the user's intent)
\`\`\`csv
${productCsv}
\`\`\`

### USER INTENT (Extracted by the system)
Looking for: ${intent.searchQuery}
Applied Filters: ${JSON.stringify(intent.filters)}
`;

  const chat = model.startChat({
    history: history,
    systemInstruction: systemPrompt
  });

  const result = await chat.sendMessage(userMessage);
  return result.response.text();
}

function productsToPromptCsv(products: Product[]): string {
  if (products.length === 0) return "No products found.";
  const headers = Object.keys(products[0]);
  const rows = products.map((p) => headers.map((h) => p[h] ?? "").join(","));
  return [headers.join(","), ...rows].join("\n");
}