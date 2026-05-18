export interface ShoppingIntent {
  searchQuery: string;
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

// Non-shopping patterns
const GREETING_RE = /^(oi|ola|hi|hey|hello|bom dia|boa tarde|boa noite|eai|tudo bem|como vai)[\s!?.]*$/i;
const THANKS_RE   = /^(obrigad[oa]|valeu|vlw|thanks|ok|certo|entendi|perfeito|show|blz|beleza|otimo|tchau|bye|flw)[\s!?.]*$/i;

/**
 * Portuguese stopwords / filler phrases common in shopping queries.
 * Removing these isolates the meaningful search terms (brand, product type, etc.)
 * e.g. "Tem algum produto JBL?" -> "JBL"
 *      "Quero comprar um headset gamer" -> "headset gamer"
 */
const PT_STOPWORDS_RE = /\b(tem|ha|voce|vc|algum|alguma|alguns|algumas|um|uma|uns|umas|o|a|os|as|de|do|da|dos|das|no|na|nos|nas|ao|e|ou|por|para|em|que|se|nao|sim|so|tb|tbm|me|meu|minha|meus|minhas|seu|sua|seus|suas|eu|ele|ela|eles|elas|isso|este|esta|estes|estas|esse|essa|esses|essas|aqui|la|entao|ai|mais|menos|bem|muito|pouco|qual|quais|quero|preciso|busco|procuro|gostaria|queria|comprar|ver|encontrar|mostrar|indicar|recomendar|existe|existem|ter|produto|produtos|item|items|coisa|coisas|algo|nenhum|nenhuma|disponivel|disponibilidade|catalogo|loja|marca|tipo|modelo|saber|quer|voces)\b/gi;

// Price patterns
const RANGE_PRICE_RE = /(?:de|entre)\s*R?\$?\s*([\d.,]+)\s*(?:a|ate|e)\s*R?\$?\s*([\d.,]+)/i;
const MAX_PRICE_RE   = /(?:ate|menos de|abaixo de|no maximo|max\.?|por ate)\s*R?\$?\s*([\d.,]+)/i;
const MIN_PRICE_RE   = /(?:acima de|a partir de|mais de|pelo menos|minimo|min\.?)\s*R?\$?\s*([\d.,]+)/i;
const BARE_PRICE_RE  = /R\$\s*([\d.,]+)/i;
const CHEAP_RE       = /\b(barato|baratos|barata|baratas|economico|em conta|bom preco|acessivel|promocional)\b/gi;
const PRICE_UNIT_RE  = /\b(reais?|brl)\b/gi;

// Gender patterns
const CHILD_RE  = /\b(infantil|para crianca|para menino|para menina|kids?)\b/i;
const MALE_RE   = /\b(masculino|para homem|para homens|para ele|de homem)\b/i;
const FEMALE_RE = /\b(feminino|para mulher|para mulheres|para ela|de mulher)\b/i;

// Size patterns
const SIZE_WORD_RE  = /\btamanho\s+(pp|p|m|g|gg|xg|xxg|[3-4]\d|[0-9]+)\b/i;
const SIZE_ABREV_RE = /(?<![a-z])\b(pp|gg|xg|xxg)\b(?![a-z])/i;

function parsePrice(s: string): number {
  const cleaned = s.includes(",") && s.includes(".")
    ? s.replace(/\./g, "").replace(",", ".")
    : s.replace(",", ".");
  return parseFloat(cleaned);
}

export function extractIntent(userMessage: string): ShoppingIntent {
  const msg = userMessage.trim();
  const lower = msg.toLowerCase();

  // Non-shopping: pure greetings and thank-yous
  if (GREETING_RE.test(msg) || THANKS_RE.test(msg)) {
    return { searchQuery: msg, filters: {}, isShoppingIntent: false };
  }

  const filters: ShoppingIntent["filters"] = {};
  let q = msg;

  // Price range
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

  // Gender
  if (CHILD_RE.test(lower))       { filters.gender = "infantil";  q = q.replace(CHILD_RE, " "); }
  else if (MALE_RE.test(lower))   { filters.gender = "masculino"; q = q.replace(MALE_RE, " "); }
  else if (FEMALE_RE.test(lower)) { filters.gender = "feminino";  q = q.replace(FEMALE_RE, " "); }

  // Size
  const sizeWord = msg.match(SIZE_WORD_RE);
  if (sizeWord) {
    filters.size = sizeWord[1].toUpperCase();
    q = q.replace(SIZE_WORD_RE, " ");
  } else {
    const sizeAbrev = msg.match(SIZE_ABREV_RE);
    if (sizeAbrev) filters.size = sizeAbrev[1].toUpperCase();
  }

  // Strip Portuguese filler words so the meaningful terms (brand, product type)
  // get full BM25 weight -- e.g. "Tem algum produto JBL?" -> "JBL"
  q = q.replace(PT_STOPWORDS_RE, " ");

  // Normalize whitespace and strip leading/trailing punctuation left by stopword removal
  q = q.replace(/\s+/g, " ").replace(/^[\s,;.!?]+|[\s,;.!?]+$/g, "").trim();
  if (!q || /^[\d\s.,!?]+$/.test(q)) q = "produto";

  return { searchQuery: q, filters, isShoppingIntent: true };
}
