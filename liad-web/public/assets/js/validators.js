export const monthlyVisitOptions = [
  "0_1k",
  "1k_10k",
  "10k_50k",
  "50k_200k",
  "200k_plus"
];

export function normalizeWhitespace(value) {
  return value.trim().replace(/\s+/g, " ");
}

export function normalizeEmail(value) {
  return normalizeWhitespace(value).toLowerCase();
}

export function normalizeCnpj(value) {
  return value.replace(/\D/g, "");
}

export function formatCnpj(value) {
  const digits = normalizeCnpj(value).slice(0, 14);
  const parts = [
    digits.slice(0, 2),
    digits.slice(2, 5),
    digits.slice(5, 8),
    digits.slice(8, 12),
    digits.slice(12, 14)
  ];

  let formatted = parts[0] ?? "";

  if (parts[1]) {
    formatted += `.${parts[1]}`;
  }

  if (parts[2]) {
    formatted += `.${parts[2]}`;
  }

  if (parts[3]) {
    formatted += `/${parts[3]}`;
  }

  if (parts[4]) {
    formatted += `-${parts[4]}`;
  }

  return formatted;
}

export function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizeEmail(value));
}

export function isValidPassword(value) {
  return /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{6,}$/.test(value);
}

export function getPasswordHint() {
  return "Use no minimo 6 caracteres, 1 letra maiuscula, 1 numero e 1 caractere especial.";
}

export function isValidCnpj(value) {
  const digits = normalizeCnpj(value);

  if (!/^\d{14}$/.test(digits)) {
    return false;
  }

  if (/^(\d)\1{13}$/.test(digits)) {
    return false;
  }

  const calculateDigit = (base, factor) => {
    let total = 0;

    for (const digit of base) {
      total += Number(digit) * factor--;
      if (factor < 2) {
        factor = 9;
      }
    }

    const remainder = total % 11;
    return remainder < 2 ? 0 : 11 - remainder;
  };

  const firstDigit = calculateDigit(digits.slice(0, 12), 5);
  const secondDigit = calculateDigit(`${digits.slice(0, 12)}${firstDigit}`, 6);

  return digits.endsWith(`${firstDigit}${secondDigit}`);
}

export function splitDisplayName(displayName = "") {
  const cleanName = normalizeWhitespace(displayName);

  if (!cleanName) {
    return {
      ownerFirstName: "",
      ownerLastName: ""
    };
  }

  const parts = cleanName.split(" ");

  return {
    ownerFirstName: parts[0] ?? "",
    ownerLastName: parts.slice(1).join(" ")
  };
}

export function getMonthlyVisitsLabel(value) {
  const labels = {
    "0_1k": "Ate 1 mil visitas",
    "1k_10k": "Entre 1 mil e 10 mil",
    "10k_50k": "Entre 10 mil e 50 mil",
    "50k_200k": "Entre 50 mil e 200 mil",
    "200k_plus": "Mais de 200 mil"
  };

  return labels[value] ?? value;
}
