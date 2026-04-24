import { Request, Response, Router } from "express";
import { askGemini, ChatMessage } from "../services/gemini";
import { getAccountData, getLatestCsvForAccount } from "../services/firebase-admin";

const router = Router();

function buildSystemPrompt(storeName: string, csvContent: string | null): string {
  const catalogSection = csvContent
    ? `\nCATÁLOGO DE PRODUTOS (CSV):\n${csvContent}\n`
    : "\n(Nenhum catálogo de produtos foi enviado ainda para esta loja.)\n";

  return `Você é um assistente de vendas da loja "${storeName}", integrado via LIAD.
Seu papel é responder perguntas de clientes sobre produtos, preços, disponibilidade e características.

Regras:
- Responda sempre em português, de forma amigável e direta.
- Use apenas as informações do catálogo abaixo. Não invente produtos ou preços.
- Se o cliente perguntar algo fora do catálogo, diga que não tem essa informação e ofereça ajuda com o que está disponível.
- Seja conciso. Evite respostas longas demais.
- Nunca revele que é uma IA a menos que o cliente pergunte diretamente.
${catalogSection}`;
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

  const safeHistory = Array.isArray(history) ? history : [];

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