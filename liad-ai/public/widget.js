(function () {
  const WELCOME_MESSAGE = "Olá! Como posso te ajudar?";
  const LOCAL_AI_URL = "http://localhost:3001";

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

  // ─── SVGs ─────────────────────────────────────────────────────────────────

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

  // ─── Estilos ──────────────────────────────────────────────────────────────

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
    #liad-widget-btn:hover { transform: scale(1.08); box-shadow: 0 8px 32px rgba(0,0,0,0.24); }
    #liad-widget-btn svg { transition: opacity 0.2s ease, transform 0.2s ease; }
    #liad-widget-btn .icon-logo  { opacity: 1; position: absolute; }
    #liad-widget-btn .icon-close { opacity: 0; position: absolute; transform: rotate(-90deg); }
    #liad-widget-btn.open .icon-logo  { opacity: 0; transform: rotate(90deg); }
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
      padding: 14px 16px 12px;
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
    #liad-panel-header-info { flex: 1; min-width: 0; }
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

    .liad-msg-bot.speaking {
      border-color: rgba(62,207,142,0.4) !important;
      box-shadow: 0 0 0 2px rgba(62,207,142,0.1);
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
      transition: border-color 0.2s, box-shadow 0.2s;
    }
    .liad-msg-user {
      align-self: flex-end;
      background: #ffffff;
      color: #0a0a0a;
      padding: 10px 14px;
      border-radius: 16px 16px 4px 16px;
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
      width: 5px; height: 5px;
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
    #liad-voice-btn:hover { background: rgba(255,255,255,0.06); color: rgba(255,255,255,0.75); }
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
      transition: background 0.15s, transform 0.15s, opacity 0.15s;
      opacity: 0.5;
    }
    #liad-send-btn.active { opacity: 1; }
    #liad-send-btn:hover  { background: #e8e8e8; transform: scale(1.05); }
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
        right: 0; bottom: 0;
        width: 100vw; height: 75vh;
        border-radius: 20px 20px 0 0;
        transform-origin: bottom center;
      }
      #liad-widget-btn { bottom: 20px; right: 20px; }
    }
  `;

  // ─── Injetar estilos ──────────────────────────────────────────────────────

  function injectStyles() {
    var el = document.createElement("style");
    el.textContent = styles;
    document.head.appendChild(el);
  }

  // ─── Criar widget ─────────────────────────────────────────────────────────

  function createWidget() {
    var btn = document.createElement("button");
    btn.id = "liad-widget-btn";
    btn.setAttribute("aria-label", "Abrir chat");
    btn.innerHTML = LOGO_SVG + CLOSE_SVG;

    var panel = document.createElement("div");
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
        <button id="liad-tts-btn" aria-label="Ativar resposta por voz" title="Ativar resposta por voz">
          ${SPEAKER_OFF_SVG}
        </button>
      </div>
      <div id="liad-messages"></div>
      <div id="liad-input-area">
        <textarea id="liad-input" rows="1" placeholder="Escreva sua mensagem..."></textarea>
        <button id="liad-voice-btn" aria-label="Falar" title="Clique e fale sua pesquisa"></button>
        <button id="liad-send-btn" aria-label="Enviar">${SEND_SVG}</button>
      </div>
      <div id="liad-footer">Powered by LIAD</div>
    `;

    document.body.appendChild(btn);
    document.body.appendChild(panel);

    return { btn: btn, panel: panel };
  }

  // ─── TTS (Text-to-Speech) ─────────────────────────────────────────────────

  function initTTS(ttsBtn) {
    var ttsEnabled = false;

    if (!window.speechSynthesis) {
      ttsBtn.disabled = true;
      ttsBtn.title = "Seu navegador não suporta síntese de voz";
      return {
        isEnabled: function () { return false; },
        speak: function () {}
      };
    }

    // Carrega vozes (alguns browsers precisam do evento)
    var voices = [];
    function loadVoices() { voices = window.speechSynthesis.getVoices(); }
    loadVoices();
    if (window.speechSynthesis.onvoiceschanged !== undefined) {
      window.speechSynthesis.onvoiceschanged = loadVoices;
    }
    
    function getBestVoice() {
      return (
        voices.find(function (v) { return v.name === "Microsoft Maria - Portuguese (Brazil)"; }) ||
        voices.find(function (v) { return v.lang === "pt-BR"; }) ||
        null
  );
}

    ttsBtn.addEventListener("click", function () {
      ttsEnabled = !ttsEnabled;
      ttsBtn.classList.toggle("active", ttsEnabled);
      ttsBtn.innerHTML = ttsEnabled ? SPEAKER_ON_SVG : SPEAKER_OFF_SVG;
      ttsBtn.setAttribute("aria-label", ttsEnabled ? "Desativar resposta por voz" : "Ativar resposta por voz");
      ttsBtn.title = ttsEnabled ? "Resposta por voz ativada — clique para desativar" : "Ativar resposta por voz";

      if (!ttsEnabled) window.speechSynthesis.cancel();
    });

    function speak(text, msgEl) {
      if (!ttsEnabled) return;

      window.speechSynthesis.cancel();

      var utterance = new SpeechSynthesisUtterance(text);
      utterance.lang  = "pt-BR";
      utterance.rate  = 1.05;
      utterance.pitch = 1;

      var voice = getBestVoice();
      if (voice) utterance.voice = voice;

      if (msgEl) {
        utterance.onstart = function () { msgEl.classList.add("speaking"); };
        utterance.onend   = function () { msgEl.classList.remove("speaking"); };
        utterance.onerror = function () { msgEl.classList.remove("speaking"); };
      }

      window.speechSynthesis.speak(utterance);
    }

    return {
      isEnabled: function () { return ttsEnabled; },
      speak: speak
    };
  }

  // ─── Voz (entrada) ────────────────────────────────────────────────────────

  function initVoice(voiceBtn, onResult) {
    var RecognitionClass =
      window.SpeechRecognition || window.webkitSpeechRecognition || null;

    if (!RecognitionClass) {
      voiceBtn.disabled = true;
      voiceBtn.title = "Seu navegador não suporta entrada de voz";
      voiceBtn.innerHTML = MIC_SVG;
      return;
    }

    voiceBtn.innerHTML = MIC_SVG;
    var recognition = null;
    var listening = false;

    function setListening(active) {
      listening = active;
      voiceBtn.innerHTML = active ? MIC_ACTIVE_SVG : MIC_SVG;
      voiceBtn.classList.toggle("recording", active);
      voiceBtn.setAttribute("aria-label", active ? "Parar gravação" : "Falar");
      voiceBtn.title = active ? "Ouvindo… clique para parar" : "Clique e fale sua pesquisa";
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

      recognition.onstart  = function () { setListening(true); };
      recognition.onend    = function () { setListening(false); recognition = null; };
      recognition.onresult = function (event) {
        var transcript = event.results[0][0].transcript.trim();
        if (transcript) onResult(transcript);
      };
      recognition.onerror = function (event) {
        setListening(false);
        recognition = null;
        if (event.error !== "no-speech" && event.error !== "aborted") {
          console.warn("[LIAD voice] erro:", event.error);
        }
      };

      recognition.start();
    }

    voiceBtn.addEventListener("click", function () {
      if (listening) { stop(); } else { start(); }
    });
  }

  // ─── Chat ─────────────────────────────────────────────────────────────────

  function initChat(messagesEl, tts) {
    var history = [];

    function addMessage(text, role) {
      var el = document.createElement("div");
      el.className = "liad-msg " + (role === "user" ? "liad-msg-user" : "liad-msg-bot");
      el.textContent = text;
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    function showTyping() {
      var el = document.createElement("div");
      el.className = "liad-typing";
      el.innerHTML = "<span></span><span></span><span></span>";
      messagesEl.appendChild(el);
      messagesEl.scrollTop = messagesEl.scrollHeight;
      return el;
    }

    async function sendMessage(text) {
      addMessage(text, "user");
      history.push({ role: "user", parts: [{ text: text }] });

      var typing = showTyping();

      try {
        var res = await fetch(LIAD_AI_URL + "/chat", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            accountId: ACCOUNT_ID,
            message: text,
            history: history.slice(0, -1)
          })
        });
        var data = await res.json();
        var reply = data.reply || "Desculpe, ocorreu um erro. Tente novamente.";
        typing.remove();
        var msgEl = addMessage(reply, "bot");
        tts.speak(reply, msgEl);
        history.push({ role: "model", parts: [{ text: reply }] });
      } catch (e) {
        typing.remove();
        addMessage("Não consegui conectar. Verifique sua conexão e tente novamente.", "bot");
      }
    }

    addMessage(WELCOME_MESSAGE, "bot");

    return { sendMessage: sendMessage };
  }

  // ─── Init ─────────────────────────────────────────────────────────────────

  function init() {
    injectStyles();

    var _w      = createWidget();
    var btn     = _w.btn;
    var panel   = _w.panel;

    var messagesEl = panel.querySelector("#liad-messages");
    var input      = panel.querySelector("#liad-input");
    var sendBtn    = panel.querySelector("#liad-send-btn");
    var voiceBtn   = panel.querySelector("#liad-voice-btn");
    var ttsBtn     = panel.querySelector("#liad-tts-btn");

    var tts         = initTTS(ttsBtn);
    var _chat       = initChat(messagesEl, tts);
    var sendMessage = _chat.sendMessage;

    initVoice(voiceBtn, function (transcript) {
      input.value = "";
      sendMessage(transcript);
    });

    var isOpen = false;
    btn.addEventListener("click", function () {
      isOpen = !isOpen;
      btn.classList.toggle("open", isOpen);
      panel.classList.toggle("open", isOpen);
      btn.setAttribute("aria-label", isOpen ? "Fechar chat" : "Abrir chat");
      if (isOpen) setTimeout(function () { input.focus(); }, 280);
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
      var text = input.value.trim();
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
