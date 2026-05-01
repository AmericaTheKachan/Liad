# LIAD

Plataforma LIAD — assistente de vendas com IA para lojistas.

## Estrutura do repositório

```
Liad/
  liad-web/   → Frontend + servidor de páginas (Node.js + Express + Firebase)
  liad-ai/    → API de IA (Node.js + Express + Gemini + Firebase Admin)
```

---

## liad-web

Aplicação web com páginas públicas e fluxo de autenticação usando Firebase.

### Rotas

| Rota | Descrição |
|------|-----------|
| `/` | Página inicial |
| `/login` | Login com Google ou email/senha |
| `/cadastro` | Criação de conta |
| `/completar-cadastro` | Onboarding após autenticação |
| `/dashboard` | Área autenticada |
| `/metricas` | Métricas de performance |
| `/produtos` | Upload e gerenciamento de CSVs de produtos |
| `/api/firebase-config` | Entrega a configuração pública do Firebase |

### Tecnologias

- Node.js + TypeScript + Express
- Firebase Authentication
- Firebase Firestore
- Firebase Storage
- Tailwind via CDN

### Como executar

```bash
cd liad-web
npm install
npm run dev
```

Servidor iniciado em `http://localhost:3000`.

### Variáveis de ambiente

Crie um `.env` baseado no `.env.example`:

```env
PORT=3000
FIREBASE_API_KEY=
FIREBASE_AUTH_DOMAIN=
FIREBASE_PROJECT_ID=
FIREBASE_STORAGE_BUCKET=
FIREBASE_MESSAGING_SENDER_ID=
FIREBASE_APP_ID=
FIREBASE_MEASUREMENT_ID=
```

---

## liad-ai

API de IA responsável por responder perguntas de clientes com base no catálogo de produtos enviado pelo lojista.

### Rotas

| Rota | Descrição |
|------|-----------|
| `POST /chat` | Recebe mensagem e retorna resposta da IA |
| `GET /widget.js` | Entrega o script do widget de atendimento |
| `GET /health` | Verifica se o serviço está no ar |

### Tecnologias

- Node.js + TypeScript + Express
- Google Gemini 2.5 Flash
- Firebase Admin SDK (Firestore + Storage)

### Como funciona

1. O lojista envia um CSV de produtos pelo dashboard
2. O CSV é salvo no Firebase Storage
3. Quando um cliente envia uma mensagem, o endpoint `/chat` busca o CSV mais recente do Storage
4. O conteúdo do CSV é passado como contexto para o Gemini
5. O Gemini responde com base nos dados do catálogo

### Como executar

```bash
cd liad-ai
npm install
npm run dev
```

Servidor iniciado em `http://localhost:3001`.

### Widget

Com o `liad-ai` rodando, o widget fica disponível em:

```html
<script src="http://localhost:3001/widget.js" data-account-id="ID_DA_CONTA"></script>
```

O mesmo script também aceita `data-liad-key` e `data-key` para manter compatibilidade com os snippets exibidos no painel.

### Variáveis de ambiente

Crie um `.env` baseado no `.env.example`:

```env
PORT=3001
GEMINI_API_KEY=
GOOGLE_APPLICATION_CREDENTIALS="./service-account.json"
FIREBASE_STORAGE_BUCKET=
```

> O arquivo `service-account.json` deve ser baixado no Firebase Console → Configurações do projeto → Contas de serviço → Gerar nova chave privada. **Nunca suba esse arquivo para o repositório.**

### Exemplo de requisição

```bash
POST http://localhost:3001/chat
Content-Type: application/json

{
  "accountId": "00000000000000",
  "message": "Quais produtos vocês têm?",
  "history": []
}
```

### Resposta

```json
{
  "reply": "Temos os seguintes produtos disponíveis..."
}
```

---

## Pré-requisitos

- Node.js 18 ou superior
- npm
- Projeto Firebase configurado
- Chave da API do Gemini (Google AI Studio)

## Firebase

As instruções de setup do Firebase estão em `liad-web/docs/firebase-auth-setup.md`, incluindo:

- Variáveis de ambiente
- Estrutura esperada no Firestore
- Regras recomendadas do Firestore e Storage
- Fluxo de autenticação implementado
