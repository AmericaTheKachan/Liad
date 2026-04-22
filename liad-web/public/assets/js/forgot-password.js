import {
  sendPasswordResetEmail
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirebaseServices } from "./firebase-client.js";
import { clearBanner, setBanner, toggleButtonLoading } from "./ui.js";
import { isValidEmail, normalizeEmail } from "./validators.js";
import { requireGuest } from "./auth-redirect.js";

// ── elementos ──────────────────────────────────────────────────────────────
const stepRequest   = document.querySelector("[data-step='request']");
const stepSent      = document.querySelector("[data-step='sent']");
const requestForm   = document.querySelector("[data-request-form]");
const submitButton  = document.querySelector("[data-submit]");
const banner        = document.querySelector("[data-banner]");
const bannerSent    = document.querySelector("[data-banner-sent]");
const sentEmailEl   = document.querySelector("[data-sent-email]");
const resendButton  = document.querySelector("[data-resend]");
const countdownEl   = document.querySelector("[data-countdown]");
const checkPath     = document.querySelector("[data-check-path]");

let lastEmail   = "";
let cdInterval  = null;

// ── countdown ──────────────────────────────────────────────────────────────
function startCountdown(seconds = 60) {
  let remaining = seconds;
  resendButton.disabled = true;
  countdownEl.textContent = `(${remaining}s)`;
  countdownEl.hidden = false;

  clearInterval(cdInterval);
  cdInterval = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(cdInterval);
      resendButton.disabled = false;
      countdownEl.hidden = true;
    } else {
      countdownEl.textContent = `(${remaining}s)`;
    }
  }, 1000);
}

// ── animação do checkmark ──────────────────────────────────────────────────
function animateCheck() {
  if (!checkPath) return;
  checkPath.style.strokeDasharray  = "60";
  checkPath.style.strokeDashoffset = "60";
  checkPath.style.transition       = "stroke-dashoffset .5s .1s cubic-bezier(.22,1,.36,1)";
  requestAnimationFrame(() => {
    requestAnimationFrame(() => {
      checkPath.style.strokeDashoffset = "0";
    });
  });
}

// ── transição de step ──────────────────────────────────────────────────────
function showSentStep(email) {
  stepRequest.hidden = true;
  sentEmailEl.textContent = email;
  stepSent.hidden = false;
  animateCheck();
  startCountdown(60);
}

// ── envio de reset ─────────────────────────────────────────────────────────
async function sendReset(email) {
  const { auth } = await getFirebaseServices();
  await sendPasswordResetEmail(auth, email, {
    url: `${location.origin}/login`,
  });
}

// ── submit ─────────────────────────────────────────────────────────────────
async function handleSubmit(event) {
  event.preventDefault();
  clearBanner(banner);

  const email = normalizeEmail(String(requestForm.email.value ?? ""));

  if (!isValidEmail(email)) {
    setBanner(banner, "Digite um email válido no formato seuemail@email.com.");
    requestForm.email.setAttribute("aria-invalid", "true");
    requestForm.email.focus();
    return;
  }

  requestForm.email.removeAttribute("aria-invalid");
  toggleButtonLoading(submitButton, true, "Enviando...");

  try {
    await sendReset(email);
    lastEmail = email;
    showSentStep(email);
  } catch (error) {
    const code = error?.code ?? "";
    const msg =
      code === "auth/user-not-found"
        ? "Nenhuma conta encontrada com este email."
        : code === "auth/too-many-requests"
        ? "Muitas tentativas. Aguarde alguns minutos e tente novamente."
        : error?.message ?? "Não foi possível enviar o email. Tente novamente.";
    setBanner(banner, msg);
  } finally {
    toggleButtonLoading(submitButton, false, "Enviar link de redefinição");
  }
}

// ── reenvio ────────────────────────────────────────────────────────────────
async function handleResend() {
  clearBanner(bannerSent);
  resendButton.disabled = true;

  try {
    await sendReset(lastEmail);
    setBanner(bannerSent, "Email reenviado com sucesso.", "success");
    startCountdown(60);
  } catch (error) {
    const msg = error?.message ?? "Não foi possível reenviar. Tente novamente.";
    setBanner(bannerSent, msg);
    startCountdown(15);
  }
}

// ── init ───────────────────────────────────────────────────────────────────
async function init() {
  await requireGuest();

  requestForm?.addEventListener("submit", handleSubmit);
  resendButton?.addEventListener("click", handleResend);

  requestForm?.email.addEventListener("input", () => {
    requestForm.email.removeAttribute("aria-invalid");
    clearBanner(banner);
  });
}

init().catch((error) => {
  console.error(error);
  setBanner(banner, error?.message ?? "Falha ao iniciar a página.");
});