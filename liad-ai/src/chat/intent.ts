import { getGeminiClient, type ChatMessage } from "../lib/gemini";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface ShoppingIntent {
  searchQuery: string;
  /** Populated when the customer names a specific product by brand + model/code.
   *  e.g. "Mouse Logitech G403", "Tênis Nike Air Force 1", "iPhone 15 Pro Max".
   *  null for generic/use-case queries ("mouse gamer", "camiseta para academia"). */
  specificProduct: string | null;
  filters: {
    category?: string;
    gender?: string;
    minPrice?: number;
    maxPrice?: number;
    size?: string;
    color?: string;
    occasion?: string;
    season?: string;
    [key: string]: string | number | undefined;
  };
  isShoppingIntent: boolean;
  needsClarification?: boolean;
}

// ─── Gemini prompt ────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `You are a search-intent extractor for an e-commerce chatbot.

Given the recent conversation and the customer's latest message, output a single JSON object with these fields:

- "searchQuery": a semantically enriched product search string for a vector + keyword search engine. Rules:
  1. Start with the product type (e.g. "camiseta", "tênis", "fone").
  2. When the customer describes a use case, occasion, season, or desired property, expand it into product-level attributes a catalog would use. Examples:
     - "para calor" → add: verão leve dry-fit manga curta respirável
     - "para frio" → add: inverno moletom quente térmico flanela
     - "para academia" → add: treino esportivo dry-fit fitness
     - "para trabalho / social" → add: social formal escritório
     - "para praia" → add: praia verão proteção UV summer
     - "para presente" → keep only the product type if known; otherwise leave empty
  3. Include brand, model, or context from earlier messages on short follow-ups.
  4. Correct obvious typos (e.g. "jbç" → "JBL").
  5. Keep it under 10 words. Do NOT include price, gender, or size — those go in "filters".
  6. If not a shopping request or clarification is needed, use "".
- "specificProduct": the exact product the customer is looking for, as a clean "Type Brand Model" string.
  Set ONLY when the customer names a specific brand AND a model name/number (e.g. "Mouse Logitech G403", "Tênis Nike Air Force 1", "iPhone 15 Pro Max", "Smart TV Samsung 55 QLED").
  Set to null for: brand-only queries ("algo da Nike"), category-only ("mouse gamer"), use-case queries ("tênis para academia"), or when there is no identifiable model.
- "isShoppingIntent": true if the customer is looking for a product; false for pure greetings, thanks, or chitchat.
- "needsClarification": true when the customer has clear shopping intent but hasn't named a product type. Triggered by occasion/recipient without category (e.g. "present for my mom", "something for the house"). Do NOT set true if product type is clear (e.g. "headset", "tênis", "caixa de som").
- "filters": object with ONLY the fields explicitly stated by the customer:
  - "minPrice" (number, BRL)
  - "maxPrice" (number, BRL)
  - "gender": "masculino" | "feminino" | "infantil"
  - "size": string, e.g. "M", "GG", "42"
  - "category": string, e.g. "eletronicos", "calcados"

Output ONLY the JSON. No explanation, no markdown fences.

Examples:

User: "camiseta para calor"
{"searchQuery":"camiseta verão leve dry-fit manga curta respirável","specificProduct":null,"isShoppingIntent":true,"needsClarification":false,"filters":{}}

User: "quero um tênis para academia"
{"searchQuery":"tênis academia treino esportivo running","specificProduct":null,"isShoppingIntent":true,"needsClarification":false,"filters":{}}

User: "quero o mouse logitech g403"
{"searchQuery":"mouse logitech g403","specificProduct":"Mouse Logitech G403","isShoppingIntent":true,"needsClarification":false,"filters":{}}

User: "tem nike air force 1?"
{"searchQuery":"tênis nike air force 1","specificProduct":"Tênis Nike Air Force 1","isShoppingIntent":true,"needsClarification":false,"filters":{}}

User: "iphone 15 pro max"
{"searchQuery":"smartphone iphone 15 pro max","specificProduct":"Smartphone iPhone 15 Pro Max","isShoppingIntent":true,"needsClarification":false,"filters":{}}

User: "algo da Nike"
{"searchQuery":"Nike","specificProduct":null,"isShoppingIntent":true,"needsClarification":false,"filters":{}}

User: "blusa para o frio"
{"searchQuery":"blusa inverno moletom quente térmico","specificProduct":null,"isShoppingIntent":true,"needsClarification":false,"filters":{}}

User: "Quero um presente para minha mae de ate R$100"
{"searchQuery":"","specificProduct":null,"isShoppingIntent":true,"needsClarification":true,"filters":{"maxPrice":100}}

User: "Tem algum produto JBL?"
{"searchQuery":"JBL","specificProduct":null,"isShoppingIntent":true,"needsClarification":false,"filters":{}}

History: user said "Tem algum produto JBL?" / assistant asked "Qual categoria?"
User: "HeadSet game"
{"searchQuery":"JBL headset gamer","specificProduct":null,"isShoppingIntent":true,"needsClarification":false,"filters":{}}

User: "Oi tudo bem?"
{"searchQuery":"","specificProduct":null,"isShoppingIntent":false,"needsClarification":false,"filters":{}}

User: "quero tenis masculino ate R$200"
{"searchQuery":"tenis masculino","specificProduct":null,"isShoppingIntent":true,"needsClarification":false,"filters":{"gender":"masculino","maxPrice":200}}`;

// ─── Regex-based fallback ─────────────────────────────────────────────────────

const GREETING_RE = /^(oi|ola|hi|hey|hello|bom dia|boa tarde|boa noite|eai|tudo bem|como vai)[\s!?.]*$/i;
const THANKS_RE   = /^(obrigad[oa]|valeu|vlw|thanks|ok|certo|entendi|perfeito|show|blz|beleza|otimo|tchau|bye|flw)[\s!?.]*$/i;

const PT_STOPWORDS_RE = /\b(tem|ha|voce|vc|algum|alguma|alguns|algumas|um|uma|uns|umas|o|a|os|as|de|do|da|dos|das|no|na|nos|nas|ao|e|ou|por|para|em|que|se|nao|sim|so|tb|tbm|me|meu|minha|meus|minhas|seu|sua|seus|suas|eu|ele|ela|eles|elas|isso|este|esta|estes|estas|esse|essa|esses|essas|aqui|la|entao|ai|mais|menos|bem|muito|pouco|qual|quais|quero|preciso|busco|procuro|gostaria|queria|comprar|ver|encontrar|mostrar|indicar|recomendar|existe|existem|ter|produto|produtos|item|items|coisa|coisas|algo|nenhum|nenhuma|disponivel|disponibilidade|catalogo|loja|marca|tipo|modelo|saber|quer|voces)\b/gi;

const RANGE_PRICE_RE = /(?:de|entre)\s*R?\$?\s*([\d.,]+)\s*(?:a|ate|e)\s*R?\$?\s*([\d.,]+)/i;
const MAX_PRICE_RE   = /(?:ate|menos de|abaixo de|no maximo|max\.?|por ate)\s*R?\$?\s*([\d.,]+)/i;
const MIN_PRICE_RE   = /(?:acima de|a partir de|mais de|pelo menos|minimo|min\.?)\s*R?\$?\s*([\d.,]+)/i;
const BARE_PRICE_RE  = /R\$\s*([\d.,]+)/i;
const CHEAP_RE       = /\b(barato|baratos|barata|baratas|economico|em conta|bom preco|acessivel|promocional)\b/gi;
const PRICE_UNIT_RE  = /\b(reais?|brl)\b/gi;

const CHILD_RE  = /\b(infantil|para crianca|para menino|para menina|kids?)\b/i;
const MALE_RE   = /\b(masculino|para homem|para homens|para ele|de homem)\b/i;
const FEMALE_RE = /\b(feminino|para mulher|para mulheres|para ela|de mulher)\b/i;

const SIZE_WORD_RE  = /\btamanho\s+(pp|p|m|g|gg|xg|xxg|[3-4]\d|[0-9]+)\b/i;
const SIZE_ABREV_RE = /(?<![a-z])\b(pp|gg|xg|xxg)\b(?![a-z])/i;

function parsePrice(s: string): number {
  const cleaned = s.includes(",") && s.includes(".")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  return parseFloat(cleaned);
}

function extractIntent(userMessage: string): ShoppingIntent {
  const msg = userMessage.trim();
  const lower = msg.toLowerCase();

  if (GREETING_RE.test(msg) || THANKS_RE.test(msg)) {
    return { searchQuery: msg, specificProduct: null, filters: {}, isShoppingIntent: false };
  }

  const filters: ShoppingIntent["filters"] = {};
  let q = msg;

  const rangeMatch = lower.match(RANGE_PRICE_RE);
  if (rangeMatch) {
    filters.minPrice = parsePrice(rangeMatch[1]);
    filters.maxPrice = parsePrice(rangeMatch[2]);
    q = q.replace(RANGE_PRICE_RE, " ");
  } else {
    const maxMatch = lower.match(MAX_PRICE_RE);
    if (maxMatch) { filters.maxPrice = parsePrice(maxMatch[1]); q = q.replace(MAX_PRICE_RE, " "); }
    const minMatch = lower.match(MIN_PRICE_RE);
    if (minMatch) { filters.minPrice = parsePrice(minMatch[1]); q = q.replace(MIN_PRICE_RE, " "); }
    if (!maxMatch && !minMatch) {
      const bareMatch = lower.match(BARE_PRICE_RE);
      if (bareMatch) { filters.maxPrice = parsePrice(bareMatch[1]); q = q.replace(BARE_PRICE_RE, " "); }
    }
  }

  q = q.replace(CHEAP_RE, " ").replace(PRICE_UNIT_RE, " ");

  if (CHILD_RE.test(lower))       { filters.gender = "infantil";  q = q.replace(CHILD_RE, " "); }
  else if (MALE_RE.test(lower))   { filters.gender = "masculino"; q = q.replace(MALE_RE, " "); }
  else if (FEMALE_RE.test(lower)) { filters.gender = "feminino";  q = q.replace(FEMALE_RE, " "); }

  const sizeWord = msg.match(SIZE_WORD_RE);
  if (sizeWord) {
    filters.size = sizeWord[1].toUpperCase();
    q = q.replace(SIZE_WORD_RE, " ");
  } else {
    const sizeAbrev = msg.match(SIZE_ABREV_RE);
    if (sizeAbrev) filters.size = sizeAbrev[1].toUpperCase();
  }

  q = q.replace(PT_STOPWORDS_RE, " ");
  q = q.replace(/\s+/g, " ").replace(/^[\s,;.!?]+|[\s,;.!?]+$/g, "").trim();
  if (!q || /^[\d\s.,!?]+$/.test(q)) q = "produto";

  return { searchQuery: q, specificProduct: null, filters, isShoppingIntent: true };
}

// ─── Gemini intent parsing ────────────────────────────────────────────────────

interface RawIntentResult {
  searchQuery?: unknown;
  specificProduct?: unknown;
  isShoppingIntent?: unknown;
  needsClarification?: unknown;
  filters?: {
    minPrice?: unknown;
    maxPrice?: unknown;
    gender?: unknown;
    size?: unknown;
    category?: unknown;
  };
}

function parseRawResult(raw: RawIntentResult): ShoppingIntent {
  const searchQuery = typeof raw.searchQuery === "string" ? raw.searchQuery.trim() : "";
  const isShoppingIntent = raw.isShoppingIntent === true;
  const needsClarification = raw.needsClarification === true;
  const specificProduct =
    typeof raw.specificProduct === "string" && raw.specificProduct.trim()
      ? raw.specificProduct.trim()
      : null;

  const f = raw.filters ?? {};
  const filters: ShoppingIntent["filters"] = {};

  if (typeof f.minPrice === "number" && isFinite(f.minPrice)) filters.minPrice = f.minPrice;
  if (typeof f.maxPrice === "number" && isFinite(f.maxPrice)) filters.maxPrice = f.maxPrice;
  if (typeof f.gender   === "string" && f.gender.trim())      filters.gender   = f.gender.trim();
  if (typeof f.size     === "string" && f.size.trim())        filters.size     = f.size.trim().toUpperCase();
  if (typeof f.category === "string" && f.category.trim())    filters.category = f.category.trim();

  return {
    searchQuery: searchQuery || "produto",
    specificProduct,
    isShoppingIntent,
    needsClarification,
    filters,
  };
}

export async function parseIntent(
  userMessage: string,
  history: ChatMessage[],
): Promise<ShoppingIntent> {
  try {
    const model = getGeminiClient().getGenerativeModel({
      model: "gemini-2.5-flash-lite",
      systemInstruction: SYSTEM_PROMPT,
      generationConfig: {
        responseMimeType: "application/json",
        temperature: 0,
        maxOutputTokens: 128,
      } as never,
    });

    const recent = history.slice(-3);
    const contextSnippet = recent.length > 0
      ? "Recent conversation:\n" +
        recent.map(m => `${m.role === "user" ? "Customer" : "Assistant"}: ${m.parts[0]?.text ?? ""}`).join("\n") +
        "\n\n"
      : "";

    const prompt = `${contextSnippet}Customer's latest message: "${userMessage}"`;
    const result = await model.generateContent(prompt);
    const text = result.response.text().trim();
    const intent = parseRawResult(JSON.parse(text) as RawIntentResult);

    console.log(
      `[intent] "${userMessage}" -> query="${intent.searchQuery}"` +
      (intent.specificProduct ? ` specific="${intent.specificProduct}"` : "") +
      ` shopping=${intent.isShoppingIntent} clarify=${intent.needsClarification ?? false}`,
      Object.keys(intent.filters).length ? intent.filters : ""
    );

    return intent;
  } catch (err) {
    console.warn("[intent] Gemini failed, falling back to regex:", err);
    return extractIntent(userMessage);
  }
}
