import {
  signInWithEmailAndPassword,
  signInWithPopup
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirebaseServices, ensureLocalPersistence } from "./firebase-client.js";
import { clearBanner, setBanner, toggleButtonLoading } from "./ui.js";
import { isValidEmail, normalizeEmail } from "./validators.js";
import { redirectAuthenticatedUser, requireGuest } from "./auth-redirect.js";

const emailForm = document.querySelector("[data-login-form]");
const googleButton = document.querySelector("[data-google-login]");

async function handleEmailLogin(event) {
  event.preventDefault();
  clearBanner();

  const submitButton = emailForm.querySelector("button[type='submit']");
  const formData = new FormData(emailForm);
  const email = normalizeEmail(String(formData.get("email") ?? ""));
  const password = String(formData.get("password") ?? "");

  if (!isValidEmail(email)) {
    setBanner("Digite um email valido no formato seuemail@email.com.");
    return;
  }

  if (!password) {
    setBanner("Digite sua senha para continuar.");
    return;
  }

  toggleButtonLoading(submitButton, true, "Entrando...");

  try {
    await ensureLocalPersistence();
    const { auth } = await getFirebaseServices();
    const credential = await signInWithEmailAndPassword(auth, email, password);
    await redirectAuthenticatedUser(credential.user);
  } catch (error) {
    setBanner(
      error?.message ??
        "Nao foi possivel entrar. Confira email e senha e tente novamente."
    );
  } finally {
    toggleButtonLoading(submitButton, false, "Entrar");
  }
}

async function handleGoogleLogin() {
  clearBanner();
  toggleButtonLoading(googleButton, true, "Conectando...");

  try {
    await ensureLocalPersistence();
    const { auth, googleProvider } = await getFirebaseServices();
    const credential = await signInWithPopup(auth, googleProvider);
    await redirectAuthenticatedUser(credential.user);
  } catch (error) {
    setBanner(
      error?.message ??
        "Nao foi possivel autenticar com Google. Tente novamente."
    );
  } finally {
    toggleButtonLoading(googleButton, false, "Continuar com Google");
  }
}

async function init() {
  await requireGuest();
  emailForm?.addEventListener("submit", handleEmailLogin);
  googleButton?.addEventListener("click", handleGoogleLogin);
}

init().catch((error) => {
  console.error(error);
  setBanner(error.message ?? "Falha ao iniciar a autenticacao.");
});
