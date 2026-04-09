# LIAD Web

Aplicação web da LIAD com páginas públicas e fluxo de autenticação usando Firebase.
O projeto utiliza **Node.js**, **TypeScript** e **Express** para servir arquivos estáticos e expor a configuração do Firebase para o frontend.

## Visão Geral

A aplicação possui as seguintes rotas principais:

- `/` - página inicial
- `/login` - login com Google ou email/senha
- `/cadastro` - criação de conta
- `/completar-cadastro` - conclusão de onboarding após autenticação
- `/dashboard` - área autenticada
- `/metricas` - rota apontando para o dashboard atual
- `/api` - rota apontando para o dashboard atual
- `/api/firebase-config` - endpoint que entrega a configuração pública do Firebase

## Tecnologias Utilizadas

- Node.js
- TypeScript
- Express
- Firebase Authentication
- Firebase Firestore
- Firebase Storage
- Tailwind via CDN no frontend

## Pré-requisitos

Antes de executar o projeto, garanta que você tenha instalado:

- [Node.js](https://nodejs.org/) 18 ou superior
- npm

## Configuração do Ambiente

Crie um arquivo `.env` na raiz do projeto com base no `.env.example`:

Preencha os valores com as credenciais do seu projeto Firebase.

## Como Executar o Projeto

### 1. Instalar as dependências

```bash
npm install
```

### 2. Configurar o arquivo `.env`

Crie o arquivo `.env` na raiz do projeto e preencha as variáveis de ambiente do Firebase.

### 3. Executar em modo de desenvolvimento

```bash
npm run dev
```

O servidor será iniciado em:

```bash
http://localhost:3000
```

Se a variável `PORT` estiver definida no `.env`, a aplicação usará esse valor.

## Build de Produção

Para gerar os arquivos compilados:

```bash
npm run build
```

Os arquivos TypeScript serão compilados para a pasta `dist`.

## Executar a versão compilada

Após o build, execute:

```bash
node dist/server.js
```

## Firebase

A aplicação depende da configuração do Firebase para autenticação e dados.
As instruções complementares de setup estão em:

- `docs/firebase-auth-setup.md`

Esse documento inclui:

- variáveis de ambiente
- estrutura esperada no Firestore
- regras recomendadas do Firestore
- regras recomendadas do Storage
- fluxo de autenticação implementado
