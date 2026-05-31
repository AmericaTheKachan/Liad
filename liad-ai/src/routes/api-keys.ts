import { NextFunction, Request, Response, Router } from "express";
import {
  createApiKeyForAccount,
  deleteApiKeyForAccount,
  getApiKeyForAccount,
  getAuthenticatedAccount,
  verifyFirebaseToken,
  type AuthenticatedAccount,
} from "../lib/firebase";

const router: Router = Router();

type AuthedRequest = Request & {
  liadAccount?: AuthenticatedAccount;
};

function readBearerToken(req: Request): string | null {
  const header = req.headers.authorization;
  if (!header) return null;

  const [scheme, token] = header.split(" ");
  if (scheme?.toLowerCase() !== "bearer" || !token) {
    return null;
  }

  return token.trim();
}

async function requireAccountAuth(req: Request, res: Response, next: NextFunction) {
  const token = readBearerToken(req);
  if (!token) {
    res.status(401).json({ error: "Token de autenticacao ausente." });
    return;
  }

  try {
    const decoded = await verifyFirebaseToken(token);
    const account = await getAuthenticatedAccount(decoded.uid);

    if (!account) {
      res.status(403).json({ error: "Conta nao encontrada para este usuario." });
      return;
    }

    (req as AuthedRequest).liadAccount = account;
    next();
  } catch (error) {
    console.error("[api-keys auth]", error);
    res.status(401).json({ error: "Token de autenticacao invalido." });
  }
}

router.use("/api-keys", requireAccountAuth);

router.get("/api-keys", async (req: AuthedRequest, res: Response) => {
  const accountId = req.liadAccount?.accountId;
  if (!accountId) {
    res.status(403).json({ error: "Conta nao encontrada." });
    return;
  }

  try {
    res.json(await getApiKeyForAccount(accountId));
  } catch (error) {
    console.error("[GET /api-keys]", error);
    res.status(500).json({ error: "Erro ao carregar a API Key." });
  }
});

router.post("/api-keys", async (req: AuthedRequest, res: Response) => {
  const accountId = req.liadAccount?.accountId;
  if (!accountId) {
    res.status(403).json({ error: "Conta nao encontrada." });
    return;
  }

  try {
    res.status(201).json(await createApiKeyForAccount(accountId));
  } catch (error) {
    console.error("[POST /api-keys]", error);
    res.status(500).json({ error: "Erro ao gerar a API Key." });
  }
});

router.delete("/api-keys", async (req: AuthedRequest, res: Response) => {
  const accountId = req.liadAccount?.accountId;
  if (!accountId) {
    res.status(403).json({ error: "Conta nao encontrada." });
    return;
  }

  try {
    res.json(await deleteApiKeyForAccount(accountId));
  } catch (error) {
    console.error("[DELETE /api-keys]", error);
    res.status(500).json({ error: "Erro ao excluir a API Key." });
  }
});

export default router;
