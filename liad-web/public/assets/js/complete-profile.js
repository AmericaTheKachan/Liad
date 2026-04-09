import { saveAccountProfile, readPendingProfile } from "./auth-data.js";
import { redirectToDashboard, requireAuthenticated } from "./auth-redirect.js";
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
  isValidCnpj,
  monthlyVisitOptions,
  splitDisplayName,
  normalizeWhitespace
} from "./validators.js";

const form = document.querySelector("[data-complete-profile-form]");
const cnpjInput = document.querySelector("input[name='cnpj']");
let currentUser;

function prefillForm(user) {
  const pendingProfile = readPendingProfile();
  const fallbackName = splitDisplayName(user.displayName ?? "");
  const defaults = {
    ownerFirstName:
      pendingProfile?.ownerFirstName || fallbackName.ownerFirstName || "",
    ownerLastName:
      pendingProfile?.ownerLastName || fallbackName.ownerLastName || "",
    email: pendingProfile?.email || user.email || ""
  };

  form.elements.ownerFirstName.value = defaults.ownerFirstName;
  form.elements.ownerLastName.value = defaults.ownerLastName;
  form.elements.email.value = defaults.email;
}

function readFormValues() {
  const formData = new FormData(form);

  return {
    storeName: String(formData.get("storeName") ?? ""),
    ownerFirstName: String(formData.get("ownerFirstName") ?? ""),
    ownerLastName: String(formData.get("ownerLastName") ?? ""),
    email: String(formData.get("email") ?? ""),
    cnpj: String(formData.get("cnpj") ?? ""),
    monthlyVisitsRange: String(formData.get("monthlyVisitsRange") ?? "")
  };
}

function validateProfile(values) {
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

  if (!isValidCnpj(values.cnpj)) {
    errors.cnpj = "Digite um CNPJ valido.";
  }

  if (!monthlyVisitOptions.includes(values.monthlyVisitsRange)) {
    errors.monthlyVisitsRange = "Selecione a faixa de visitas por mes.";
  }

  return errors;
}

async function handleSubmit(event) {
  event.preventDefault();
  clearBanner();
  clearFormErrors(form);

  const submitButton = form.querySelector("button[type='submit']");
  const values = readFormValues();
  const errors = validateProfile(values);

  if (Object.keys(errors).length > 0) {
    Object.entries(errors).forEach(([fieldName, message]) => {
      setFieldError(fieldName, message);
    });
    setBanner("Revise os campos obrigatorios e tente novamente.");
    return;
  }

  toggleButtonLoading(submitButton, true, "Salvando...");

  try {
    await saveAccountProfile(currentUser, values, {
      provider: "google"
    });

    redirectToDashboard();
  } catch (error) {
    setBanner(error.message ?? "Nao foi possivel concluir o cadastro da conta.");
  } finally {
    toggleButtonLoading(submitButton, false, "Salvar e entrar");
  }
}

async function init() {
  currentUser = await requireAuthenticated();
  prefillForm(currentUser);

  cnpjInput?.addEventListener("input", (event) => {
    event.target.value = formatCnpj(event.target.value);
    clearFieldError("cnpj");
  });

  form?.addEventListener("submit", handleSubmit);
}

init().catch((error) => {
  console.error(error);
  setBanner(error.message ?? "Falha ao iniciar o fluxo de cadastro.");
});
