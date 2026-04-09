export function setBanner(message, tone = "error") {
  const banner = document.querySelector("[data-banner]");

  if (!banner) {
    return;
  }

  banner.textContent = message;
  banner.dataset.tone = tone;
  banner.hidden = false;
}

export function clearBanner() {
  const banner = document.querySelector("[data-banner]");

  if (!banner) {
    return;
  }

  banner.hidden = true;
  banner.textContent = "";
  banner.dataset.tone = "";
}

export function setFieldError(fieldName, message) {
  const errorElement = document.querySelector(`[data-error-for="${fieldName}"]`);
  const input = document.querySelector(`[name="${fieldName}"]`);

  if (errorElement) {
    errorElement.textContent = message;
  }

  if (input) {
    input.setAttribute("aria-invalid", message ? "true" : "false");
  }
}

export function clearFieldError(fieldName) {
  setFieldError(fieldName, "");
}

export function clearFormErrors(form) {
  form.querySelectorAll("[data-error-for]").forEach((element) => {
    element.textContent = "";
  });

  form.querySelectorAll("[aria-invalid='true']").forEach((input) => {
    input.setAttribute("aria-invalid", "false");
  });
}

export function toggleButtonLoading(button, isLoading, loadingText) {
  if (!button) {
    return;
  }

  if (!button.dataset.defaultText) {
    button.dataset.defaultText = button.textContent ?? "";
  }

  button.disabled = isLoading;
  button.textContent = isLoading ? loadingText : button.dataset.defaultText;
}

export function showToast(message, tone = "success") {
  const root = document.querySelector("[data-toast-root]");

  if (!root) {
    return;
  }

  const toast = document.createElement("div");
  const toneClass =
    tone === "warning"
      ? "border-[#ffbd59]/30 bg-[#ffbd59]/12 text-[#ffe4ae]"
      : tone === "danger"
        ? "border-[#ff8439]/35 bg-[#ff8439]/12 text-[#ffe2d0]"
        : "border-emerald-400/30 bg-emerald-400/12 text-emerald-100";

  toast.className = [
    "pointer-events-auto w-full rounded-[24px] border px-4 py-3 shadow-panel backdrop-blur-xl transition duration-200 ease-out",
    "translate-y-2 opacity-0",
    toneClass
  ].join(" ");
  toast.innerHTML = `
    <div class="flex items-start gap-3">
      <div class="mt-0.5 h-2.5 w-2.5 shrink-0 rounded-full ${tone === "success" ? "bg-emerald-300" : tone === "warning" ? "bg-[#ffd089]" : "bg-[#ffb08d]"}"></div>
      <p class="text-sm leading-6">${message}</p>
    </div>
  `;

  root.appendChild(toast);

  requestAnimationFrame(() => {
    toast.classList.remove("translate-y-2", "opacity-0");
  });

  window.setTimeout(() => {
    toast.classList.add("translate-y-2", "opacity-0");
    window.setTimeout(() => {
      toast.remove();
    }, 200);
  }, 2800);
}
