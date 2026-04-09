# LIAD Design System

## Tokens globais

- Cores base:
  - `liad.bg`
  - `liad.panel`
  - `liad.card`
  - `liad.text`
  - `liad.muted`
- Cores de destaque:
  - `liad.purple`
  - `liad.violet`
  - `liad.blue`
  - `liad.orange`
  - `liad.success`
- Fontes:
  - `font-body`
  - `font-display`
- Sombras:
  - `shadow-panel`
  - `shadow-glow`
  - `shadow-cta`

## Arquivos globais

- `public/assets/css/global.css`
  - Contem variaveis CSS, fontes globais, sombras e backgrounds reutilizaveis.
- `public/assets/js/tailwind-config.js`
  - Centraliza a configuracao do Tailwind para todos os HTMLs do projeto.

## Como usar em paginas HTML

Carregar nesta ordem:

1. `global.css`
2. `tailwind-config.js`
3. CDN do Tailwind

## Convencoes

- Preferir tokens `liad.*` em vez de hex direto.
- Preferir `font-display` para titulos e `font-body` para textos corridos.
- Reutilizar sombras do sistema antes de criar novas.
- Para fundos recorrentes, usar as classes globais:
  - `liad-bg-hero`
  - `liad-bg-hero-glow`
  - `liad-bg-section-glow`
  - `liad-bg-dot-grid`
