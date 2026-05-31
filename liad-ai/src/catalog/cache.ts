import fs from "fs";
import path from "path";

// ─── Config ───────────────────────────────────────────────────────────────────

const CACHE_DIR = path.join(process.cwd(), ".liad-cache");

// ─── Embeddings cache ─────────────────────────────────────────────────────────

/**
 * Tenta carregar embeddings do disco para o hash de CSV fornecido.
 * Valida que o número de vetores bate com `expectedCount` para evitar
 * servir um cache de uma versão anterior com número diferente de produtos.
 *
 * Retorna `null` se não encontrar ou se o cache estiver inválido.
 */
export function loadEmbeddingsCache(
  hash: string,
  expectedCount: number,
): number[][] | null {
  const file = embeddingsCacheFile(hash);
  if (!fs.existsSync(file)) return null;

  try {
    const data = JSON.parse(fs.readFileSync(file, "utf-8")) as number[][];

    if (!Array.isArray(data) || data.length !== expectedCount) {
      console.warn(
        `[cache] Cache inválido (${data?.length ?? "?"} vetores, esperado ${expectedCount}) — regenerando`,
      );
      fs.unlinkSync(file);
      return null;
    }

    const dim = data[0]?.length ?? 0;
    console.log(
      `[cache] ✓ ${data.length} embeddings carregados do disco ` +
      `(dim=${dim}, hash=${hash.slice(0, 8)}…)`,
    );
    return data;
  } catch (err) {
    console.warn(`[cache] Falha ao ler cache: ${err}`);
    return null;
  }
}

/**
 * Persiste embeddings no disco indexados pelo hash do CSV.
 * Operação silenciosa em caso de erro (não deve quebrar o fluxo principal).
 */
export function saveEmbeddingsCache(hash: string, embeddings: number[][]): void {
  try {
    fs.mkdirSync(CACHE_DIR, { recursive: true });
    const file = embeddingsCacheFile(hash);
    fs.writeFileSync(file, JSON.stringify(embeddings));
    const sizeKB = Math.round(fs.statSync(file).size / 1024);
    console.log(
      `[cache] ✓ ${embeddings.length} embeddings salvos em ${path.basename(file)} (${sizeKB} KB)`,
    );
  } catch (err) {
    console.warn(`[cache] Falha ao salvar cache: ${err}`);
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function embeddingsCacheFile(hash: string): string {
  return path.join(CACHE_DIR, `embeddings-${hash}.json`);
}
