import { GoogleGenerativeAI } from "@google/generative-ai";

let _client: GoogleGenerativeAI | null = null;

export function getGeminiClient(): GoogleGenerativeAI {
  if (!_client) {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new Error("GEMINI_API_KEY não configurada no .env");
    _client = new GoogleGenerativeAI(apiKey);
  }
  return _client;
}

export interface ChatMessage {
  role: "user" | "model";
  parts: [{ text: string }];
}
