(function () {
  const LIAD_AI_URL = "http://localhost:3001";
  const WELCOME_MESSAGE = "Olá! Como posso te ajudar?";

  const ACCOUNT_ID = (function () {
    const s = document.currentScript;
    return s ? s.getAttribute("data-account-id") || "" : "";
  })();

  const styles = `
    @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500&display=swap');

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
      transition: transform 0.2s cubic-bezier(0.34, 1.56, 0.64, 1), box-shadow 0.2s ease;
      box-shadow: 0 4px 24px rgba(0,0,0,0.18);
    }
    #liad-widget-btn:hover {
      transform: scale(1.08);
      box-shadow: 0 8px 32px rgba(0,0,0,0.24);
    }
    #liad-widget-btn svg {
      transition: opacity 0.2s ease, transform 0.2s ease;
    }
    #liad-widget-btn .icon-logo { opacity: 1; position: absolute; }
    #liad-widget-btn .icon-close { opacity: 0; position: absolute; transform: rotate(-90deg); }
    #liad-widget-btn.open .icon-logo { opacity: 0; transform: rotate(90deg); }
    #liad-widget-btn.open .icon-close { opacity: 1; transform: rotate(0deg); }

    #liad-widget-panel {
      position: fixed;
      bottom: 96px;
      right: 28px;
      width: 360px;
      height: 520px;
      background: #0f0f0f;
      border-radius: 20px;
      z-index: 999997;
      display: flex;
      flex-direction: column;
      overflow: hidden;
      transform: scale(0.92) translateY(16px);
      transform-origin: bottom right;
      opacity: 0;
      pointer-events: none;
      transition: transform 0.28s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.22s ease;
      border: 1px solid rgba(255,255,255,0.07);
      font-family: 'DM Sans', -apple-system, sans-serif;
    }
    #liad-widget-panel.open {
      transform: scale(1) translateY(0);
      opacity: 1;
      pointer-events: all;
    }

    #liad-panel-header {
      padding: 18px 20px 14px;
      border-bottom: 1px solid rgba(255,255,255,0.06);
      display: flex;
      align-items: center;
      gap: 10px;
      flex-shrink: 0;
    }
    #liad-panel-header-avatar {
      width: 32px;
      height: 32px;
      background: #1a1a1a;
      border-radius: 50%;
      display: flex;
      align-items: center;
      justify-content: center;
      border: 1px solid rgba(255,255,255,0.1);
      flex-shrink: 0;
    }
    #liad-panel-header-info {}
    #liad-panel-header-name {
      font-size: 13px;
      font-weight: 500;
      color: #f0f0f0;
      letter-spacing: 0.01em;
      line-height: 1.2;
    }
    #liad-panel-header-status {
      font-size: 11px;
      color: rgba(255,255,255,0.38);
      letter-spacing: 0.02em;
      margin-top: 1px;
    }
    #liad-panel-header-dot {
      display: inline-block;
      width: 6px;
      height: 6px;
      background: #3ecf8e;
      border-radius: 50%;
      margin-right: 5px;
      vertical-align: middle;
      position: relative;
      top: -1px;
    }

    #liad-messages {
      flex: 1;
      overflow-y: auto;
      padding: 16px 16px 8px;
      display: flex;
      flex-direction: column;
      gap: 10px;
      scrollbar-width: thin;
      scrollbar-color: rgba(255,255,255,0.08) transparent;
    }
    #liad-messages::-webkit-scrollbar { width: 4px; }
    #liad-messages::-webkit-scrollbar-track { background: transparent; }
    #liad-messages::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.08); border-radius: 4px; }

    .liad-msg {
      max-width: 84%;
      font-size: 13.5px;
      line-height: 1.55;
      letter-spacing: 0.01em;
      animation: liad-msg-in 0.22s cubic-bezier(0.34, 1.2, 0.64, 1) both;
    }
    @keyframes liad-msg-in {
      from { opacity: 0; transform: translateY(6px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .liad-msg-bot {
      align-self: flex-start;
      background: #1c1c1c;
      color: #e8e8e8;
      padding: 10px 14px;
      border-radius: 16px 16px 16px 4px;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .liad-msg-user {
      align-self: flex-end;
      background: #ffffff;
      color: #0a0a0a;
      padding: 10px 14px;
      border-radius: 16px 16px 4px 16px;
      font-weight: 400;
    }

    .liad-typing {
      align-self: flex-start;
      display: flex;
      align-items: center;
      gap: 4px;
      padding: 12px 16px;
      background: #1c1c1c;
      border-radius: 16px 16px 16px 4px;
      border: 1px solid rgba(255,255,255,0.06);
    }
    .liad-typing span {
      width: 5px;
      height: 5px;
      background: rgba(255,255,255,0.28);
      border-radius: 50%;
      animation: liad-bounce 1.1s infinite ease-in-out;
    }
    .liad-typing span:nth-child(2) { animation-delay: 0.16s; }
    .liad-typing span:nth-child(3) { animation-delay: 0.32s; }
    @keyframes liad-bounce {
      0%, 80%, 100% { transform: scale(0.75); opacity: 0.4; }
      40% { transform: scale(1); opacity: 1; }
    }

    #liad-input-area {
      padding: 12px 14px 16px;
      border-top: 1px solid rgba(255,255,255,0.06);
      display: flex;
      gap: 8px;
      align-items: flex-end;
      flex-shrink: 0;
    }
    #liad-input {
      flex: 1;
      background: #1a1a1a;
      border: 1px solid rgba(255,255,255,0.08);
      border-radius: 12px;
      color: #e8e8e8;
      font-family: 'DM Sans', -apple-system, sans-serif;
      font-size: 13.5px;
      line-height: 1.45;
      padding: 9px 12px;
      resize: none;
      outline: none;
      max-height: 100px;
      overflow-y: auto;
      transition: border-color 0.15s ease;
      scrollbar-width: none;
    }
    #liad-input::placeholder { color: rgba(255,255,255,0.22); }
    #liad-input:focus { border-color: rgba(255,255,255,0.18); }

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
      opacity: 0.5;
    }
    #liad-send-btn.active { opacity: 1; }
    #liad-send-btn:hover { background: #e8e8e8; transform: scale(1.05); }
    #liad-send-btn:active { transform: scale(0.96); }
    #liad-send-btn svg { display: block; }

    #liad-footer {
      text-align: center;
      font-size: 10.5px;
      color: rgba(255,255,255,0.18);
      padding: 0 0 12px;
      letter-spacing: 0.04em;
      flex-shrink: 0;
      font-family: 'DM Sans', -apple-system, sans-serif;
    }

    @media (max-width: 420px) {
      #liad-widget-panel {
        right: 0;
        bottom: 0;
        width: 100vw;
        height: 75vh;
        border-radius: 20px 20px 0 0;
        transform-origin: bottom center;
      }
      #liad-widget-btn { bottom: 20px; right: 20px; }
    }
  `;

  function injectStyles() {
    const el = document.createElement("style");
    el.textContent = styles;
    document.head.appendChild(el);
  }

  const LOGO_SVG = `<svg width="22" height="22" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-logo">
    <rect x="4" y="4" width="12" height="28" rx="2" fill="white"/>
    <rect x="20" y="4" width="12" height="12" rx="2" fill="white" opacity="0.7"/>
    <rect x="20" y="20" width="12" height="12" rx="2" fill="white" opacity="0.45"/>
  </svg>`;

  const CLOSE_SVG = `<svg width="18" height="18" viewBox="0 0 18 18" fill="none" xmlns="http://www.w3.org/2000/svg" class="icon-close">
    <path d="M14 4L4 14M4 4l10 10" stroke="white" stroke-width="1.8" stroke-linecap="round"/>
  </svg>`;

  const SEND_SVG = `<svg width="16" height="16" viewBox="0 0 16 16" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M14 8L2 2l2.5 6L2 14l12-6z" fill="#0a0a0a"/>
  </svg>`;

  function createWidget() {
    const btn = document.createElement("button");
    btn.id = "liad-widget-btn";
    btn.setAttribute("aria-label", "Abrir chat");
    btn.innerHTML = LOGO_SVG + CLOSE_SVG;

    const panel = document.createElement("div");
    panel.id = "liad-widget-panel";
    panel.setAttribute("role", "dialog");
    panel.setAttribute("aria-label", "Chat de atendimento");
    panel.innerHTML = `
      <div id="liad-panel-header">
        <div id="liad-panel-header-avatar">
          <svg width="16" height="16" viewBox="0 0 36 36" fill="none" xmlns="http://www.w3.org/2000/svg">
            <rect x="4" y="4" width="12" height="28" rx="2" fill="white" opacity="0.9"/>
            <rect x="20" y="4" width="12" height="12" rx="2" fill="white" opacity="0.6"/>
            <rect x="20" y="20" width="12" height="12" rx="2" fill="white" opacity="0.35"/>
          </svg>
        </div>
        <div id="liad-panel-header-info">
          <div id="liad-panel-header-name">Assistente LIAD</div>
          <div id="liad-panel-header-status"><span id="liad-panel-header-dot"></span>online</div>
        </div>
      </div>
      <div id="liad-messages"></div>
      <div id="liad-input-area">
        <textarea id="liad-input" rows="1" placeholder="Escreva sua mensagem..."></textarea>
        <button id="liad-send-btn" aria-label="Enviar">${SEND_SVG}</button>
      </div>
      <div id="liad-footer">Powered by LIAD</div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    return { btn, panel };
  }

  function initChat(messagesEl) {
    const history = [];

    function addMessage(text, role) {
      const el = document.createElement("div");
      el.className = "liad-msg " + (role === "user" ? "liad-msg-user" : "liad-msg-bot");
      el.textContent = text;
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    function showTyping() {
      const el = document.createElement("div");
      el.className = "liad-typing";
      el.innerHTML = "<span></span><span></span><span></span>";
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    async function sendMessage(text) {
      addMessage(text, "user");
      history.push({ role: "user", parts: [{ text }] });

      const typing = showTyping();

      try {
        const res = await fetch(LIAD_AI_URL + "/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: ACCOUNT_ID,
            message: text,
            history: history.slice(0, -1)
          })
        });
        const data = await res.json();
        const reply = data.reply || "Desculpe, ocorreu um erro. Tente novamente.";
        typing.remove();
        addMessage(reply, "bot");
        history.push({ role: "model", parts: [{ text: reply }] });
      } catch {
        typing.remove();
        addMessage("Não consegui conectar. Verifique sua conexão e tente novamente.", "bot");
      }
    }

    addMessage(WELCOME_MESSAGE, "bot");

    return { sendMessage };
  }

  function init() {
    injectStyles();
    const { btn, panel } = createWidget();
    const messagesEl = panel.querySelector("#liad-messages");
    const input = panel.querySelector("#liad-input");
    const sendBtn = panel.querySelector("#liad-send-btn");

    const { sendMessage } = initChat(messagesEl);

    let isOpen = false;

    btn.addEventListener("click", function () {
      isOpen = !isOpen;
      btn.classList.toggle("open", isOpen);
      panel.classList.toggle("open", isOpen);
      btn.setAttribute("aria-label", isOpen ? "Fechar chat" : "Abrir chat");
      if (isOpen) setTimeout(() => input.focus(), 280);
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