# LIAD AI — Arquitetura do Projeto

> Gerado em 2026-05-17. Use este documento como referência para análise e evolução da base de código.

---

## Visão Geral

**liad-ai** é uma API backend Node.js/TypeScript que alimenta um assistente de compras por IA para e-commerces. Cada loja cliente (conta) tem seu catálogo de produtos em CSV armazenado no Firebase Storage. O sistema carrega esse catálogo em memória, indexa com BM25, e usa Gemini 2.5 Flash para extrair intenção e gerar recomendações. Um widget JavaScript embeddável (`widget.js`) é servido pela própria API e integrado nas lojas clientes.

---

## Stack

| Camada | Tecnologia |
|---|---|
| Runtime | Node.js + TypeScript |
| Web framework | Express 5 |
| LLM | Google Gemini 2.5 Flash (`@google/generative-ai`) |
| Busca | MiniSearch (BM25 full-text) |
| Banco de dados | Firebase Firestore + Storage (`firebase-admin`) |
| CSV parsing | `csv-parse` |
| Rate limiting | `express-rate-limit` |
| Dev runner | `tsx watch` |

---

## Estrutura de Arquivos

```
liad-ai/
├── .env                          # Variáveis de ambiente (gitignored)
├── .env.example                  # Template de configuração
├── package.json
├── tsconfig.json
├── system-prompt.md              # Template do system prompt (ATIVO — lido em runtime)
│
├── public/
│   └── widget.js                 # Widget embeddável (IIFE, vanilla JS, ~1100 linhas)
│
└── src/
    ├── server.ts                 # Entry point: Express, rotas, preload de índices
    │
    ├── routes/
    │   ├── chat.ts               # POST /chat — pipeline principal de chat
    │   ├── metrics.ts            # GET /metrics — analytics/dashboard
    │   └── system-prompt.md      # ⚠️ ARQUIVO OBSOLETO (nunca carregado, ver análise)
    │
    ├── services/
    │   ├── assistant-orchestrator.ts   # Orquestra o pipeline RAG completo
    │   ├── semantic-search.ts          # Índice BM25 por conta (build, search, cache)
    │   ├── intent-extractor.ts         # Extrai intenção de compra via Gemini
    │   ├── metadata-filter.ts          # Filtros hard: preço, gênero, tamanho, categoria
    │   ├── hybrid-ranker.ts            # Reranking por estoque/avaliação/schema
    │   ├── recommendation-engine.ts    # Gera resposta final via Gemini (chat)
    │   ├── schema-analysis.ts          # Analisa schema do catálogo via Gemini (async)
    │   └── firebase-admin.ts           # Firebase: CSV, contas, logging, cache
    │
    └── utils/
        ├── gemini-client.ts            # Singleton do cliente Gemini
        ├── csv-utils.ts                # Parsing CSV, formatação, extração de números/nomes
        └── loadEnv.ts                  # Parser manual de .env
```

---

## Fluxo de uma Requisição de Chat

```
POST /chat
  │
  ├─ [Validação] apiKey + message obrigatórios
  ├─ [Rate limit] 30 req/min por apiKey (fallback: IP)
  │
  ├─ Firebase: getAccountByApiKey()        ──► resolve a conta pela chave ativa
  ├─ Firebase: getLatestCsvForAccount()  ──► cache 10min em memória
  │
  ├─ [Index check] CSV hash mudou? → buildIndex() em background (BM25)
  │     └─ Se índice ainda não existe: aguarda até 30s com polling de 500ms
  │
  └─ processChatRequest() [assistant-orchestrator]
        │
        ├─ 1. getCatalogCategories()           ── lê cache em memória
        ├─ 2. extractIntent(userMessage)       ── Gemini call #1 (JSON mode)
        │      └─ ShoppingIntent { searchQuery, filters, isShoppingIntent }
        │
        ├─ [Se não é intenção de compra]
        │      └─ getCatalogSample(20) → generateRecommendation() ── Gemini call #2
        │
        ├─ 3. getAllProducts()                  ── lê cache em memória
        ├─ 4. filterProducts()                 ── filtro hard (preço, gênero, tamanho, cat)
        ├─ 5. searchProducts()                 ── BM25 via MiniSearch (topK=20)
        │      └─ candidateSet filtra apenas produtos que passaram no metadata-filter
        │
        ├─ 6. rankProducts()                   ── ajusta score BM25 com metadata
        │      ├─ penaliza sem estoque (×0.5) ou baixo estoque (×0.9)
        │      ├─ promove rating ≥ 4.5 (×1.05)
        │      └─ schema_fields boost (log10 * 0.01)
        │
        └─ 7. generateRecommendation()         ── Gemini call #2 (chat com histórico)
               └─ system prompt = system-prompt.md + categorias + CSV dos top produtos

  └─ logConversation() em background (Firestore, não bloqueia resposta)
```

---

## Endpoints da API

| Método | Rota | Auth | Descrição |
|---|---|---|---|
| GET | `/health` | Nenhuma | Health check |
| GET | `/widget.js` | Nenhuma | Serve o widget JS embeddável |
| POST | `/chat` | API Key (`apiKey`) | Chat com o assistente |
| GET | `/api-keys` | Firebase Bearer token | Retorna a chave ativa da conta |
| POST | `/api-keys` | Firebase Bearer token | Gera ou rotaciona a chave ativa |
| DELETE | `/api-keys` | Firebase Bearer token | Revoga a chave ativa |
| GET | `/metrics` | Nenhuma ⚠️ | Analytics por período |
| DELETE | `/admin/index-cache` | `X-Admin-Key` header | Limpa cache de índices |

---

## Gerenciamento de Índices BM25

```
semantic-search.ts
  ├─ indexes: Map<accountId, AccountIndex>     ── índice em memória (per-account)
  ├─ indexBuilding: Map<accountId, Promise>    ── evita builds paralelos
  │
  ├─ buildIndex(accountId, products, hash)
  │     ├─ Verifica se hash mudou (evita rebuild desnecessário)
  │     ├─ MiniSearch: fields dinâmicos excluindo IDs/URLs/imagens
  │     ├─ Boost 2× em campos semânticos (name, nome, title, description...)
  │     ├─ addAllAsync() em chunks de 500 (não bloqueia event loop)
  │     ├─ Extrai categorias únicas do catálogo
  │     └─ Dispara analyzeCatalogSchema() em background (async, silencia erros)
  │
  └─ AccountIndex {
       miniSearch, products[], hash, categories[], schemaAnalysis?
     }
```

**Preload:** Na inicialização do servidor, `preloadIndexes()` busca todos os `accountId`s do Firestore e constrói o índice de cada conta sequencialmente.

---

## Cache em Memória

| Item | TTL | Onde |
|---|---|---|
| CSV por conta | 10 minutos | `firebase-admin.ts` (`csvMemoryCache`) |
| Dados da conta | 30 minutos | `firebase-admin.ts` (`accountMemoryCache`) |
| Índice BM25 | Até restart / mudança de hash | `semantic-search.ts` (`indexes`) |
| Schema analysis | Até restart / mudança de hash | `semantic-search.ts` (dentro de `AccountIndex`) |
| System prompt template | Até restart | `recommendation-engine.ts` (`_promptTemplate`) |

---

## Widget Frontend (`public/widget.js`)

IIFE (Immediately Invoked Function Expression) em vanilla JS sem dependências externas. Configurado via atributos no `<script>` tag:

```html
<script src="https://sua-api.com/widget.js"
  data-liad-key="sk-liad-sua-chave"
  data-api-url="https://sua-api.com"
  data-logo-url="https://sua-loja.com/logo.png">
</script>
```

Funcionalidades:
- Chat flutuante com animações CSS
- Renderização de markdown customizada (sem biblioteca externa)
- Product cards com imagem placeholder, nome, preço, descrição e link
- TTS (Text-to-Speech) via Web Speech API
- STT (Speech-to-Text) via Web Speech Recognition API
- Histórico de conversa mantido em memória (últimas 6 mensagens enviadas ao servidor)
- Responsive: mobile (<420px) ocupa 100vw e 78vh

---

## Variáveis de Ambiente

| Variável | Obrigatória | Descrição |
|---|---|---|
| `GEMINI_API_KEY` | Sim | Chave da API do Google Generative AI |
| `GOOGLE_APPLICATION_CREDENTIALS` | Sim | Caminho para o service account JSON do Firebase |
| `FIREBASE_STORAGE_BUCKET` | Sim | Nome do bucket do Firebase Storage |
| `PORT` | Não (default: 3001) | Porta do servidor |
| `ADMIN_KEY` | Não | Chave para o endpoint admin de limpeza de cache |
| `NODE_ENV` | Não | `production` habilita cache-control de 5min no widget.js |

---

## Chamadas ao Gemini por Requisição de Chat

| Chamada | Modelo | Modo | Quando |
|---|---|---|---|
| `extractIntent()` | gemini-2.5-flash | JSON mode | Sempre (toda mensagem) |
| `generateRecommendation()` | gemini-2.5-flash | Chat | Sempre (toda mensagem) |
| `analyzeCatalogSchema()` | gemini-2.5-flash | JSON mode | 1× por conta (async, no build do índice) |

**Total por request de chat: 2 chamadas síncronas ao Gemini.**

---

## Estrutura do Firestore

```
accounts/
  {accountId}/
    ├─ storeName: string
    ├─ apiKeyValue: string
    ├─ apiKeyHash: string
    ├─ apiKeyPrefix: string
    ├─ apiKeyLast4: string
    ├─ apiKeyCreatedAt: Timestamp
    ├─ apiKeyLastUsedAt: Timestamp | null
    ├─ ...outros campos da conta
    ├─ csvUploads/
    │    └─ {docId}/
    │         ├─ storagePath: string  (caminho no Firebase Storage)
    │         └─ uploadedAt: Timestamp
    └─ conversations/
         └─ {docId}/
              ├─ timestamp: Timestamp
              ├─ messageCount: number
              ├─ topProduct: string | null
              └─ responseTimeMs: number
```

---

## Dependências

### Produção
- `@google/generative-ai` — SDK do Gemini
- `cors` — CORS middleware
- `csv-parse` — Parsing de CSV
- `express` — Web framework (v5)
- `express-rate-limit` — Rate limiting
- `firebase-admin` — Firebase SDK server-side
- `minisearch` — BM25 full-text search

### Dev
- `tsx` — Runner TypeScript sem build
- `typescript`
- `@types/cors`, `@types/express`, `@types/node`
- `@types/express-rate-limit` — ⚠️ Provavelmente desnecessário (express-rate-limit v7+ inclui types)
