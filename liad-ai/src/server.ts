import path from "path";
import express, { Request, Response } from "express";
import { loadEnvFile } from "./utils/loadEnv";
import chatRouter from "./routes/chat";

loadEnvFile(path.join(process.cwd(), ".env"));

const app = express();
const port = Number(process.env.PORT ?? "3001");

app.use(express.json());

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use("/", chatRouter);

app.listen(port, () => {
  console.log(`LIAD AI rodando em http://localhost:${port}`);
});