import {
  createUserWithEmailAndPassword,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { saveAccountProfile } from "./auth-data.js";
import { redirectToDashboard, requireGuest } from "./auth-redirect.js";
import { getFirebaseServices, ensureLocalPersistence } from "./firebase-client.js";
import {
  clearBanner,
  clearFieldError,
  clearFormErrors,
  setBanner,
  setFieldError,
  toggleButtonLoading
} from "./ui.js";
import {
  formatCnpj,
  getPasswordHint,
  isValidCnpj,
  isValidEmail,
  isValidPassword,
  monthlyVisitOptions,
  normalizeEmail,
  normalizeWhitespace
} from "./validators.js";

const form = document.querySelector("[data-signup-form]");
const cnpjInput = document.querySelector("input[name='cnpj']");

function validateSignupFields(values) {
  const errors = {};

  if (normalizeWhitespace(values.storeName).length < 2) {
    errors.storeName = "Informe o nome da loja.";
  }

  if (normalizeWhitespace(values.ownerFirstName).length < 2) {
    errors.ownerFirstName = "Informe o nome do responsavel.";
  }

  if (normalizeWhitespace(values.ownerLastName).length < 2) {
    errors.ownerLastName = "Informe o sobrenome do responsavel.";
  }

  if (!isValidEmail(values.email)) {
    errors.email = "Digite um email valido.";
  }

  if (!isValidPassword(values.password)) {
    errors.password = getPasswordHint();
  }

  if (!isValidCnpj(values.cnpj)) {
    errors.cnpj = "Digite um CNPJ valido.";
  }

  if (!monthlyVisitOptions.includes(values.monthlyVisitsRange)) {
    errors.monthlyVisitsRange = "Selecione a faixa de visitas por mes.";
  }

  return errors;
}

function readFormValues() {
  const formData = new FormData(form);

  return {
    storeName: String(formData.get("storeName") ?? ""),
    ownerFirstName: String(formData.get("ownerFirstName") ?? ""),
    ownerLastName: String(formData.get("ownerLastName") ?? ""),
    email: normalizeEmail(String(formData.get("email") ?? "")),
    password: String(formData.get("password") ?? ""),
    cnpj: String(formData.get("cnpj") ?? ""),
    monthlyVisitsRange: String(formData.get("monthlyVisitsRange") ?? "")
  };
}

async function handleSubmit(event) {
  event.preventDefault();
  clearBanner();
  clearFormErrors(form);

  const submitButton = form.querySelector("button[type='submit']");
  const values = readFormValues();
  const errors = validateSignupFields(values);

  if (Object.keys(errors).length > 0) {
    Object.entries(errors).forEach(([fieldName, message]) => {
      setFieldError(fieldName, message);
    });

    setBanner("Revise os campos obrigatorios e tente novamente.");
    return;
  }

  toggleButtonLoading(submitButton, true, "Criando conta...");

  try {
    await ensureLocalPersistence();
    const { auth } = await getFirebaseServices();
    const credential = await createUserWithEmailAndPassword(
      auth,
      values.email,
      values.password
    );

    await updateProfile(credential.user, {
      displayName: `${normalizeWhitespace(values.ownerFirstName)} ${normalizeWhitespace(values.ownerLastName)}`
    });

    await saveAccountProfile(
      credential.user,
      {
        ...values,
        email: values.email
      },
      {
        provider: "password",
        rollbackAuthUserOnFailure: true
      }
    );

    redirectToDashboard();
  } catch (error) {
    const message =
      error?.code === "auth/email-already-in-use"
        ? "Ja existe uma conta com este email."
        : error?.message ?? "Nao foi possivel concluir o cadastro.";

    setBanner(message);
  } finally {
    toggleButtonLoading(submitButton, false, "Criar conta");
  }
}

async function init() {
  await requireGuest();

  cnpjInput?.addEventListener("input", (event) => {
    event.target.value = formatCnpj(event.target.value);
    clearFieldError("cnpj");
  });

  form?.addEventListener("submit", handleSubmit);
}

init().catch((error) => {
  console.error(error);
  setBanner(error.message ?? "Falha ao iniciar o cadastro.");
});
