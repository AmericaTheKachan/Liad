import path from "path";
import fs from "fs";
import { loadEnvFile } from "./lib/env";
import { parseCsv, productsToPromptCsv, extractProductName } from "./lib/csv";
import { buildIndex, hybridSearch, csvHash, hasVectorIndex } from "./catalog/index";
import { getGeminiClient } from "./lib/gemini";
import type { Product } from "./lib/csv";

loadEnvFile(path.join(process.cwd(), ".env"));

// ─── CLI ──────────────────────────────────────────────────────────────────────

function getCsvPath(): string {
  const args = process.argv.slice(2);
  const flag = args.find(a => a.startsWith("--csv="));
  if (flag) return flag.split("=")[1];
  if (args[0] && !args[0].startsWith("--")) return args[0];
  console.error("Uso: npx tsx src/eval.ts --csv=./seu-catalogo.csv");
  process.exit(1);
}

// ─── Types ────────────────────────────────────────────────────────────────────

interface EvalQuery {
  query: string;
  relevant: string[];
}

interface QueryResult {
  query: string;
  relevant: string[];
  retrieved: string[];
  hits: boolean[];
}

// ─── Attribute matching ───────────────────────────────────────────────────────

// Palavras que DIFERENCIAM variantes dentro de uma mesma categoria.
// Se o produto relevante tem um desses atributos, o produto recuperado
// também precisa tê-lo para ser considerado um match.
const ATTR_KEYWORDS = new Set([
  // Tecidos / materiais têxteis
  "malha", "jeans", "denim", "viscose", "poliéster", "algodão",
  "elastano", "moletom", "fleece", "nylon", "couro", "linho", "seda",
  // Acabamento
  "estampada", "estampado", "bordado", "bordada", "liso", "lisa",
  // Materiais domésticos / utensílios
  "cerâmica", "inox", "antiaderente", "emborrachado", "emborrachada", "alumínio",
  // Specs técnicos relevantes
  "4k", "8k", "5g", "4g", "144hz", "240hz", "120hz", "oled", "amoled",
]);

/** Primeira palavra do nome = categoria do produto ("tênis", "panela", "camiseta"…) */
function productCategory(name: string): string {
  return name.toLowerCase().split(/\s+/)[0] ?? "";
}

/** Extrai atributos diferenciadores do texto completo de um produto. */
function extractAttrs(text: string): Set<string> {
  const words = text.toLowerCase().split(/[\s,\-\/|()]+/);
  return new Set(words.filter(w => ATTR_KEYWORDS.has(w)));
}

/** Concatena todos os campos não-nulos de um produto em uma string. */
function productFullText(product: Product): string {
  return Object.values(product)
    .filter(v => v !== null && v !== undefined && v !== "")
    .map(v => String(v))
    .join(" ");
}

// ─── Metrics ──────────────────────────────────────────────────────────────────

/**
 * Decide se `product` é um hit para os `relevant` labels do Gemini.
 *
 * Nível 1 — substring exato no nome (comportamento original, mais conservador)
 * Nível 2 — mesma categoria (1ª palavra) + atributos diferenciadores compatíveis
 *            Se o produto relevante tem "malha", o recuperado também precisa ter.
 *            Se o relevante não tem atributo específico, basta a categoria bater.
 * Nível 3 — quando encontramos o produto relevante no catálogo, usamos o texto
 *            COMPLETO dele (incluindo descrição) para comparar atributos —
 *            não apenas o nome que o Gemini gerou.
 */
function isMatch(
  product: Product,
  relevant: string[],
  nameToProduct: Map<string, Product>,
): boolean {
  const retrievedName = (extractProductName(product) ?? "").toLowerCase();
  const retrievedText = productFullText(product).toLowerCase();

  for (const r of relevant) {
    const rLower = r.toLowerCase();

    // 1. Substring exato no nome
    if (retrievedName.includes(rLower) || rLower.includes(retrievedName)) return true;

    // 2. Categoria (1ª palavra) deve bater
    if (productCategory(r) !== productCategory(retrievedName)) continue;

    // 3. Resolve atributos do produto relevante (usa catálogo se disponível)
    const relevantProduct = nameToProduct.get(rLower);
    const relevantText    = relevantProduct
      ? productFullText(relevantProduct).toLowerCase()
      : rLower;

    const rAttrs = extractAttrs(relevantText);
    const nAttrs = extractAttrs(retrievedText);

    // 4. Se o relevante tem atributos específicos, o recuperado precisa ter ao menos 1
    if (rAttrs.size === 0) return true;                            // sem restrição → basta categoria
    if ([...rAttrs].some(a => nAttrs.has(a))) return true;        // atributo em comum → match
  }

  return false;
}

function precisionAtK(r: QueryResult, k: number): number {
  return r.hits.slice(0, k).filter(Boolean).length / k;
}

function recallAtK(r: QueryResult, k: number): number {
  if (r.relevant.length === 0) return 0;
  // Cap hits at relevant.length: finding 3 variants of the same labeled product
  // shouldn't push recall above 1.0
  const hits = Math.min(r.hits.slice(0, k).filter(Boolean).length, r.relevant.length);
  return hits / r.relevant.length;
}

function mrr(r: QueryResult): number {
  const i = r.hits.indexOf(true);
  return i === -1 ? 0 : 1 / (i + 1);
}

function ndcgAtK(r: QueryResult, k: number): number {
  // Count at most relevant.length hits to keep DCG ≤ IDCG
  let hitsFound = 0;
  const dcg = r.hits.slice(0, k).reduce((s, hit, i) => {
    if (hit && hitsFound < r.relevant.length) {
      hitsFound++;
      return s + 1 / Math.log2(i + 2);
    }
    return s;
  }, 0);
  const ideal = Math.min(r.relevant.length, k);
  const idcg = Array.from({ length: ideal }, (_, i) => 1 / Math.log2(i + 2)).reduce((a, b) => a + b, 0);
  return idcg === 0 ? 0 : dcg / idcg;
}

function mean(values: number[]): number {
  return values.length === 0 ? 0 : values.reduce((a, b) => a + b, 0) / values.length;
}

// ─── Synthetic dataset generation ─────────────────────────────────────────────

async function generateQueries(products: Product[], count: number): Promise<EvalQuery[]> {
  const step = Math.max(1, Math.floor(products.length / 80));
  const sample = products.filter((_, i) => i % step === 0).slice(0, 80);

  const prompt = `Você está criando um dataset de avaliação para um sistema de busca de e-commerce.

Dado o catálogo de produtos abaixo, gere ${count} queries diversas que um cliente brasileiro real digitaria em um chat assistente, junto com quais produtos do catálogo são relevantes para cada query.

Regras:
- Queries em português, linguagem natural e variada
- Inclua diferentes tipos: nome direto do produto, uso/ocasião ("para calor", "para academia"), marca, descrição genérica
- Para cada query liste os nomes EXATOS dos produtos do catálogo que são relevantes (1-4 produtos)
- Inclua somente queries onde ao menos 1 produto claramente resolve a necessidade
- Varie a dificuldade: algumas fáceis (nome exato), outras mais difíceis (caso de uso)

Catálogo (amostra):
${productsToPromptCsv(sample)}

Retorne SOMENTE JSON válido, sem markdown:
[{"query":"...","relevant":["Nome Exato Produto 1","Nome Exato Produto 2"]},...]`;

  const model = getGeminiClient().getGenerativeModel({
    model: "gemini-2.5-flash",
    generationConfig: { responseMimeType: "application/json" },
  });

  const result = await model.generateContent(prompt);
  const parsed = JSON.parse(result.response.text()) as EvalQuery[];
  if (!Array.isArray(parsed)) throw new Error("Resposta inesperada do Gemini");
  return parsed.filter(q => q.query && Array.isArray(q.relevant) && q.relevant.length > 0);
}

// ─── Report ───────────────────────────────────────────────────────────────────

function printReport(
  results: QueryResult[],
  csvFile: string,
  productCount: number,
): void {
  const LINE = "━".repeat(54);
  const ks = [1, 3, 5];

  console.log(`\n${LINE}`);
  console.log("  LIAD AI — Evaluation Report");
  console.log(`  Catálogo: ${path.basename(csvFile)} (${productCount} produtos)`);
  console.log(`  Queries:  ${results.length} sintéticas`);
  console.log(LINE);

  for (const k of ks) {
    const p = mean(results.map(r => precisionAtK(r, k)));
    const rec = mean(results.map(r => recallAtK(r, k)));
    console.log(
      `  Precision@${k}:  ${p.toFixed(3)}    Recall@${k}:  ${rec.toFixed(3)}`,
    );
  }

  const mrrVal  = mean(results.map(mrr));
  const ndcgVal = mean(results.map(r => ndcgAtK(r, 5)));
  console.log(`  MRR:        ${mrrVal.toFixed(3)}`);
  console.log(`  NDCG@5:     ${ndcgVal.toFixed(3)}`);

  const worst = [...results]
    .sort((a, b) => precisionAtK(a, 3) - precisionAtK(b, 3))
    .slice(0, 5);

  console.log(`\n${LINE.slice(0, 28)} piores queries (P@3)`);
  for (const r of worst) {
    const p3 = precisionAtK(r, 3);
    const expected  = r.relevant.slice(0, 2).join(", ") || "—";
    const retrieved = r.retrieved.slice(0, 3).join(", ") || "—";
    console.log(`  [${p3.toFixed(2)}] "${r.query}"`);
    console.log(`         esperado:   ${expected}`);
    console.log(`         retornado:  ${retrieved}`);
  }

  console.log(LINE);
}

// ─── Main ─────────────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const csvPath = getCsvPath();

  if (!fs.existsSync(csvPath)) {
    console.error(`Arquivo não encontrado: ${csvPath}`);
    process.exit(1);
  }

  const rawCsv = fs.readFileSync(csvPath, "utf-8");
  const products = parseCsv(rawCsv);

  if (products.length === 0) {
    console.error("Nenhum produto encontrado no CSV.");
    process.exit(1);
  }

  console.log(`\n[eval] ${products.length} produtos carregados de ${path.basename(csvPath)}`);

  // Build BM25 (fast, awaitable) — embeddings continuam em background
  console.log("[eval] Construindo índice BM25...");
  const accountId = "__eval__";
  await buildIndex(accountId, products, csvHash(rawCsv));

  // Aguarda índice vetorial (embeddings em background)
  process.stdout.write("[eval] Gerando embeddings");
  const deadline = Date.now() + 5 * 60_000;
  while (!hasVectorIndex(accountId) && Date.now() < deadline) {
    await new Promise(r => setTimeout(r, 1000));
    process.stdout.write(".");
  }

  if (!hasVectorIndex(accountId)) {
    console.log("\n[eval] Aviso: embeddings não prontos — avaliando só com BM25");
  } else {
    console.log(" pronto");
  }

  // Gera queries sintéticas
  const queryCount = Math.min(40, Math.max(20, Math.floor(products.length / 25)));
  console.log(`[eval] Gerando ${queryCount} queries sintéticas com Gemini...`);
  const evalQueries = await generateQueries(products, queryCount);
  console.log(`[eval] ${evalQueries.length} queries geradas`);

  // Lookup reverso: nome-normalizado → produto completo
  // Usado para extrair descrição dos produtos relevantes durante o matching.
  const nameToProduct = new Map<string, Product>();
  for (const p of products) {
    const n = (extractProductName(p) ?? "").toLowerCase().trim();
    if (n) nameToProduct.set(n, p);
  }

  // Executa busca para cada query
  console.log("[eval] Executando buscas...");
  const results: QueryResult[] = [];

  for (const eq of evalQueries) {
    const retrieved = await hybridSearch(accountId, eq.query, products, 5);
    const names = retrieved.map(p => extractProductName(p) ?? "");
    const hits  = retrieved.map(p => isMatch(p, eq.relevant, nameToProduct));
    results.push({ query: eq.query, relevant: eq.relevant, retrieved: names, hits });
  }

  printReport(results, csvPath, products.length);
}

main().catch(err => {
  console.error("[eval] Erro fatal:", err);
  process.exit(1);
});
