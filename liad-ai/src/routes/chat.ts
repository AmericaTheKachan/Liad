import { Request, Response, Router } from "express";
import { askGemini, ChatMessage } from "../services/gemini";
import { getAccountData, getLatestCsvForAccount } from "../services/firebase-admin";
import fs from "fs";
import path from "path";

const router = Router();

function buildSystemPrompt(storeName: string, csvContent: string | null): string {
  const promptPath = path.join(__dirname, "system-prompt.md");
  let promptTemplate = fs.readFileSync(promptPath, "utf-8");
  
  promptTemplate = promptTemplate.replace("{storeName}", storeName);
  promptTemplate = promptTemplate.replace("{csvContent}", csvContent ? csvContent.trim() : "No catalog available");
  
  return promptTemplate;
}

router.post("/chat", async (req: Request, res: Response) => {
  const { accountId, message, history } = req.body as {
    accountId?: string;
    message?: string;
    history?: ChatMessage[];
  };

  if (!accountId || typeof accountId !== "string") {
    res.status(400).json({ error: "accountId é obrigatório." });
    return;
  }

  if (!message || typeof message !== "string" || message.trim().length === 0) {
    res.status(400).json({ error: "message é obrigatório." });
    return;
  }

  const safeHistory = Array.isArray(history)
  ? history.filter(
      (msg) =>
        msg &&
        (msg.role === "user" || msg.role === "model") &&
        Array.isArray(msg.parts) &&
        msg.parts.length > 0 &&
        typeof msg.parts[0].text === "string" &&
        msg.parts[0].text.trim().length > 0
    ) as ChatMessage[]
  : [];

  try {
    const [csvContent, account] = await Promise.all([
      getLatestCsvForAccount(accountId),
      getAccountData(accountId)
    ]);

    if (!account) {
      res.status(404).json({ error: "Conta não encontrada." });
      return;
    }

    const storeName: string = account.storeName ?? "Loja";
    const systemPrompt = buildSystemPrompt(storeName, csvContent);
    const reply = await askGemini(systemPrompt, safeHistory, message.trim());

    res.json({ reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Erro interno.";
    console.error("[/api/chat]", error);
    res.status(500).json({ error: message });
  }
});

export default router;