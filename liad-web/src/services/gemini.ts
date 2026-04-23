import { GoogleGenerativeAI } from "@google/generative-ai";

let client: GoogleGenerativeAI | null = null;

function getGeminiClient(): GoogleGenerativeAI {
  if (!client) {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey) {
      throw new Error("GEMINI_API_KEY nao configurada no .env");
    }

    client = new GoogleGenerativeAI(apiKey);
  }

  return client;
}

export interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

export async function askGemini(
  systemPrompt: string,
  history: ChatMessage[],
  userMessage: string
): Promise<string> {
  const genAI = getGeminiClient();
  const model = genAI.getGenerativeModel({
    model: "gemini-2.5-flash",
    systemInstruction: systemPrompt
  });

  const geminiHistory = history.map((msg) => ({
    role: msg.role === "assistant" ? "model" : "user",
    parts: [{ text: msg.content }]
  }));

  const chat = model.startChat({ history: geminiHistory });
  const result = await chat.sendMessage(userMessage);

  return result.response.text();
}