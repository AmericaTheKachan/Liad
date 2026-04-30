import path from "path";
import express, { Request, Response } from "express";
import { loadEnvFile } from "./utils/loadEnv";

loadEnvFile(path.join(process.cwd(), ".env"));

const app = express();
const port = Number(process.env.PORT ?? "3000");
const publicDir = path.join(__dirname, "..", "public");
const pagesDir = path.join(publicDir, "pages");

const requiredFirebaseKeys = [
  "FIREBASE_API_KEY",
  "FIREBASE_AUTH_DOMAIN",
  "FIREBASE_PROJECT_ID",
  "FIREBASE_STORAGE_BUCKET",
  "FIREBASE_MESSAGING_SENDER_ID",
  "FIREBASE_APP_ID"
] as const;

function sendPage(res: Response, fileName: string) {
  res.sendFile(path.join(pagesDir, fileName));
}

app.use(express.json());
app.use(express.static(publicDir));

app.get("/", (req: Request, res: Response) => {
  sendPage(res, "index.html");
});

app.get("/login", (req: Request, res: Response) => {
  sendPage(res, "login.html");
});

app.get("/cadastro", (req: Request, res: Response) => {
  sendPage(res, "signup.html");
});

app.get("/completar-cadastro", (req: Request, res: Response) => {
  sendPage(res, "complete-profile.html");
});

app.get("/dashboard", (req: Request, res: Response) => {
  sendPage(res, "dashboard.html");
});

app.get("/metricas", (req: Request, res: Response) => {
  sendPage(res, "dashboard.html");
});

app.get("/api", (req: Request, res: Response) => {
  sendPage(res, "dashboard.html");
});

app.get("/produtos", (req: Request, res: Response) => {
  sendPage(res, "dashboard.html");
});

// ✅ NOVAS ROTAS
app.get("/termos", (req: Request, res: Response) => {
  sendPage(res, "termos.html");
});

app.get("/privacidade", (req: Request, res: Response) => {
  sendPage(res, "privacidade.html");
});

app.get("/contato", (req: Request, res: Response) => {
  sendPage(res, "contato.html");
});

app.get("/documentacao", (req: Request, res: Response) => {
  sendPage(res, "documentacao.html");
});

app.get("/api/firebase-config", (req: Request, res: Response) => {
  const config = {
    apiKey: process.env.FIREBASE_API_KEY ?? "",
    authDomain: process.env.FIREBASE_AUTH_DOMAIN ?? "",
    projectId: process.env.FIREBASE_PROJECT_ID ?? "",
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET ?? "",
    messagingSenderId: process.env.FIREBASE_MESSAGING_SENDER_ID ?? "",
    appId: process.env.FIREBASE_APP_ID ?? "",
    measurementId: process.env.FIREBASE_MEASUREMENT_ID ?? ""
  };

  const missingKeys = requiredFirebaseKeys.filter((key) => !process.env[key]);

  res.setHeader("Cache-Control", "no-store");
  res.json({
    configured: missingKeys.length === 0,
    missingKeys,
    config
  });
});

app.listen(port, () => {
  console.log(`Servidor rodando em http://localhost:${port}`);
});