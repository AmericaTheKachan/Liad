(function () {
  const WELCOME_MESSAGE = "Olá! Como posso te ajudar hoje?";
  const LOCAL_AI_URL = "http://localhost:3001";

  // ─── Config via script tag ────────────────────────────────────────────────
  const SCRIPT_EL = (function () {
    return document.currentScript || document.querySelector('script[src*="widget.js"]');
  })();

  const ACCOUNT_ID = (function () {
    if (!SCRIPT_EL) return "";
    return (
      SCRIPT_EL.getAttribute("data-account-id") ||
      SCRIPT_EL.getAttribute("data-liad-account-id") ||
      SCRIPT_EL.getAttribute("data-liad-key") ||
      ""
    ).trim();
  })();

  const LIAD_AI_URL = (function () {
    const explicitUrl =
      SCRIPT_EL?.getAttribute("data-api-url") ||
      SCRIPT_EL?.getAttribute("data-liad-api-url") ||
      "";
    if (explicitUrl.trim()) return explicitUrl.trim().replace(/\/+$/, "");
    try {
      if (!SCRIPT_EL?.src) return LOCAL_AI_URL;
      const scriptUrl = new URL(SCRIPT_EL.src, window.location.href);
      const isLocalHost = ["localhost", "127.0.0.1", "::1"].includes(scriptUrl.hostname);
      if (isLocalHost && scriptUrl.port !== "3001") return LOCAL_AI_URL;
      return scriptUrl.origin;
    } catch {
      return LOCAL_AI_URL;
    }
  })();

  const LOGO_URL = (function () {
    const explicit = SCRIPT_EL?.getAttribute("data-logo-url") || "";
    if (explicit.trim()) return explicit.trim();
    try {
      const scriptUrl = new URL(SCRIPT_EL.src, window.location.href);
      return scriptUrl.origin + "/assets/images/logo.png";
    } catch {
      return "/assets/images/logo.png";
    }
  })();

  // ─── SVGs ─────────────────────────────────────────────────────────────────
  const SEND_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 8L2 2l2.5 6L2 14l12-6z" fill="#0a0a0a"/>
  </svg>`;

  const MIC_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8"  y1="23" x2="16" y2="23"/>
  </svg>`;

  const MIC_ACTIVE_SVG = `<svg width="16" height="16" viewBox="0 0 24 24" fill="currentColor" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
    <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
    <line x1="12" y1="19" x2="12" y2="23"/>
    <line x1="8"  y1="23" x2="16" y2="23"/>
  </svg>`;

  const SPEAKER_ON_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>
    <path d="M15.54 8.46a5 5 0 0 1 0 7.07"/>
  </svg>`;

  const SPEAKER_OFF_SVG = `<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
    <polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/>
    <line x1="23" y1="9" x2="17" y2="15"/>
    <line x1="17" y1="9" x2="23" y2="15"/>
  </svg>`;

  // ─── Placeholder product image ────────────────────────────────────────────
  const PLACEHOLDER_PRODUCT_IMG = "data:image/svg+xml," + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" width="320" height="150" viewBox="0 0 320 150">' +
    '<rect width="320" height="150" fill="#1c1c1c"/>' +
    '<rect x="128" y="44" width="64" height="62" rx="6" fill="none" stroke="#555" stroke-width="1.5"/>' +
    '<circle cx="148" cy="65" r="8" fill="none" stroke="#555" stroke-width="1.5"/>' +
    '<path d="M130 102 L150 78 L163 91 L171 82 L190 102" fill="none" stroke="#555" stroke-width="1.5" stroke-linejoin="round"/>' +
    '</svg>'
  );

  // ─── Styles ───────────────────────────────────────────────────────────────
  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,400&display=swap');

    #liad-widget-btn {
      position: fixed;
      bottom: 28px;
      right: 28px;
      width: 56px;
      height: 56px;
      background: #0a0a0a;
      border-radius: 50%;
      cursor: pointer;
      border: none;
      display: flex;
      align-items: center;
      justify-content: center;
      z-index: 999998;
      transition: transform 0.22s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
      box-shadow: 0 4px 24px rgba(0,0,0,0.22);
      padding: 0;
      overflow: hidden;
    }
    #liad-widget-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 8px 32px rgba(0,0,0,0.28);
    }
    #liad-widget-btn .liad-btn-logo {
      width: 30px;
      height: 30px;
      object-fit: contain;
      transition: opacity 0.2s ease, transform 0.22s ease;
      position: absolute;
    }
    #liad-widget-btn .liad-btn-close {
      transition: opacity 0.2s ease, transform 0.22s ease;
      position: absolute;
      opacity: 0;
      transform: rotate(-90deg);
    }
    #liad-widget-btn.open .liad-btn-logo  { opacity: 0; transform: rotate(90deg) scale(0.8); }
    #liad-widget-btn.open .liad-btn-close { opacity: 1; transform: rotate(0deg); }

    #liad-widget-panel {
      position: fixed;
      bottom: 96px;
      right: 28px;
      width: 368px;
      height: 540px;
      background: #0f0f0f;
      border-radius: 20px;
      z-index: 999997;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.92) translateY(20px);
      transform-origin: bottom right;
      opacity: 0;
      pointer-events: none;
      transition: transform 0.3s cubic-bezier(0.34, 1.4, 0.64, 1), opacity 0.22s ease;
      border: 1px solid rgba(255,255,255,0.08);
      font-family: 'DM Sans', -apple-system, sans-serif;
      box-shadow: 0 24px 64px rgba(0,0,0,0.5), 0 4px 16px rgba(0,0,0,0.3);
    }
    #liad-widget-panel.open {
      transform: scale(1) translateY(0);
      opacity: 1;
      pointer-events: all;
    }

    /* ── Header ── */
    #liad-panel-header {
      padding: 16px 18px;
      border-bottom: 1px solid rgba(255,255,255,0.07);
      display: flex;
      align-items: center;
      gap: 12px;
      flex-shrink: 0;
      background: #111111;
    }
    #liad-panel-header-avatar {
      width: 36px;
      height: 36px;
      background: #1c1c1c;
      border-radius: 10px;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,0.1);
      flex-shrink: 0;
      overflow: hidden;
    }
    #liad-panel-header-avatar img {
      width: 24px;
      height: 24px;
      object-fit: contain;
    }
    #liad-panel-header-info { flex: 1; min-width: 0; }
    #liad-panel-header-name {
      font-size: 13.5px;
      font-weight: 600;
      color: #f0f0f0;
      letter-spacing: 0.01em;
      line-height: 1.2;
    }
    #liad-panel-header-status {
      font-size: 11px;
      color: rgba(255,255,255,0.36);
      letter-spacing: 0.02em;
      margin-top: 2px;
      display: flex;
      align-items: center;
      gap: 5px;
    }
    .liad-status-dot {
      width: 6px;
      height: 6px;
      background: #3ecf8e;
      border-radius: 50%;
      flex-shrink: 0;
      box-shadow: 0 0 6px rgba(62,207,142,0.5);
    }

    /* ── TTS button (header) ── */
    #liad-tts-btn {
      width: 30px;
      height: 30px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.1);
      border-radius: 8px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: rgba(255,255,255,0.35);
      transition: background 0.15s, color 0.15s, border-color 0.15s;
    }
    #liad-tts-btn:hover {
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.7);
    }
    #liad-tts-btn.active {
      background: rgba(62,207,142,0.12);
      border-color: rgba(62,207,142,0.4);
      color: #3ecf8e;
    }
    #liad-tts-btn:disabled {
      opacity: 0.2;
      cursor: not-allowed;
    }

    /* ── Messages ── */
    #liad-messages {
      flex: 1;
      overflow-y: auto;
      padding: 18px 16px 10px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.07) transparent;
    }
    #liad-messages::-webkit-scrollbar { width: 3px; }
    #liad-messages::-webkit-scrollbar-track { background: transparent; }
    #liad-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.07); border-radius: 4px; }

    .liad-msg-row {
      display: flex;
      align-items: flex-end;
      gap: 8px;
      animation: liad-msg-in 0.24s cubic-bezier(0.34, 1.2, 0.64, 1) both;
    }
    .liad-msg-row.user { flex-direction: row-reverse; }

    @keyframes liad-msg-in {
      from { opacity: 0; transform: translateY(8px); }
      to   { opacity: 1; transform: translateY(0); }
    }

    .liad-msg-avatar {
      width: 26px;
      height: 26px;
      border-radius: 8px;
      background: #1c1c1c;
      border: 1px solid rgba(255,255,255,0.08);
      flex-shrink: 0;
      display: flex;
      align-items: center;
      justify-content: center;
      overflow: hidden;
      margin-bottom: 2px;
    }
    .liad-msg-avatar img { width: 17px; height: 17px; object-fit: contain; }
    .liad-msg-row.user .liad-msg-avatar { display: none; }

    .liad-msg {
      max-width: 82%;
      font-size: 13.5px;
      line-height: 1.6;
      letter-spacing: 0.01em;
    }
    .liad-msg-bot {
      background: #1c1c1c;
      color: #e4e4e4;
      padding: 11px 14px;
      border-radius: 16px 16px 16px 4px;
      border: 1px solid rgba(255,255,255,0.07);
      transition: border-color 0.2s ease, box-shadow 0.2s ease;
    }
    .liad-msg-bot.speaking {
      border-color: rgba(62,207,142,0.4) !important;
      box-shadow: 0 0 0 2px rgba(62,207,142,0.1);
    }
    .liad-msg-user {
      background: #ffffff;
      color: #0a0a0a;
      padding: 11px 14px;
      border-radius: 16px 16px 4px 16px;
      font-weight: 400;
    }

    /* ── Markdown inside bot messages ── */
    .liad-msg-bot p { margin: 0; }
    .liad-msg-bot strong { color: #ffffff; font-weight: 600; }
    .liad-msg-bot em { color: rgba(255,255,255,0.65); font-style: italic; }
    .liad-msg-bot ol {
      margin: 8px 0 4px;
      padding-left: 18px;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .liad-msg-bot ol li { padding-left: 4px; }
    .liad-msg-bot ul {
      margin: 8px 0 4px;
      padding-left: 0;
      list-style: none;
      display: flex;
      flex-direction: column;
      gap: 6px;
    }
    .liad-msg-bot ul li::before {
      content: "·";
      color: rgba(255,255,255,0.3);
      margin-right: 6px;
      font-size: 16px;
      line-height: 1;
      vertical-align: middle;
    }
    .liad-msg-bot a {
      color: #3ecf8e;
      text-decoration: none;
    }
    .liad-msg-bot a:hover { text-decoration: underline; }
    .liad-msg-bot .liad-product-card {
      background: rgba(255,255,255,0.04);
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 10px;
      margin: 6px 0;
      overflow: hidden;
    }
    .liad-msg-bot .liad-product-card:first-child { margin-top: 8px; }
    .liad-msg-bot .liad-product-img-wrap {
      width: 100%;
      height: 110px;
      overflow: hidden;
      background: #181818;
      border-bottom: 1px solid rgba(255,255,255,0.06);
    }
    .liad-msg-bot .liad-product-img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
    .liad-msg-bot .liad-product-content {
      padding: 10px 12px;
    }
    .liad-msg-bot .liad-product-name {
      font-weight: 600;
      color: #f0f0f0;
      font-size: 13px;
    }
    .liad-msg-bot .liad-product-price {
      color: #3ecf8e;
      font-size: 12.5px;
      font-weight: 500;
      margin-top: 2px;
    }
    .liad-msg-bot .liad-product-desc {
      color: rgba(255,255,255,0.5);
      font-size: 12px;
      margin-top: 4px;
      line-height: 1.5;
    }
    .liad-msg-bot .liad-product-link {
      display: inline-block;
      margin-top: 8px;
      font-size: 12px;
      color: #ffffff;
      background: rgba(255,255,255,0.1);
      border: 1px solid rgba(255,255,255,0.15);
      border-radius: 6px;
      padding: 4px 10px;
      text-decoration: none;
      transition: background 0.15s ease;
    }
    .liad-msg-bot .liad-product-link:hover { background: rgba(255,255,255,0.16); }
    .liad-msg-bot hr {
      border: none;
      border-top: 1px solid rgba(255,255,255,0.07);
      margin: 8px 0;
    }

    /* ── Timestamp ── */
    .liad-msg-time {
      font-size: 10px;
      color: rgba(255,255,255,0.2);
      margin-top: 3px;
      padding: 0 4px;
      text-align: right;
    }
    .liad-msg-row.bot .liad-msg-time { text-align: left; }

    /* ── Typing indicator ── */
    .liad-typing {
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 12px 16px;
      background: #1c1c1c;
      border-radius: 16px 16px 16px 4px;
      border: 1px solid rgba(255,255,255,0.07);
      width: fit-content;
    }
    .liad-typing span {
      width: 5px;
      height: 5px;
      background: rgba(255,255,255,0.25);
      border-radius: 50%;
      animation: liad-bounce 1.2s infinite ease-in-out;
    }
    .liad-typing span:nth-child(2) { animation-delay: 0.18s; }
    .liad-typing span:nth-child(3) { animation-delay: 0.36s; }
    @keyframes liad-bounce {
      0%, 80%, 100% { transform: scale(0.7); opacity: 0.3; }
      40% { transform: scale(1); opacity: 1; }
    }

    /* ── Input area ── */
    #liad-input-area {
      padding: 12px 14px 14px;
      border-top: 1px solid rgba(255,255,255,0.07);
      display: flex;
      gap: 8px;
      align-items: flex-end;
      flex-shrink: 0;
      background: #0f0f0f;
    }
    #liad-input {
      flex: 1;
      background: #1a1a1a;
      border: 1px solid rgba(255,255,255,0.09);
      border-radius: 12px;
      color: #e8e8e8;
      font-family: 'DM Sans', -apple-system, sans-serif;
      font-size: 13.5px;
      line-height: 1.5;
      padding: 9px 12px;
      resize: none;
      outline: none;
      max-height: 100px;
      overflow-y: auto;
      transition: border-color 0.15s ease;
      scrollbar-width: none;
    }
    #liad-input::placeholder { color: rgba(255,255,255,0.2); }
    #liad-input:focus { border-color: rgba(255,255,255,0.18); }

    /* ── Voice (mic) button ── */
    #liad-voice-btn {
      width: 36px;
      height: 36px;
      background: transparent;
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      color: rgba(255,255,255,0.45);
      transition: background 0.15s, color 0.15s, border-color 0.15s, transform 0.15s;
    }
    #liad-voice-btn:hover {
      background: rgba(255,255,255,0.06);
      color: rgba(255,255,255,0.75);
    }
    #liad-voice-btn.recording {
      background: rgba(239,68,68,0.15);
      border-color: rgba(239,68,68,0.5);
      color: #ef4444;
      animation: liad-pulse 1.4s infinite ease-in-out;
    }
    #liad-voice-btn:disabled { opacity: 0.25; cursor: not-allowed; }
    @keyframes liad-pulse {
      0%, 100% { box-shadow: 0 0 0 0 rgba(239,68,68,0.3); }
      50%       { box-shadow: 0 0 0 5px rgba(239,68,68,0); }
    }

    /* ── Send button ── */
    #liad-send-btn {
      width: 36px;
      height: 36px;
      background: #ffffff;
      border: none;
      border-radius: 10px;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      flex-shrink: 0;
      transition: background 0.15s ease, transform 0.15s ease, opacity 0.15s ease;
      opacity: 0.4;
    }
    #liad-send-btn.active { opacity: 1; }
    #liad-send-btn:hover  { background: #e8e8e8; transform: scale(1.05); }
    #liad-send-btn:active { transform: scale(0.94); }

    /* ── Footer ── */
    #liad-footer {
      text-align: center;
      font-size: 10px;
      color: rgba(255,255,255,0.14);
      padding: 0 0 11px;
      letter-spacing: 0.05em;
      flex-shrink: 0;
      font-family: 'DM Sans', -apple-system, sans-serif;
      text-transform: uppercase;
    }

    @media (max-width: 420px) {
      #liad-widget-panel {
        right: 0; bottom: 0;
        width: 100vw; height: 78vh;
        border-radius: 20px 20px 0 0;
        transform-origin: bottom center;
      }
      #liad-widget-btn { bottom: 20px; right: 20px; }
    }
  `;

  // ─── Inject styles ────────────────────────────────────────────────────────
  function injectStyles() {
    const el = document.createElement("style");
    el.textContent = styles;
    document.head.appendChild(el);
  }

  // ─── Fallback logo SVG ────────────────────────────────────────────────────
  function createFallbackLogoSVG(cls) {
    const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "20");
    svg.setAttribute("height", "20");
    svg.setAttribute("viewBox", "0 0 36 36");
    svg.setAttribute("fill", "none");
    if (cls) svg.classList.add(cls);
    svg.innerHTML = `
      <rect x="4" y="4" width="12" height="28" rx="2" fill="white"/>
      <rect x="20" y="4" width="12" height="12" rx="2" fill="white" opacity="0.7"/>
      <rect x="20" y="20" width="12" height="12" rx="2" fill="white" opacity="0.45"/>
    `;
    return svg;
  }

  // ─── Markdown renderer (from v1) ──────────────────────────────────────────
  function renderMarkdown(text) {
    const container = document.createElement("div");

    // Detect product block: optional "N. " prefix, **Name**\nR$ price\nDesc\n[Link](url)
    // Non-capturing group for the number so match indices stay stable: [1]=name [2]=price [3]=desc [4]=link text [5]=url
    const productBlockRegex = /(?:\d+\.\s+)?\*\*(.+?)\*\*\n(R\$\s*[\d.,]+)(?:\n([^\n\[*][^\n]*))?(?:\n\[(.+?)\]\((.+?)\))?(?=\n+(?:\d+\.\s+)?\*\*|$)/g;

    let hasProductCards = false;
    let lastIndex = 0;
    let match;
    const tempText = text;

    productBlockRegex.lastIndex = 0;
    while ((match = productBlockRegex.exec(tempText)) !== null) {
      hasProductCards = true;
      if (match.index > lastIndex) {
        const before = tempText.slice(lastIndex, match.index).trim();
        if (before) container.appendChild(renderInlineBlock(before));
      }

      const card = document.createElement("div");
      card.className = "liad-product-card";

      // Image
      const imgWrap = document.createElement("div");
      imgWrap.className = "liad-product-img-wrap";
      const img = document.createElement("img");
      img.className = "liad-product-img";
      img.src = PLACEHOLDER_PRODUCT_IMG;
      img.alt = match[1].trim();
      img.onerror = function () { imgWrap.style.display = "none"; };
      imgWrap.appendChild(img);
      card.appendChild(imgWrap);

      // Content
      const content = document.createElement("div");
      content.className = "liad-product-content";

      const name = document.createElement("div");
      name.className = "liad-product-name";
      name.textContent = match[1].trim();

      const price = document.createElement("div");
      price.className = "liad-product-price";
      price.textContent = match[2].trim();

      content.appendChild(name);
      content.appendChild(price);

      if (match[3]) {
        const desc = document.createElement("div");
        desc.className = "liad-product-desc";
        desc.textContent = match[3].trim();
        content.appendChild(desc);
      }

      if (match[4] && match[5]) {
        const link = document.createElement("a");
        link.className = "liad-product-link";
        link.href = match[5].trim();
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.textContent = match[4].trim();
        content.appendChild(link);
      }

      card.appendChild(content);
      container.appendChild(card);
      lastIndex = match.index + match[0].length;
    }

    if (hasProductCards) {
      if (lastIndex < tempText.length) {
        const after = tempText.slice(lastIndex).trim();
        if (after) container.appendChild(renderInlineBlock(after));
      }
      return container;
    }

    container.appendChild(renderInlineBlock(text));
    return container;
  }

  function renderInlineBlock(text) {
    const wrapper = document.createElement("div");
    const lines = text.split("\n");
    let i = 0;

    while (i < lines.length) {
      const line = lines[i];

      if (/^\d+\.\s/.test(line)) {
        const ol = document.createElement("ol");
        while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
          const li = document.createElement("li");
          li.innerHTML = parseInline(lines[i].replace(/^\d+\.\s/, ""));
          ol.appendChild(li);
          i++;
        }
        wrapper.appendChild(ol);
        continue;
      }

      if (/^[-*]\s/.test(line)) {
        const ul = document.createElement("ul");
        while (i < lines.length && /^[-*]\s/.test(lines[i])) {
          const li = document.createElement("li");
          li.innerHTML = parseInline(lines[i].replace(/^[-*]\s/, ""));
          ul.appendChild(li);
          i++;
        }
        wrapper.appendChild(ul);
        continue;
      }

      if (/^---+$/.test(line.trim())) {
        wrapper.appendChild(document.createElement("hr"));
        i++;
        continue;
      }

      if (line.trim() === "") {
        const spacer = document.createElement("div");
        spacer.style.height = "6px";
        wrapper.appendChild(spacer);
        i++;
        continue;
      }

      const p = document.createElement("p");
      p.style.margin = "0";
      p.innerHTML = parseInline(line);
      wrapper.appendChild(p);
      i++;
    }

    return wrapper;
  }

  function parseInline(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
      .replace(/\*(.+?)\*/g, "<em>$1</em>")
      .replace(/\[(.+?)\]\((.+?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  }

  // ─── Strip markdown for TTS (clean text without symbols) ─────────────────
  function stripMarkdown(text) {
    return text
      .replace(/\*\*(.+?)\*\*/g, "$1")
      .replace(/\*(.+?)\*/g, "$1")
      .replace(/\[(.+?)\]\(.+?\)/g, "$1")
      .replace(/^[-*]\s/gm, "")
      .replace(/^\d+\.\s/gm, "")
      .replace(/^---+$/gm, "")
      .replace(/\n{2,}/g, ". ")
      .replace(/\n/g, " ")
      .trim();
  }

  // ─── Time helper ──────────────────────────────────────────────────────────
  function currentTime() {
    return new Date().toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  }

  // ─── Build widget DOM ─────────────────────────────────────────────────────
  function createWidget() {
    // ── Toggle button ──
    const btn = document.createElement("button");
    btn.id = "liad-widget-btn";
    btn.setAttribute("aria-label", "Abrir chat");

    const logoImg = document.createElement("img");
    logoImg.className = "liad-btn-logo";
    logoImg.src = LOGO_URL;
    logoImg.alt = "LIAD";
    logoImg.onerror = function () {
      this.replaceWith(createFallbackLogoSVG("liad-btn-logo"));
    };

    const closeSVG = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    closeSVG.setAttribute("width", "18");
    closeSVG.setAttribute("height", "18");
    closeSVG.setAttribute("viewBox", "0 0 18 18");
    closeSVG.setAttribute("fill", "none");
    closeSVG.classList.add("liad-btn-close");
    const closePath = document.createElementNS("http://www.w3.org/2000/svg", "path");
    closePath.setAttribute("d", "M14 4L4 14M4 4l10 10");
    closePath.setAttribute("stroke", "white");
    closePath.setAttribute("stroke-width", "1.8");
    closePath.setAttribute("stroke-linecap", "round");
    closeSVG.appendChild(closePath);

    btn.appendChild(logoImg);
    btn.appendChild(closeSVG);

    // ── Panel ──
    const panel = document.createElement("div");
    panel.id = "liad-widget-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Chat de atendimento");

    // Header
    const header = document.createElement("div");
    header.id = "liad-panel-header";

    const avatarWrap = document.createElement("div");
    avatarWrap.id = "liad-panel-header-avatar";
    const avatarImg = document.createElement("img");
    avatarImg.src = LOGO_URL;
    avatarImg.alt = "LIAD";
    avatarImg.onerror = function () {
      this.replaceWith(createFallbackLogoSVG(""));
    };
    avatarWrap.appendChild(avatarImg);

    const info = document.createElement("div");
    info.id = "liad-panel-header-info";
    const nameEl = document.createElement("div");
    nameEl.id = "liad-panel-header-name";
    nameEl.textContent = "Assistente LIAD";
    const statusEl = document.createElement("div");
    statusEl.id = "liad-panel-header-status";
    const dot = document.createElement("span");
    dot.className = "liad-status-dot";
    statusEl.appendChild(dot);
    statusEl.appendChild(document.createTextNode("online"));
    info.appendChild(nameEl);
    info.appendChild(statusEl);

    const ttsBtn = document.createElement("button");
    ttsBtn.id = "liad-tts-btn";
    ttsBtn.setAttribute("aria-label", "Ativar resposta por voz");
    ttsBtn.title = "Ativar resposta por voz";
    ttsBtn.innerHTML = SPEAKER_OFF_SVG;

    header.appendChild(avatarWrap);
    header.appendChild(info);
    header.appendChild(ttsBtn);

    // Messages
    const messages = document.createElement("div");
    messages.id = "liad-messages";

    // Input area
    const inputArea = document.createElement("div");
    inputArea.id = "liad-input-area";

    const input = document.createElement("textarea");
    input.id = "liad-input";
    input.rows = 1;
    input.placeholder = "Escreva sua mensagem...";

    const voiceBtn = document.createElement("button");
    voiceBtn.id = "liad-voice-btn";
    voiceBtn.setAttribute("aria-label", "Falar");
    voiceBtn.title = "Clique e fale sua mensagem";
    voiceBtn.innerHTML = MIC_SVG;

    const sendBtn = document.createElement("button");
    sendBtn.id = "liad-send-btn";
    sendBtn.setAttribute("aria-label", "Enviar");
    sendBtn.innerHTML = SEND_SVG;

    inputArea.appendChild(input);
    inputArea.appendChild(voiceBtn);
    inputArea.appendChild(sendBtn);

    // Footer
    const footer = document.createElement("div");
    footer.id = "liad-footer";
    footer.textContent = "Powered by LIAD";

    panel.appendChild(header);
    panel.appendChild(messages);
    panel.appendChild(inputArea);
    panel.appendChild(footer);

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    return { btn, panel, messages, input, sendBtn, voiceBtn, ttsBtn };
  }

  // ─── TTS (Text-to-Speech) ─────────────────────────────────────────────────
  function initTTS(ttsBtn) {
    let ttsEnabled = false;

    if (!window.speechSynthesis) {
      ttsBtn.disabled = true;
      ttsBtn.title = "Seu navegador não suporta síntese de voz";
      return {
        isEnabled: () => false,
        speak: () => { }
      };
    }

    let voices = [];
    function loadVoices() { voices = window.speechSynthesis.getVoices(); }
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }

    function getBestVoice() {
      return (
        voices.find(v => v.name === "Microsoft Maria - Portuguese (Brazil)") ||
        voices.find(v => v.lang === "pt-BR") ||
        null
      );
    }

    ttsBtn.addEventListener("click", function () {
      ttsEnabled = !ttsEnabled;
      ttsBtn.classList.toggle("active", ttsEnabled);
      ttsBtn.innerHTML = ttsEnabled ? SPEAKER_ON_SVG : SPEAKER_OFF_SVG;
      ttsBtn.setAttribute("aria-label", ttsEnabled ? "Desativar resposta por voz" : "Ativar resposta por voz");
      ttsBtn.title = ttsEnabled
        ? "Resposta por voz ativada — clique para desativar"
        : "Ativar resposta por voz";
      if (!ttsEnabled) window.speechSynthesis.cancel();
    });

    function speak(text, msgEl) {
      if (!ttsEnabled) return;
      window.speechSynthesis.cancel();

      const clean = stripMarkdown(text);
      const utterance = new SpeechSynthesisUtterance(clean);
      utterance.lang = "pt-BR";
      utterance.rate = 1.05;
      utterance.pitch = 1;

      const voice = getBestVoice();
      if (voice) utterance.voice = voice;

      if (msgEl) {
        utterance.onstart = () => msgEl.classList.add("speaking");
        utterance.onend = () => msgEl.classList.remove("speaking");
        utterance.onerror = () => msgEl.classList.remove("speaking");
      }

      window.speechSynthesis.speak(utterance);
    }

    return { isEnabled: () => ttsEnabled, speak };
  }

  // ─── Voice input (STT) ────────────────────────────────────────────────────
  function initVoice(voiceBtn, onResult) {
    const RecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition || null;

    if (!RecognitionClass) {
      voiceBtn.disabled = true;
      voiceBtn.title = "Seu navegador não suporta entrada de voz";
      return;
    }

    let recognition = null;
    let listening = false;

    function setListening(active) {
      listening = active;
      voiceBtn.innerHTML = active ? MIC_ACTIVE_SVG : MIC_SVG;
      voiceBtn.classList.toggle("recording", active);
      voiceBtn.setAttribute("aria-label", active ? "Parar gravação" : "Falar");
      voiceBtn.title = active ? "Ouvindo… clique para parar" : "Clique e fale sua mensagem";
    }

    function stop() {
      if (recognition) { recognition.abort(); recognition = null; }
      setListening(false);
    }

    function start() {
      recognition = new RecognitionClass();
      recognition.lang = "pt-BR";
      recognition.interimResults = false;
      recognition.maxAlternatives = 1;

      recognition.onstart = () => setListening(true);
      recognition.onend = () => { setListening(false); recognition = null; };
      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript.trim();
        if (transcript) onResult(transcript);
      };
      recognition.onerror = (event) => {
        setListening(false);
        recognition = null;
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.warn("[LIAD voice] erro:", event.error);
        }
      };

      recognition.start();
    }

    voiceBtn.addEventListener("click", () => {
      if (listening) { stop(); } else { start(); }
    });
  }

  // ─── Chat logic ───────────────────────────────────────────────────────────
  function initChat(messagesEl, tts) {
    const history = [];

    function addMessage(text, role) {
      // Outer row (for avatar + bubble layout)
      const row = document.createElement("div");
      row.className = "liad-msg-row " + (role === "user" ? "user" : "bot");

      // Avatar (bot only)
      if (role === "bot") {
        const avatarEl = document.createElement("div");
        avatarEl.className = "liad-msg-avatar";
        const avatarImg = document.createElement("img");
        avatarImg.src = LOGO_URL;
        avatarImg.alt = "";
        avatarImg.onerror = function () {
          this.replaceWith(createFallbackLogoSVG(""));
        };
        avatarEl.appendChild(avatarImg);
        row.appendChild(avatarEl);
      }

      // Bubble
      const bubble = document.createElement("div");
      bubble.className = "liad-msg " + (role === "user" ? "liad-msg-user" : "liad-msg-bot");

      if (role === "bot") {
        bubble.appendChild(renderMarkdown(text));
      } else {
        bubble.textContent = text;
      }

      // Timestamp
      const time = document.createElement("div");
      time.className = "liad-msg-time";
      time.textContent = currentTime();

      // Inner wrapper (bubble + time)
      const inner = document.createElement("div");
      inner.appendChild(bubble);
      inner.appendChild(time);

      row.appendChild(inner);
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;

      return bubble; // return the bubble element (needed for TTS speaking highlight)
    }

    function showTyping() {
      const row = document.createElement("div");
      row.className = "liad-msg-row bot";

      const avatarEl = document.createElement("div");
      avatarEl.className = "liad-msg-avatar";
      const avatarImg = document.createElement("img");
      avatarImg.src = LOGO_URL;
      avatarImg.alt = "";
      avatarImg.onerror = function () { this.replaceWith(createFallbackLogoSVG("")); };
      avatarEl.appendChild(avatarImg);

      const typing = document.createElement("div");
      typing.className = "liad-typing";
      typing.innerHTML = "<span></span><span></span><span></span>";

      row.appendChild(avatarEl);
      row.appendChild(typing);
      messagesEl.appendChild(row);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return row;
    }

    async function sendMessage(text) {
      addMessage(text, "user");
      history.push({ role: "user", parts: [{ text }] });

      const typingRow = showTyping();

      try {
        const res = await fetch(LIAD_AI_URL + "/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: ACCOUNT_ID,
            message: text,
            history: history.slice(0, -1),
          }),
        });
        const data = await res.json();
        const reply = data.reply || "Desculpe, ocorreu um erro. Tente novamente.";
        typingRow.remove();
        const msgEl = addMessage(reply, "bot");
        tts.speak(reply, msgEl);
        history.push({ role: "model", parts: [{ text: reply }] });
      } catch {
        typingRow.remove();
        addMessage("Não consegui conectar. Verifique sua conexão e tente novamente.", "bot");
      }
    }

    addMessage(WELCOME_MESSAGE, "bot");
    return { sendMessage };
  }

  // ─── Init ─────────────────────────────────────────────────────────────────
  function init() {
    injectStyles();

    const { btn, panel, messages, input, sendBtn, voiceBtn, ttsBtn } = createWidget();

    const tts = initTTS(ttsBtn);
    const { sendMessage } = initChat(messages, tts);

    initVoice(voiceBtn, (transcript) => {
      input.value = "";
      input.style.height = "auto";
      sendBtn.classList.remove("active");
      sendMessage(transcript);
    });

    let isOpen = false;
    btn.addEventListener("click", function () {
      isOpen = !isOpen;
      btn.classList.toggle("open", isOpen);
      panel.classList.toggle("open", isOpen);
      btn.setAttribute("aria-label", isOpen ? "Fechar chat" : "Abrir chat");
      if (isOpen) setTimeout(() => input.focus(), 300);
    });

    function autoResize() {
      input.style.height = "auto";
      input.style.height = Math.min(input.scrollHeight, 100) + "px";
    }

    function updateSendBtn() {
      sendBtn.classList.toggle("active", input.value.trim().length > 0);
    }

    input.addEventListener("input", function () {
      autoResize();
      updateSendBtn();
    });

    function doSend() {
      const text = input.value.trim();
      if (!text) return;
      input.value = "";
      input.style.height = "auto";
      sendBtn.classList.remove("active");
      sendMessage(text);
    }

    sendBtn.addEventListener("click", doSend);
    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        doSend();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }
})();