import { GoogleGenerativeAI } from "@google/generative-ai";

export interface ShoppingIntent {
  searchQuery: string; // The refined semantic string to search for (e.g., "red running shoes")
  filters: {
    category?: string;
    gender?: string;
    minPrice?: number;
    maxPrice?: number;
    size?: string;
    color?: string;
    occasion?: string;
    season?: string;
    [key: string]: string | number | undefined;
  };
  isShoppingIntent: boolean; // false if the user is just saying "hello" or asking a general question
}

export async function extractIntent(userMessage: string): Promise<ShoppingIntent> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in environment variables.");
  
  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const prompt = `You are a strict JSON intent extractor for an e-commerce shopping assistant.
Extract structured shopping intent and filters from the user's natural language query.

Return ONLY a valid JSON object matching this TypeScript interface exactly:
{
  "searchQuery": string, // The pure product features to semantically search for (e.g. "confortable running shoes"). Do not include price/size constraints in this string.
  "filters": { // Leave keys missing if not mentioned. Try to map words like "cheap" to a maxPrice.
    "category"?: string,
    "gender"?: string,
    "minPrice"?: number,
    "maxPrice"?: number,
    "size"?: string,
    "color"?: string,
    "occasion"?: string,
    "season"?: string
  },
  "isShoppingIntent": boolean // True if looking for products, False if greeting/general question
}

User Query: "${userMessage}"`;

  try {
    const result = await model.generateContent({
      contents: [{ role: 'user', parts: [{ text: prompt }] }],
      generationConfig: {
        responseMimeType: "application/json",
      }
    });

    const parsed = JSON.parse(result.response.text());
    
    // Ensure the required fields exist, even if parsing fails slightly
    return {
      searchQuery: parsed.searchQuery || userMessage,
      filters: parsed.filters || {},
      isShoppingIntent: typeof parsed.isShoppingIntent === "boolean" ? parsed.isShoppingIntent : true
    };
  } catch (error) {
    console.error("[intent-extractor] Failed to parse intent, falling back.", error);
    // Fallback: assume the whole string is the semantic query with no hard filters
    return {
      searchQuery: userMessage,
      filters: {},
      isShoppingIntent: true
    };
  }
}