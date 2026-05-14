import { GoogleGenerativeAI } from "@google/generative-ai";

export interface Product {
  [key: string]: string | number | boolean | null | undefined;
}

export interface CatalogSchemaAnalysis {
  semantic_fields: string[];
  structured_filters: string[];
  ranking_fields: string[];
  ignored_fields: string[];
  embedding_template: string;
  recommended_metadata: Record<string, string>;
  retrieval_pipeline: string[];
  schema_improvements: string[];
  example_queries: string[];
}

export async function analyzeCatalogSchema(sampleProduct: Product): Promise<CatalogSchemaAnalysis> {
  const key = process.env.GEMINI_API_KEY;
  if (!key) throw new Error("GEMINI_API_KEY is not set in environment variables.");
  
  const model = new GoogleGenerativeAI(key).getGenerativeModel({
    model: "gemini-2.5-flash",
  });

  const prompt = `You are a senior AI architect specialized in:
- RAG systems
- semantic search
- e-commerce retrieval
- hybrid search
- vector databases
- LLM recommendation systems

Your task is to analyze a product database schema and generate the ideal retrieval structure for an AI shopping assistant.

The assistant must:
- answer natural language shopping questions
- recommend products
- apply structured filters
- use semantic search correctly
- avoid hallucinations
- support hybrid retrieval

-----------------------------------
YOUR GOALS
-----------------------------------

1. Analyze the product fields
2. Identify:
   - semantic fields
   - structured filter fields
   - ranking fields
   - useless fields for embeddings
3. Generate:
   - optimized embedding text strategy
   - filter extraction strategy
   - ideal searchable metadata
   - retrieval pipeline
4. Suggest improvements to the schema if necessary

-----------------------------------
IMPORTANT RULES
-----------------------------------

- Do NOT embed IDs, SKUs, timestamps, hashes, URLs, or stock numbers
- Embeddings should contain only semantically meaningful product information
- Structured attributes should be separated from vector search
- Prioritize hybrid retrieval:
  - metadata filters
  - semantic similarity
  - reranking
- Consider multilingual search
- Consider e-commerce recommendation quality
- Consider scalability

-----------------------------------
OUTPUT FORMAT
-----------------------------------

Return ONLY valid JSON using this structure:

{
  "semantic_fields": [],
  "structured_filters": [],
  "ranking_fields": [],
  "ignored_fields": [],
  "embedding_template": "",
  "recommended_metadata": {},
  "retrieval_pipeline": [],
  "schema_improvements": [],
  "example_queries": []
}

Now analyze the provided database schema:
${JSON.stringify(sampleProduct, null, 2)}`;

  const result = await model.generateContent({
    contents: [{ role: 'user', parts: [{ text: prompt }] }],
    generationConfig: {
      responseMimeType: "application/json",
    }
  });

  return JSON.parse(result.response.text()) as CatalogSchemaAnalysis;
}
