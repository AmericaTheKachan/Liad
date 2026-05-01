import path from "path";
import express, { Request, Response } from "express";
import cors from "cors";
import { loadEnvFile } from "./utils/loadEnv";
import chatRouter from "./routes/chat";

loadEnvFile(path.join(process.cwd(), ".env"));

const app = express();
const port = Number(process.env.PORT ?? "3001");
const publicDir = path.join(__dirname, "..", "public");

app.use(cors());
app.use(express.json());
app.use(express.static(publicDir, { index: false }));

app.get("/health", (_req: Request, res: Response) => {
  res.json({ status: "ok" });
});

app.use("/", chatRouter);

app.listen(port, () => {
  console.log(`LIAD AI rodando em http://localhost:${port}`);
});
