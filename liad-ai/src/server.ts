import path from "path";
import fs from "fs";
import express, { Request, Response } from "express";
import cors from "cors";
import { loadEnvFile } from "./utils/loadEnv";
import chatRouter from "./routes/chat";

loadEnvFile(path.join(process.cwd(), ".env"));

const app = express();
const port = Number(process.env.PORT ?? "3001");

function findWidgetFile(): string | null {
  const candidates = [
    path.join(process.cwd(), "public", "widget.js"),
    path.join(__dirname, "..", "public", "widget.js")
  ];

  return candidates.find((candidate) => fs.existsSync(candidate)) ?? null;
}

app.use(cors());
app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.get("/widget.js", (_req: Request, res: Response) => {
  const widgetFile = findWidgetFile();

  if (!widgetFile) {
    res.status(404).type("text/plain").send("LIAD widget not found.");
    return;
  }

  res.setHeader("Content-Type", "application/javascript; charset=utf-8");
  res.setHeader("Cache-Control", process.env.NODE_ENV === "production" ? "public, max-age=300" : "no-store");
  res.sendFile(widgetFile);
});

app.use("/", chatRouter);

app.listen(port, () => {
  console.log(`LIAD AI rodando em http://localhost:${port}`);
});
