import { signOut } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  getCurrentAccountContext,
  saveStoreLogo,
  updateAccountOwnerProfile,
  updateStoreProfile
} from "./auth-data.js";
import {
  redirectToCompleteProfile,
  redirectToLogin,
  requireAuthenticated
} from "./auth-redirect.js";
import { getFirebaseServices } from "./firebase-client.js";
import { clearBanner, setBanner, showToast, toggleButtonLoading } from "./ui.js";
import {
  getMonthlyVisitsLabel,
  monthlyVisitOptions,
  normalizeWhitespace
} from "./validators.js";

const ROUTES = {
  "/dashboard": { label: "Dashboard", icon: "dashboard" },
  "/metricas": { label: "Metricas", icon: "metrics" },
  "/api": { label: "API", icon: "api" }
};

const DASHBOARD_METRICS = [
  { label: "Conversas hoje", value: 142, note: "+12 em relacao a ontem" },
  { label: "Taxa de conversao", value: 18.4, format: "percent", note: "Acima da meta semanal" },
  { label: "Requisicoes este mes", value: 4831, note: "78% da franquia mensal" },
  { label: "Receita influenciada", value: 12340, format: "currency", note: "Pedidos iniciados pela LIAD" }
];

const DASHBOARD_LINE_DATA = [
  { label: "Seg", value: 104 },
  { label: "Ter", value: 118 },
  { label: "Qua", value: 124 },
  { label: "Qui", value: 139 },
  { label: "Sex", value: 131 },
  { label: "Sab", value: 151 },
  { label: "Dom", value: 142 }
];

const DASHBOARD_PRODUCTS = [
  { name: "Tenis Velocity Pro Air", count: 84 },
  { name: "Jaqueta Wind Runner Tech", count: 73 },
  { name: "Smartwatch Pulse Track S", count: 65 },
  { name: "Fone Wave ANC", count: 49 },
  { name: "Mochila Urban Cargo", count: 38 }
];

const METRIC_FILTERS = [
  { id: "today", label: "Hoje" },
  { id: "7d", label: "7 dias" },
  { id: "30d", label: "30 dias" },
  { id: "custom", label: "Personalizado" }
];

const METRIC_DATA = {
  today: {
    periodLabel: "Hoje",
    kpis: [
      { label: "Total de conversas", value: 142 },
      { label: "Taxa de conversao", value: 18.4, format: "percent", delta: { value: "+2,1%", tone: "positive", note: "vs. ontem" } },
      { label: "Media de mensagens por conversa", value: 7.2, format: "decimal" },
      { label: "Tempo medio de resposta da IA", value: "1,8s" },
      { label: "Total de requisicoes a API", value: 1386 },
      { label: "Sessoes abandonadas", value: 19 }
    ],
    volume: [
      { label: "09h", value: 12 },
      { label: "10h", value: 18 },
      { label: "11h", value: 24 },
      { label: "12h", value: 29 },
      { label: "13h", value: 21 },
      { label: "14h", value: 17 },
      { label: "15h", value: 21 }
    ],
    conversion: [
      { label: "09h", value: 12.4 },
      { label: "10h", value: 14.1 },
      { label: "11h", value: 16.7 },
      { label: "12h", value: 18.9 },
      { label: "13h", value: 17.2 },
      { label: "14h", value: 18.0 },
      { label: "15h", value: 18.4 }
    ]
  },
  "7d": {
    periodLabel: "Ultimos 7 dias",
    kpis: [
      { label: "Total de conversas", value: 912 },
      { label: "Taxa de conversao", value: 17.8, format: "percent", delta: { value: "+1,4%", tone: "positive", note: "vs. 7 dias anteriores" } },
      { label: "Media de mensagens por conversa", value: 6.9, format: "decimal" },
      { label: "Tempo medio de resposta da IA", value: "1,9s" },
      { label: "Total de requisicoes a API", value: 8631 },
      { label: "Sessoes abandonadas", value: 126 }
    ],
    volume: DASHBOARD_LINE_DATA,
    conversion: [
      { label: "Seg", value: 16.2 },
      { label: "Ter", value: 17.1 },
      { label: "Qua", value: 17.4 },
      { label: "Qui", value: 18.0 },
      { label: "Sex", value: 17.6 },
      { label: "Sab", value: 18.6 },
      { label: "Dom", value: 17.8 }
    ]
  },
  "30d": {
    periodLabel: "Ultimos 30 dias",
    kpis: [
      { label: "Total de conversas", value: 4126 },
      { label: "Taxa de conversao", value: 18.4, format: "percent", delta: { value: "+3,8%", tone: "positive", note: "vs. mes anterior" } },
      { label: "Media de mensagens por conversa", value: 6.5, format: "decimal" },
      { label: "Tempo medio de resposta da IA", value: "2,1s" },
      { label: "Total de requisicoes a API", value: 28141 },
      { label: "Sessoes abandonadas", value: 508 }
    ],
    volume: [
      { label: "01", value: 118 },
      { label: "05", value: 126 },
      { label: "10", value: 143 },
      { label: "15", value: 158 },
      { label: "20", value: 149 },
      { label: "25", value: 173 },
      { label: "30", value: 166 }
    ],
    conversion: [
      { label: "01", value: 15.8 },
      { label: "05", value: 16.4 },
      { label: "10", value: 17.2 },
      { label: "15", value: 17.9 },
      { label: "20", value: 18.6 },
      { label: "25", value: 18.2 },
      { label: "30", value: 18.4 }
    ]
  },
  custom: {
    periodLabel: "Periodo personalizado",
    kpis: [
      { label: "Total de conversas", value: 1630 },
      { label: "Taxa de conversao", value: 16.9, format: "percent", delta: { value: "-0,8%", tone: "negative", note: "vs. periodo anterior" } },
      { label: "Media de mensagens por conversa", value: 7.4, format: "decimal" },
      { label: "Tempo medio de resposta da IA", value: "2,0s" },
      { label: "Total de requisicoes a API", value: 11628 },
      { label: "Sessoes abandonadas", value: 212 }
    ],
    volume: [
      { label: "Sem 1", value: 342 },
      { label: "Sem 2", value: 388 },
      { label: "Sem 3", value: 401 },
      { label: "Sem 4", value: 499 }
    ],
    conversion: [
      { label: "Sem 1", value: 16.1 },
      { label: "Sem 2", value: 16.8 },
      { label: "Sem 3", value: 17.3 },
      { label: "Sem 4", value: 16.9 }
    ]
  }
};

const RECENT_CONVERSATIONS = [
  ["LIAD-94021", "08/04 14:12", "06m 18s", 8, true, "Tenis Velocity Pro Air"],
  ["LIAD-94018", "08/04 13:57", "04m 40s", 6, false, "Fone Wave ANC"],
  ["LIAD-94016", "08/04 13:44", "09m 02s", 11, true, "Jaqueta Wind Runner Tech"],
  ["LIAD-94011", "08/04 13:18", "03m 55s", 5, false, "Mochila Urban Cargo"],
  ["LIAD-94004", "08/04 12:51", "07m 23s", 9, true, "Smartwatch Pulse Track S"],
  ["LIAD-93996", "08/04 12:14", "05m 16s", 7, false, "Tenis Velocity Pro Air"],
  ["LIAD-93989", "08/04 11:43", "08m 10s", 10, true, "Jaqueta Wind Runner Tech"],
  ["LIAD-93981", "08/04 11:07", "02m 48s", 4, false, "Fone Wave ANC"],
  ["LIAD-93974", "08/04 10:41", "06m 49s", 8, true, "Smartwatch Pulse Track S"],
  ["LIAD-93968", "08/04 10:08", "04m 12s", 5, false, "Mochila Urban Cargo"]
].map(([id, date, duration, messages, converted, product]) => ({
  id,
  date,
  duration,
  messages,
  converted,
  product
}));

const SNIPPETS = {
  shopify: {
    label: "Shopify",
    instruction: "Cole este script no arquivo `theme.liquid` antes do fechamento de `</body>` ou em um App Embed block.",
    code: (key) => [`{% comment %} Substitua pela sua API Key da LIAD se precisar {% endcomment %}`, `<script src="https://cdn.liad.ai/widget.js" data-liad-key="${key}" defer></script>`].join("\n")
  },
  nuvemshop: {
    label: "Nuvemshop",
    instruction: "Cole o script no painel de scripts do tema, no rodape da loja.",
    code: (key) => [`<!-- Substitua pela sua API Key da LIAD -->`, `<script src="https://cdn.liad.ai/widget.js" data-liad-key="${key}" defer></script>`].join("\n")
  },
  woocommerce: {
    label: "WooCommerce",
    instruction: "Adicione no `functions.php` do tema ou em um plugin de header/footer.",
    code: (key) => ["<?php", "// Substitua pela sua API Key da LIAD.", `echo '<script src=\"https://cdn.liad.ai/widget.js\" data-liad-key=\"${key}\" defer></script>';`, "?>"].join("\n")
  },
  vtex: {
    label: "VTEX",
    instruction: "Inclua o script no VTEX IO ou no CMS do storefront.",
    code: (key) => ["{", '  "scripts": [', "    {", '      "src": "https://cdn.liad.ai/widget.js",', `      "data-liad-key": "${key}"`, "    }", "  ]", "}"].join("\n")
  },
  universal: {
    label: "Universal (HTML)",
    instruction: "Cole este script antes do fechamento da tag `</body>`.",
    code: (key) => [`<!-- Substitua o valor de data-liad-key pela sua API Key da LIAD -->`, `<script src="https://cdn.liad.ai/widget.js" data-liad-key="${key}" defer></script>`].join("\n")
  }
};

const SETTINGS_TABS = [
  { id: "conta", label: "Conta" },
  { id: "pagamento", label: "Pagamento" }
];

const MONTHLY_CUSTOMER_OPTIONS = monthlyVisitOptions.map((value) => ({
  value,
  label: getMonthlyVisitsLabel(value)
}));

const PAYMENT_PLAN = {
  name: "Plano Pro",
  status: "Ativo",
  description: "Acesso completo ao painel, metricas avancadas e integracoes prioritarias."
};

const PAYMENT_DETAILS = [
  { label: "Valor da assinatura", value: "R$ 197,00/mes" },
  { label: "Proxima cobranca", value: "15 de maio de 2025" },
  { label: "Ciclo de cobranca", value: "Mensal" },
  { label: "Membro desde", value: "Janeiro de 2024" }
];

const PAYMENT_INVOICES = [
  { id: "2025-05", month: "Maio de 2025", value: "R$ 197,00", status: "Pago" },
  { id: "2025-04", month: "Abril de 2025", value: "R$ 197,00", status: "Pago" },
  { id: "2025-03", month: "Marco de 2025", value: "R$ 197,00", status: "Pago" },
  { id: "2025-02", month: "Fevereiro de 2025", value: "R$ 197,00", status: "Pago" },
  { id: "2025-01", month: "Janeiro de 2025", value: "R$ 197,00", status: "Pendente" },
  { id: "2024-12", month: "Dezembro de 2024", value: "R$ 197,00", status: "Falhou" },
  { id: "2024-11", month: "Novembro de 2024", value: "R$ 197,00", status: "Pago" },
  { id: "2024-10", month: "Outubro de 2024", value: "R$ 197,00", status: "Pago" }
];

const state = {
  currentRoute: normalizeRoute(window.location.pathname),
  sidebarCollapsed: false,
  mobileOpen: false,
  metricsFilter: "7d",
  metricsPage: 1,
  snippetPlatform: "shopify",
  modalAction: null,
  modalReturnFocus: null,
  currentUser: null,
  accountId: "",
  account: null,
  apiKey: {
    exists: true,
    value: "sk-liad-4d91a98a71f2b44c9d3e6ab0",
    revealed: false,
    justGenerated: false
  },
  settings: createBlankSettingsState()
};

const elements = {
  sidebar: document.querySelector("[data-sidebar]"),
  mobileOverlay: document.querySelector("[data-mobile-overlay]"),
  sidebarToggle: document.querySelector("[data-sidebar-toggle]"),
  navLinks: Array.from(document.querySelectorAll("[data-nav-link][data-route]")),
  brandLink: document.querySelector("[data-brand-link]"),
  brandText: document.querySelector("[data-brand-text]"),
  storeIdentity: document.querySelector("[data-store-identity]"),
  storeName: document.querySelector("[data-store-name]"),
  storeIcon: document.querySelector("[data-store-icon]"),
  storeCopy: document.querySelector("[data-store-copy]"),
  storeGear: document.querySelector("[data-store-gear]"),
  storeMenuTrigger: document.querySelector("[data-store-menu-trigger]"),
  storeMenu: document.querySelector("[data-store-menu]"),
  breadcrumb: document.querySelector("[data-breadcrumb]"),
  viewRoot: document.querySelector("[data-view-root]"),
  settingsRoot: document.querySelector("[data-settings-root]"),
  settingsOverlay: document.querySelector("[data-settings-overlay]"),
  settingsPanel: document.querySelector("[data-settings-panel]"),
  settingsContent: document.querySelector("[data-settings-content]"),
  modalRoot: document.querySelector("[data-modal-root]"),
  modalDialog: document.querySelector("[data-modal-dialog]"),
  modalEyebrow: document.querySelector("[data-modal-eyebrow]"),
  modalTitle: document.querySelector("[data-modal-title]"),
  modalBody: document.querySelector("[data-modal-body]"),
  modalConfirm: document.querySelector("[data-modal-confirm]")
};

let chartId = 0;
let settingsCloseTimer = 0;

function createBlankSettingsState() {
  return {
    open: false,
    activeTab: "conta",
    deleteOpen: false,
    deleteInput: "",
    focusRestore: null,
    payment: {
      showAllInvoices: false
    },
    accountSection: {
      saved: {
        firstName: "",
        lastName: "",
        email: ""
      },
      draft: {
        firstName: "",
        lastName: "",
        email: ""
      },
      errors: {},
      dirty: false
    },
    storeSection: {
      saved: {
        storeName: "",
        cnpj: "",
        monthlyCustomersRange: MONTHLY_CUSTOMER_OPTIONS[0].value
      },
      draft: {
        storeName: "",
        cnpj: "",
        monthlyCustomersRange: MONTHLY_CUSTOMER_OPTIONS[0].value
      },
      errors: {},
      dirty: false
    },
    logoSection: {
      savedLogoUrl: "",
      draftLogoUrl: "",
      savedLogoStoragePath: "",
      draftLogoStoragePath: "",
      savedFileName: "",
      draftFileName: "",
      savedIsGenerated: false,
      draftIsGenerated: false,
      pendingFile: null,
      error: "",
      dirty: false
    }
  };
}

function normalizeRoute(pathname) {
  return ROUTES[pathname] ? pathname : "/dashboard";
}

function isMobile() {
  return window.innerWidth < 1024;
}

function isModalOpen() {
  return !elements.modalRoot.classList.contains("hidden");
}

function getInitials(value) {
  return value
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("");
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function wait(duration) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, duration);
  });
}

function formatNumber(value) {
  return new Intl.NumberFormat("pt-BR").format(value);
}

function formatCurrency(value) {
  return new Intl.NumberFormat("pt-BR", {
    style: "currency",
    currency: "BRL",
    maximumFractionDigits: 0
  }).format(value);
}

function formatPercent(value) {
  return `${new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value)}%`;
}

function formatDecimal(value) {
  return new Intl.NumberFormat("pt-BR", {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1
  }).format(value);
}

function formatMetricValue(metric) {
  if (typeof metric.value === "string") {
    return metric.value;
  }

  if (metric.format === "currency") {
    return formatCurrency(metric.value);
  }

  if (metric.format === "percent") {
    return formatPercent(metric.value);
  }

  if (metric.format === "decimal") {
    return formatDecimal(metric.value);
  }

  return formatNumber(metric.value);
}

function maskApiKey() {
  return `sk-liad-${"*".repeat(24)}`;
}

function getDisplayedApiKey() {
  if (!state.apiKey.exists) {
    return "";
  }

  if (state.apiKey.revealed || state.apiKey.justGenerated) {
    return state.apiKey.value;
  }

  return maskApiKey();
}

function uniqueId(prefix) {
  chartId += 1;
  return `${prefix}-${chartId}`;
}

function getIconMarkup(icon) {
  const base = 'class="h-5 w-5 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const icons = {
    dashboard: `<svg viewBox="0 0 24 24" ${base}><rect x="3" y="3" width="7" height="7" rx="2"></rect><rect x="14" y="3" width="7" height="7" rx="2"></rect><rect x="3" y="14" width="7" height="7" rx="2"></rect><rect x="14" y="14" width="7" height="7" rx="2"></rect></svg>`,
    metrics: `<svg viewBox="0 0 24 24" ${base}><path d="M4 19V5"></path><path d="M4 19h16"></path><path d="m7 14 3-3 3 2 4-5"></path></svg>`,
    api: `<svg viewBox="0 0 24 24" ${base}><path d="M7 8 3 12l4 4"></path><path d="m17 8 4 4-4 4"></path><path d="M14 4 10 20"></path></svg>`,
    key: `<svg viewBox="0 0 24 24" ${base}><circle cx="8" cy="15" r="4"></circle><path d="M12 15h9"></path><path d="M18 15v3"></path><path d="M15 15v2"></path></svg>`,
    copy: `<svg viewBox="0 0 24 24" ${base}><rect x="9" y="9" width="11" height="11" rx="2"></rect><path d="M6 15H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h8a2 2 0 0 1 2 2v1"></path></svg>`,
    eye: `<svg viewBox="0 0 24 24" ${base}><path d="M2 12s3.5-6 10-6 10 6 10 6-3.5 6-10 6S2 12 2 12Z"></path><circle cx="12" cy="12" r="3"></circle></svg>`,
    gear: `<svg viewBox="0 0 24 24" ${base}><circle cx="12" cy="12" r="3"></circle><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06A1.7 1.7 0 0 0 15 19.4a1.7 1.7 0 0 0-1 .6 1.7 1.7 0 0 1-3 0 1.7 1.7 0 0 0-1-.6 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.6 15a1.7 1.7 0 0 0-.6-1 1.7 1.7 0 0 1 0-3 1.7 1.7 0 0 0 .6-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.6a1.7 1.7 0 0 0 1-.6 1.7 1.7 0 0 1 3 0 1.7 1.7 0 0 0 1 .6 1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.4 9c0 .38.22.74.6 1a1.7 1.7 0 0 1 0 3c-.38.26-.6.62-.6 1Z"></path></svg>`,
    chevron: `<svg viewBox="0 0 24 24" ${base}><path d="m9 6 6 6-6 6"></path></svg>`,
    menu: `<svg viewBox="0 0 24 24" ${base}><path d="M4 7h16"></path><path d="M4 12h16"></path><path d="M4 17h16"></path></svg>`,
    close: `<svg viewBox="0 0 24 24" ${base}><path d="m6 6 12 12"></path><path d="m18 6-12 12"></path></svg>`,
    lock: `<svg viewBox="0 0 24 24" ${base}><rect x="5" y="11" width="14" height="10" rx="2"></rect><path d="M8 11V8a4 4 0 0 1 8 0v3"></path></svg>`,
    upload: `<svg viewBox="0 0 24 24" ${base}><path d="M12 16V4"></path><path d="m7 9 5-5 5 5"></path><path d="M5 20h14"></path></svg>`,
    alert: `<svg viewBox="0 0 24 24" ${base}><path d="M12 9v4"></path><path d="M12 17h.01"></path><path d="M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94A2 2 0 0 0 22.18 18L13.71 3.86a2 2 0 0 0-3.42 0Z"></path></svg>`,
    creditCard: `<svg viewBox="0 0 24 24" ${base}><rect x="2" y="5" width="20" height="14" rx="3"></rect><path d="M2 10h20"></path><path d="M6 15h4"></path></svg>`,
    download: `<svg viewBox="0 0 24 24" ${base}><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>`
  };

  return icons[icon] ?? "";
}

function cardClass(extra = "") {
  return `overflow-hidden rounded-[28px] border border-white/10 bg-[rgba(19,19,21,0.88)] shadow-panel ${extra}`.trim();
}

function renderSidebar() {
  const mobile = isMobile();
  const collapsed = !mobile && state.sidebarCollapsed;
  const widthClass = collapsed ? "w-[84px]" : "w-[240px]";
  const translateClass = mobile ? (state.mobileOpen ? "translate-x-0" : "-translate-x-full") : "translate-x-0";

  elements.sidebar.className = [
    "fixed inset-y-0 left-0 z-40 flex shrink-0 flex-col justify-between border-r border-white/10 bg-[rgba(19,19,21,0.94)] px-4 py-4 backdrop-blur-xl transition-all duration-200 ease-out lg:static",
    widthClass,
    translateClass
  ].join(" ");

  elements.sidebar.dataset.collapsed = String(collapsed);
  elements.sidebar.dataset.mobileOpen = String(state.mobileOpen);
  elements.mobileOverlay.hidden = !mobile || !state.mobileOpen;
  elements.mobileOverlay.className = `fixed inset-0 z-30 bg-black/55 backdrop-blur-sm ${mobile ? "lg:hidden" : "hidden"}`;

  elements.brandLink.classList.toggle("justify-center", collapsed);
  elements.brandLink.classList.toggle("flex-col", collapsed);
  elements.brandLink.classList.toggle("gap-2", collapsed);
  elements.brandLink.classList.toggle("gap-3", !collapsed);
  elements.brandLink.classList.toggle("px-0", collapsed);
  elements.brandLink.classList.toggle("text-center", collapsed);
  elements.brandText.classList.remove("hidden");
  elements.brandText.classList.toggle("text-2xl", !collapsed);
  elements.brandText.classList.toggle("text-sm", collapsed);
  elements.brandText.classList.toggle("leading-none", collapsed);
  elements.storeIdentity.classList.toggle("hidden", collapsed);
  elements.storeCopy.classList.toggle("hidden", collapsed);
  elements.storeIcon.classList.toggle("hidden", collapsed);
  elements.storeMenuTrigger.classList.toggle("justify-center", collapsed);
  elements.storeMenuTrigger.classList.toggle("justify-between", !collapsed);
  elements.storeMenuTrigger.classList.toggle("w-11", collapsed);
  elements.storeMenuTrigger.classList.toggle("mx-auto", collapsed);
  elements.storeMenuTrigger.classList.toggle("px-2.5", collapsed);
  elements.storeMenuTrigger.classList.toggle("px-3", !collapsed);
  elements.storeMenuTrigger.classList.toggle("py-2.5", collapsed);
  elements.storeMenuTrigger.classList.toggle("rounded-2xl", !collapsed);
  elements.storeMenuTrigger.classList.toggle("rounded-xl", collapsed);
  elements.storeGear.innerHTML = mobile ? getIconMarkup("chevron") : getIconMarkup("gear");
  elements.storeGear.classList.toggle("mx-auto", collapsed);
  elements.storeMenu.className = collapsed && !mobile
    ? "absolute bottom-0 left-[calc(100%+12px)] w-[180px] rounded-2xl border border-white/10 bg-[rgba(19,19,21,0.98)] p-2 shadow-panel"
    : "absolute bottom-[calc(100%+10px)] left-0 right-0 rounded-2xl border border-white/10 bg-[rgba(19,19,21,0.98)] p-2 shadow-panel";

  elements.sidebarToggle.innerHTML = mobile
    ? state.mobileOpen
      ? getIconMarkup("close")
      : getIconMarkup("menu")
    : collapsed
      ? getIconMarkup("chevron")
      : `<span class="inline-flex rotate-180">${getIconMarkup("chevron")}</span>`;

  elements.navLinks.forEach((link) => {
    const route = link.dataset.route;
    const active = route === state.currentRoute;
    link.className = [
      "flex min-h-[48px] items-center rounded-2xl border transition duration-200 ease-out",
      collapsed ? "justify-center px-0" : "gap-3 px-4",
      active
        ? "border-liad-purple/20 bg-[linear-gradient(135deg,_rgba(204,151,255,0.16),_rgba(105,156,255,0.1))] text-liad-text"
        : "border-transparent bg-transparent text-liad-muted hover:border-white/10 hover:bg-white/[0.04] hover:text-liad-text"
    ].join(" ");
    link.innerHTML = `
      <span class="inline-flex h-5 w-5 shrink-0 items-center justify-center">${getIconMarkup(ROUTES[route].icon)}</span>
      <span class="${collapsed ? "hidden" : "block"} text-sm font-semibold">${ROUTES[route].label}</span>
    `;
  });
}

function renderChrome() {
  renderSidebar();
  elements.breadcrumb.textContent = ROUTES[state.currentRoute].label;
  document.title = `${ROUTES[state.currentRoute].label} | LIAD`;
}

function renderAccount(account) {
  elements.storeName.textContent = account.storeName;
  elements.storeIcon.innerHTML = "";

  if (account.hasCustomLogo && account.logoUrl) {
    const logoImage = document.createElement("img");
    logoImage.src = account.logoUrl;
    logoImage.alt = `Logo da loja ${account.storeName}`;
    logoImage.className = "h-full w-full rounded-2xl object-cover";
    elements.storeIcon.textContent = "";
    elements.storeIcon.appendChild(logoImage);
    return;
  }

  elements.storeIcon.textContent = getInitials(account.storeName) || "LI";
}

function getLinePoints(data, width, height, padding) {
  const values = data.map((item) => item.value);
  const max = Math.max(...values);
  const min = Math.min(...values);
  const range = Math.max(max - min, 1);
  const plotWidth = width - padding.left - padding.right;
  const plotHeight = height - padding.top - padding.bottom;
  const step = data.length > 1 ? plotWidth / (data.length - 1) : plotWidth;

  return data.map((item, index) => ({
    ...item,
    x: padding.left + step * index,
    y: padding.top + ((max - item.value) / range) * plotHeight
  }));
}

function getSmoothPath(points) {
  if (points.length === 0) {
    return "";
  }

  if (points.length === 1) {
    return `M ${points[0].x} ${points[0].y}`;
  }

  let path = `M ${points[0].x} ${points[0].y}`;

  for (let index = 0; index < points.length - 1; index += 1) {
    const current = points[index];
    const next = points[index + 1];
    const controlX = (current.x + next.x) / 2;
    path += ` C ${controlX} ${current.y}, ${controlX} ${next.y}, ${next.x} ${next.y}`;
  }

  return path;
}

function buildLineChart({ data, color, fill, formatter, height = 220 }) {
  const width = 720;
  const padding = { top: 16, right: 18, bottom: 32, left: 18 };
  const points = getLinePoints(data, width, height, padding);
  const path = getSmoothPath(points);
  const gradientId = uniqueId("line");
  const fillPath =
    `${path} L ${points[points.length - 1].x} ${height - padding.bottom} ` +
    `L ${points[0].x} ${height - padding.bottom} Z`;

  return `
    <div class="relative" data-chart-wrap data-width="${width}" data-height="${height}">
      <svg viewBox="0 0 ${width} ${height}" class="block h-auto w-full" aria-hidden="true">
        <defs>
          <linearGradient id="${gradientId}" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="${fill}" stop-opacity="0.35"></stop>
            <stop offset="100%" stop-color="${fill}" stop-opacity="0"></stop>
          </linearGradient>
        </defs>
        ${Array.from({ length: 4 }, (_, index) => {
          const y = padding.top + ((height - padding.top - padding.bottom) / 3) * index;
          return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="1"></line>`;
        }).join("")}
        <path d="${fillPath}" fill="url(#${gradientId})"></path>
        <path d="${path}" fill="none" stroke="${color}" stroke-width="3" stroke-linecap="round"></path>
        ${points.map((point) => `
          <circle cx="${point.x}" cy="${point.y}" r="4" fill="${color}"></circle>
          <circle
            class="liad-chart-target"
            cx="${point.x}"
            cy="${point.y}"
            r="16"
            fill="transparent"
            tabindex="0"
            data-label="${point.label}"
            data-value="${formatter(point.value)}"
            data-x="${point.x}"
            data-y="${point.y}"
          ></circle>
        `).join("")}
        ${points.map((point) => `
          <text x="${point.x}" y="${height - 10}" text-anchor="middle" fill="rgba(173,170,173,0.82)" font-size="11">
            ${point.label}
          </text>
        `).join("")}
      </svg>
      <div
        data-tooltip
        class="pointer-events-none invisible absolute z-10 min-w-[132px] -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-2xl border border-white/10 bg-[rgba(8,8,10,0.96)] px-3 py-2 text-xs opacity-0 shadow-panel transition"
      ></div>
    </div>
  `;
}

function buildBarChart({ data, color, formatter, height = 180 }) {
  const width = 720;
  const padding = { top: 14, right: 18, bottom: 32, left: 18 };
  const values = data.map((item) => item.value);
  const max = Math.max(...values);
  const plotHeight = height - padding.top - padding.bottom;
  const plotWidth = width - padding.left - padding.right;
  const gap = 16;
  const barWidth = (plotWidth - gap * (data.length - 1)) / data.length;

  return `
    <div class="relative" data-chart-wrap data-width="${width}" data-height="${height}">
      <svg viewBox="0 0 ${width} ${height}" class="block h-auto w-full" aria-hidden="true">
        ${Array.from({ length: 4 }, (_, index) => {
          const y = padding.top + (plotHeight / 3) * index;
          return `<line x1="${padding.left}" y1="${y}" x2="${width - padding.right}" y2="${y}" stroke="rgba(255,255,255,0.08)" stroke-width="1"></line>`;
        }).join("")}
        ${data.map((item, index) => {
          const x = padding.left + index * (barWidth + gap);
          const barHeight = (item.value / max) * plotHeight;
          const y = height - padding.bottom - barHeight;
          return `
            <rect x="${x}" y="${y}" width="${barWidth}" height="${barHeight}" rx="12" fill="${color}" fill-opacity="${0.46 + index * 0.05}"></rect>
            <rect
              class="liad-chart-target"
              x="${x}"
              y="${y}"
              width="${barWidth}"
              height="${barHeight}"
              rx="12"
              fill="transparent"
              tabindex="0"
              data-label="${item.label}"
              data-value="${formatter(item.value)}"
              data-x="${x + barWidth / 2}"
              data-y="${y}"
            ></rect>
            <text x="${x + barWidth / 2}" y="${height - 10}" text-anchor="middle" fill="rgba(173,170,173,0.82)" font-size="11">
              ${item.label}
            </text>
          `;
        }).join("")}
      </svg>
      <div
        data-tooltip
        class="pointer-events-none invisible absolute z-10 min-w-[132px] -translate-x-1/2 -translate-y-[calc(100%+14px)] rounded-2xl border border-white/10 bg-[rgba(8,8,10,0.96)] px-3 py-2 text-xs opacity-0 shadow-panel transition"
      ></div>
    </div>
  `;
}

function renderPageHeader(title, description = "", trailing = "") {
  return `
    <div class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 class="font-display text-[2.35rem] font-extrabold tracking-[-0.06em] text-liad-text sm:text-[2.8rem]">${title}</h1>
        ${description ? `<p class="mt-3 max-w-3xl text-sm leading-7 text-liad-muted">${description}</p>` : ""}
      </div>
      ${trailing}
    </div>
  `;
}

function renderDashboardView() {
  const maxProductCount = Math.max(...DASHBOARD_PRODUCTS.map((item) => item.count));

  return `
    ${renderPageHeader(
      "Visao geral da operacao"
    )}

    <section class="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
      ${DASHBOARD_METRICS.map((metric) => `
        <article class="${cardClass("p-5")}">
          <p class="text-[11px] uppercase tracking-[0.2em] text-liad-muted">${metric.label}</p>
          <p class="mt-4 font-display text-[2rem] font-extrabold tracking-[-0.05em] text-liad-text">${formatMetricValue(metric)}</p>
          <p class="mt-3 text-sm leading-6 text-liad-muted">${metric.note}</p>
        </article>
      `).join("")}
    </section>

    <section class="mt-4 grid gap-4 xl:grid-cols-[minmax(0,1.55fr)_minmax(320px,1fr)]">
      <article class="${cardClass("p-5 sm:p-6")}">
        <div class="mb-4">
          <p class="text-[11px] uppercase tracking-[0.2em] text-liad-muted">Ultimos 7 dias</p>
          <h2 class="mt-2 text-lg font-semibold text-liad-text">Conversas por dia</h2>
          <p class="mt-1 text-sm leading-6 text-liad-muted">Leitura rapida do volume tratado pela IA na semana.</p>
        </div>
        ${buildLineChart({
          data: DASHBOARD_LINE_DATA,
          color: "rgba(204,151,255,1)",
          fill: "rgba(204,151,255,1)",
          formatter: (value) => `${formatNumber(value)} conversas`,
          height: 220
        })}
      </article>

      <article class="${cardClass("p-5 sm:p-6")}">
        <div class="mb-4">
          <p class="text-[11px] uppercase tracking-[0.2em] text-liad-muted">Ranking</p>
          <h2 class="mt-2 text-lg font-semibold text-liad-text">Produtos mais consultados</h2>
          <p class="mt-1 text-sm leading-6 text-liad-muted">Top 5 produtos puxados pela LIAD no periodo.</p>
        </div>
        <div class="grid gap-4">
          ${DASHBOARD_PRODUCTS.map((product) => `
            <div class="grid gap-2">
              <div class="flex items-center justify-between gap-4 text-sm">
                <strong class="font-medium text-liad-text">${product.name}</strong>
                <span class="text-liad-muted">${formatNumber(product.count)} consultas</span>
              </div>
              <div class="h-2 rounded-full bg-white/6">
                <span class="block h-2 rounded-full bg-gradient-to-r from-liad-violet to-liad-blue" style="width:${(product.count / maxProductCount) * 100}%"></span>
              </div>
            </div>
          `).join("")}
        </div>
      </article>
    </section>
  `;
}

function renderMetricsView() {
  const selected = METRIC_DATA[state.metricsFilter];
  const start = (state.metricsPage - 1) * 10;
  const pageItems = RECENT_CONVERSATIONS.slice(start, start + 10);
  const totalPages = Math.ceil(RECENT_CONVERSATIONS.length / 10);

  return `
    ${renderPageHeader(
      "Metricas de performance",
      `Dados detalhados para acompanhar volume, eficiencia e impacto comercial da IA no periodo ${selected.periodLabel.toLowerCase()}.`,
      `
        <div class="inline-flex flex-wrap gap-2">
          ${METRIC_FILTERS.map((filter) => `
            <button
              type="button"
              data-filter="${filter.id}"
              class="inline-flex min-h-10 items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition ${
                filter.id === state.metricsFilter
                  ? "border-liad-purple/20 bg-[linear-gradient(135deg,_rgba(204,151,255,0.18),_rgba(105,156,255,0.1))] text-liad-text"
                  : "border-white/10 bg-white/[0.04] text-liad-text hover:bg-white/[0.08]"
              }"
            >
              ${filter.label}
            </button>
          `).join("")}
        </div>
      `
    )}

    <section class="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      ${selected.kpis.map((metric) => `
        <article class="${cardClass("p-5")}">
          <p class="text-[11px] uppercase tracking-[0.2em] text-liad-muted">${metric.label}</p>
          <p class="mt-4 font-display text-[1.8rem] font-extrabold tracking-[-0.05em] text-liad-text">${formatMetricValue(metric)}</p>
          ${
            metric.delta
              ? `
                <div class="mt-3 inline-flex items-center gap-2 text-xs font-semibold ${metric.delta.tone === "positive" ? "text-emerald-300" : "text-orange-200"}">
                  <span>${metric.delta.value}</span>
                  <span class="font-normal text-liad-muted">${metric.delta.note}</span>
                </div>
              `
              : `<p class="mt-3 text-sm leading-6 text-liad-muted">Atualizado conforme o filtro selecionado.</p>`
          }
        </article>
      `).join("")}
    </section>

    <section class="mt-4 grid gap-4 xl:grid-cols-2">
      <article class="${cardClass("p-5 sm:p-6")}">
        <div class="mb-4">
          <p class="text-[11px] uppercase tracking-[0.2em] text-liad-muted">Volume diario</p>
          <h2 class="mt-2 text-lg font-semibold text-liad-text">Conversas por dia</h2>
          <p class="mt-1 text-sm leading-6 text-liad-muted">Passe o mouse para ver a data e o volume exato.</p>
        </div>
        ${buildBarChart({
          data: selected.volume,
          color: "rgba(105,156,255,1)",
          formatter: (value) => `${formatNumber(value)} conversas`,
          height: 180
        })}
      </article>

      <article class="${cardClass("p-5 sm:p-6")}">
        <div class="mb-4">
          <p class="text-[11px] uppercase tracking-[0.2em] text-liad-muted">Conversao</p>
          <h2 class="mt-2 text-lg font-semibold text-liad-text">Taxa ao longo do tempo</h2>
          <p class="mt-1 text-sm leading-6 text-liad-muted">Linha suave com area preenchida em baixa opacidade.</p>
        </div>
        ${buildLineChart({
          data: selected.conversion,
          color: "rgba(204,151,255,1)",
          fill: "rgba(204,151,255,1)",
          formatter: (value) => `${formatPercent(value)} de conversao`,
          height: 180
        })}
      </article>
    </section>

    <article class="${cardClass("mt-4 p-5 sm:p-6")}">
      <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p class="text-[11px] uppercase tracking-[0.2em] text-liad-muted">Historico</p>
          <h2 class="mt-2 text-lg font-semibold text-liad-text">Conversas recentes</h2>
        </div>
        <p class="text-sm text-liad-muted">Paginacao simples com 10 registros por pagina.</p>
      </div>

      <div class="overflow-x-auto">
        <table class="min-w-[760px] w-full border-collapse">
          <thead>
            <tr class="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.16em] text-liad-muted">
              <th class="px-3 py-3 font-medium">ID da conversa</th>
              <th class="px-3 py-3 font-medium">Data/hora</th>
              <th class="px-3 py-3 font-medium">Duracao</th>
              <th class="px-3 py-3 font-medium">Mensagens</th>
              <th class="px-3 py-3 font-medium">Converteu?</th>
              <th class="px-3 py-3 font-medium">Produto consultado</th>
            </tr>
          </thead>
          <tbody>
            ${pageItems.map((row) => `
              <tr class="border-b border-white/6 text-sm text-liad-text transition hover:bg-white/[0.03]">
                <td class="px-3 py-4">${row.id}</td>
                <td class="px-3 py-4">${row.date}</td>
                <td class="px-3 py-4">${row.duration}</td>
                <td class="px-3 py-4">${row.messages}</td>
                <td class="px-3 py-4">
                  <span class="inline-flex rounded-full px-3 py-1 text-xs font-semibold ${row.converted ? "bg-emerald-400/12 text-emerald-300" : "bg-orange-400/12 text-orange-200"}">
                    ${row.converted ? "Sim" : "Nao"}
                  </span>
                </td>
                <td class="px-3 py-4">${row.product}</td>
              </tr>
            `).join("")}
          </tbody>
        </table>
      </div>

      <div class="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p class="text-sm text-liad-muted">Pagina ${state.metricsPage} de ${totalPages}</p>
        <div class="flex gap-2">
          <button
            type="button"
            data-page="prev"
            ${state.metricsPage === 1 ? "disabled" : ""}
            class="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-liad-text transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Anterior
          </button>
          <button
            type="button"
            data-page="next"
            ${state.metricsPage === totalPages ? "disabled" : ""}
            class="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-liad-text transition hover:bg-white/[0.08] disabled:cursor-not-allowed disabled:opacity-40"
          >
            Proxima
          </button>
        </div>
      </div>
    </article>
  `;
}

function renderApiKeyCard() {
  if (!state.apiKey.exists) {
    return `
      <article class="${cardClass("grid min-h-[240px] place-items-center p-6 text-center")}">
        <div>
          <div class="mx-auto inline-flex h-14 w-14 items-center justify-center rounded-2xl bg-liad-purple/10 text-liad-purple">
            ${getIconMarkup("key")}
          </div>
          <h2 class="mt-5 text-xl font-semibold text-liad-text">Nenhuma chave gerada ainda</h2>
          <p class="mx-auto mt-2 max-w-md text-sm leading-7 text-liad-muted">
            Gere uma API Key para conectar a LIAD a sua loja e liberar os snippets abaixo.
          </p>
          <button
            type="button"
            data-api-action="generate-empty"
            class="mt-5 inline-flex min-h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-liad-violet to-liad-purple px-5 text-sm font-semibold text-black transition hover:-translate-y-0.5"
          >
            Gerar API Key
          </button>
        </div>
      </article>
    `;
  }

  return `
    <article class="${cardClass("p-5 sm:p-6")}">
      <div class="flex flex-col gap-4">
        <div>
          <p class="text-[11px] uppercase tracking-[0.2em] text-liad-muted">Gerenciamento da API Key</p>
          <h2 class="mt-2 text-lg font-semibold text-liad-text">Sua API Key</h2>
          <p class="mt-1 text-sm leading-6 text-liad-muted">Maximo de uma chave ativa por vez. Ao gerar uma nova, a anterior e invalidada.</p>
        </div>

        <div class="flex flex-col gap-3 xl:flex-row">
          <input
            type="text"
            readonly
            value="${getDisplayedApiKey()}"
            aria-label="Sua API Key"
            class="min-h-12 flex-1 rounded-2xl border border-white/10 bg-white/[0.03] px-4 font-mono text-sm text-liad-text outline-none"
          />
          <div class="flex flex-wrap gap-3">
            <button type="button" data-api-action="copy-key" class="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-liad-text transition hover:bg-white/[0.08]">${getIconMarkup("copy")}<span>Copiar</span></button>
            <button type="button" data-api-action="toggle-key" class="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-liad-text transition hover:bg-white/[0.08]">${getIconMarkup("eye")}<span>${state.apiKey.revealed || state.apiKey.justGenerated ? "Ocultar" : "Revelar"}</span></button>
          </div>
        </div>

        ${state.apiKey.justGenerated ? `<div class="rounded-2xl border border-[#ffbd59]/30 bg-[#ffbd59]/10 px-4 py-3 text-sm leading-7 text-[#ffe4ae]"><strong>Salve essa chave agora.</strong> Ela nao sera exibida novamente apos a proxima geracao.</div>` : ""}

        <div class="flex flex-wrap gap-3">
          <button type="button" data-api-action="generate" class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-liad-violet to-liad-purple px-4 text-sm font-semibold text-black transition hover:-translate-y-0.5">Gerar nova chave</button>
          <button type="button" data-api-action="delete" class="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#ff8439]/30 bg-[#ff8439]/10 px-4 text-sm font-semibold text-[#ffe2d0] transition hover:bg-[#ff8439]/15">Excluir chave</button>
        </div>
      </div>
    </article>
  `;
}

function renderApiView() {
  const snippet = SNIPPETS[state.snippetPlatform];
  const snippetKey = state.apiKey.exists ? state.apiKey.value : "sk-liad-sua-chave-aqui";

  return `
    ${renderPageHeader(
      "Integracao e acesso a API",
      "Gerencie sua chave ativa e copie o codigo pronto para inserir a LIAD na sua loja."
    )}

    <section class="grid gap-4">
      ${renderApiKeyCard()}

      <article class="${cardClass("p-5 sm:p-6")}">
        <div class="mb-4">
          <p class="text-[11px] uppercase tracking-[0.2em] text-liad-muted">Snippets de integracao</p>
          <h2 class="mt-2 text-lg font-semibold text-liad-text">Integre a LIAD na sua loja</h2>
          <p class="mt-1 text-sm leading-6 text-liad-muted">Escolha sua plataforma e cole o codigo abaixo no seu site.</p>
        </div>

        <div class="mb-4 inline-flex flex-wrap gap-2">
          ${Object.entries(SNIPPETS).map(([platform, config]) => `
            <button
              type="button"
              data-platform="${platform}"
              class="inline-flex min-h-10 items-center justify-center rounded-2xl border px-4 text-sm font-semibold transition ${
                platform === state.snippetPlatform
                  ? "border-liad-purple/20 bg-[linear-gradient(135deg,_rgba(204,151,255,0.18),_rgba(105,156,255,0.1))] text-liad-text"
                  : "border-white/10 bg-white/[0.04] text-liad-text hover:bg-white/[0.08]"
              }"
            >
              ${config.label}
            </button>
          `).join("")}
        </div>

        <div class="overflow-hidden rounded-[24px] border border-white/10 bg-black">
          <div class="flex items-center justify-between gap-4 border-b border-white/10 bg-white/[0.03] px-4 py-3">
            <strong class="text-sm font-semibold text-liad-text">${snippet.label}</strong>
            <button type="button" data-api-action="copy-snippet" class="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-liad-text transition hover:bg-white/[0.08]">Copiar codigo</button>
          </div>
          <pre class="overflow-x-auto px-4 py-5 text-sm leading-7 text-[#e3d5ff]"><code>${escapeHtml(snippet.code(snippetKey))}</code></pre>
        </div>
        <p class="mt-3 text-sm leading-6 text-liad-muted">${snippet.instruction}</p>
      </article>
    </section>
  `;
}

function buildGeneratedLogo(storeName) {
  const initials = escapeHtml(getInitials(storeName) || "LI");
  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="128" height="128" viewBox="0 0 128 128">
      <defs>
        <linearGradient id="liad-logo-gradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#cc97ff" />
          <stop offset="100%" stop-color="#699cff" />
        </linearGradient>
      </defs>
      <rect width="128" height="128" rx="64" fill="url(#liad-logo-gradient)" />
      <text x="50%" y="54%" dominant-baseline="middle" text-anchor="middle" fill="#09090b" font-family="Manrope, Arial, sans-serif" font-size="44" font-weight="800">${initials}</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(svg)}`;
}

function createSettingsStateFromAccount(account) {
  const generatedLogo = buildGeneratedLogo(account.storeName);
  const hasCustomLogo = Boolean(account.hasCustomLogo && account.logoUrl);
  const logoUrl = hasCustomLogo ? account.logoUrl : generatedLogo;
  const logoFileName = hasCustomLogo
    ? String(account.logoStoragePath ?? "logo-personalizada").split("/").at(-1) || "logo-personalizada"
    : "logo-gerada.svg";

  return {
    ...createBlankSettingsState(),
    accountSection: {
      saved: {
        firstName: account.ownerFirstName ?? "",
        lastName: account.ownerLastName ?? "",
        email: account.email ?? ""
      },
      draft: {
        firstName: account.ownerFirstName ?? "",
        lastName: account.ownerLastName ?? "",
        email: account.email ?? ""
      },
      errors: {},
      dirty: false
    },
    storeSection: {
      saved: {
        storeName: account.storeName ?? "Loja LIAD",
        cnpj: account.cnpj ?? "00.000.000/0000-00",
        monthlyCustomersRange: account.monthlyVisitsRange ?? MONTHLY_CUSTOMER_OPTIONS[0].value
      },
      draft: {
        storeName: account.storeName ?? "Loja LIAD",
        cnpj: account.cnpj ?? "00.000.000/0000-00",
        monthlyCustomersRange: account.monthlyVisitsRange ?? MONTHLY_CUSTOMER_OPTIONS[0].value
      },
      errors: {},
      dirty: false
    },
    logoSection: {
      savedLogoUrl: logoUrl,
      draftLogoUrl: logoUrl,
      savedLogoStoragePath: hasCustomLogo ? account.logoStoragePath ?? "" : "",
      draftLogoStoragePath: hasCustomLogo ? account.logoStoragePath ?? "" : "",
      savedFileName: logoFileName,
      draftFileName: logoFileName,
      savedIsGenerated: !hasCustomLogo,
      draftIsGenerated: !hasCustomLogo,
      pendingFile: null,
      error: "",
      dirty: false
    }
  };
}

function compareAccountSection() {
  const { saved, draft } = state.settings.accountSection;

  return (
    normalizeWhitespace(saved.firstName) !== normalizeWhitespace(draft.firstName) ||
    normalizeWhitespace(saved.lastName) !== normalizeWhitespace(draft.lastName)
  );
}

function compareStoreSection() {
  const { saved, draft } = state.settings.storeSection;

  return (
    normalizeWhitespace(saved.storeName) !== normalizeWhitespace(draft.storeName) ||
    String(saved.monthlyCustomersRange ?? "") !== String(draft.monthlyCustomersRange ?? "")
  );
}

function compareLogoSection() {
  const section = state.settings.logoSection;

  if (section.pendingFile) {
    return true;
  }

  if (section.savedIsGenerated && section.draftIsGenerated) {
    return false;
  }

  return (
    String(section.savedLogoUrl ?? "") !== String(section.draftLogoUrl ?? "") ||
    String(section.savedLogoStoragePath ?? "") !== String(section.draftLogoStoragePath ?? "") ||
    String(section.savedFileName ?? "") !== String(section.draftFileName ?? "") ||
    Boolean(section.savedIsGenerated) !== Boolean(section.draftIsGenerated)
  );
}

function getSectionDirtyState(sectionName) {
  const dirty =
    sectionName === "account"
      ? compareAccountSection()
      : sectionName === "store"
        ? compareStoreSection()
        : compareLogoSection();

  if (sectionName === "account") {
    state.settings.accountSection.dirty = dirty;
  }

  if (sectionName === "store") {
    state.settings.storeSection.dirty = dirty;
  }

  if (sectionName === "logo") {
    state.settings.logoSection.dirty = dirty;
  }

  return dirty;
}

function syncSectionDirty(sectionName) {
  getSectionDirtyState(sectionName);
  updateSectionDirtyBadge(sectionName);
}

function clearSettingsErrors(sectionName) {
  if (sectionName === "account") {
    state.settings.accountSection.errors = {};
  }

  if (sectionName === "store") {
    state.settings.storeSection.errors = {};
  }

  if (sectionName === "logo") {
    state.settings.logoSection.error = "";
  }
}

function setSettingsFieldError(sectionName, fieldName, message) {
  const errorElement = elements.settingsContent.querySelector(`[data-settings-error="${sectionName}.${fieldName}"]`);
  const field = elements.settingsContent.querySelector(`[data-settings-field="${sectionName}.${fieldName}"]`);

  if (errorElement) {
    errorElement.textContent = message;
  }

  if (field) {
    field.setAttribute("aria-invalid", message ? "true" : "false");
  }
}

function clearSettingsFieldError(sectionName, fieldName) {
  if (sectionName === "account") {
    delete state.settings.accountSection.errors[fieldName];
  }

  if (sectionName === "store") {
    delete state.settings.storeSection.errors[fieldName];
  }

  setSettingsFieldError(sectionName, fieldName, "");
}

function setLogoError(message) {
  state.settings.logoSection.error = message;
  const errorElement = elements.settingsContent.querySelector("[data-settings-logo-error]");

  if (errorElement) {
    errorElement.textContent = message;
  }
}

function validateAccountSection() {
  const values = state.settings.accountSection.draft;
  const errors = {};

  if (normalizeWhitespace(values.firstName).length < 2) {
    errors.firstName = "Informe o nome.";
  }

  if (normalizeWhitespace(values.lastName).length < 2) {
    errors.lastName = "Informe o sobrenome.";
  }

  return errors;
}

function validateStoreSection() {
  const values = state.settings.storeSection.draft;
  const errors = {};

  if (normalizeWhitespace(values.storeName).length < 2) {
    errors.storeName = "Informe o nome da loja.";
  }

  if (!MONTHLY_CUSTOMER_OPTIONS.some((option) => option.value === values.monthlyCustomersRange)) {
    errors.monthlyCustomersRange = "Selecione uma faixa valida.";
  }

  return errors;
}

function updateSectionDirtyBadge(sectionName) {
  if (!state.settings.open) {
    return;
  }

  const dirty = getSectionDirtyState(sectionName);
  const badge = elements.settingsContent.querySelector(`[data-settings-unsaved="${sectionName}"]`);

  if (badge) {
    badge.classList.toggle("hidden", !dirty);
    badge.classList.toggle("inline-flex", dirty);
  }
}

function syncSettingsHeaderStats() {
  const count = [
    getSectionDirtyState("account"),
    getSectionDirtyState("store"),
    getSectionDirtyState("logo")
  ].filter(Boolean).length;
  const element = elements.settingsContent.querySelector("[data-settings-pending-count]");

  if (element) {
    element.textContent =
      count === 0
        ? "Tudo salvo"
        : count === 1
          ? "1 secao com alteracoes"
          : `${count} secoes com alteracoes`;
  }
}

function recomputeAllSettingsDirtyState() {
  getSectionDirtyState("account");
  getSectionDirtyState("store");
  getSectionDirtyState("logo");
}

function renderSettingsField({
  section,
  field,
  label,
  type = "text",
  value = "",
  placeholder = "",
  autocomplete = "",
  readOnly = false,
  extraClass = "",
  trailing = "",
  hint = ""
}) {
  const error = section === "account"
    ? state.settings.accountSection.errors[field] ?? ""
    : state.settings.storeSection.errors[field] ?? "";

  const inputClass = `liad-input ${readOnly ? "cursor-not-allowed pr-12 opacity-75" : ""} ${extraClass}`.trim();

  return `
    <div>
      <label class="mb-2 block text-sm font-medium text-liad-text" for="settings-${section}-${field}">${label}</label>
      <div class="relative">
        <input
          id="settings-${section}-${field}"
          data-settings-field="${section}.${field}"
          type="${type}"
          value="${escapeHtml(value)}"
          placeholder="${escapeHtml(placeholder)}"
          autocomplete="${autocomplete}"
          ${readOnly ? "readonly" : ""}
          aria-invalid="${error ? "true" : "false"}"
          class="${inputClass}"
        />
        ${trailing}
      </div>
      <p data-settings-error="${section}.${field}" class="liad-field-error">${error}</p>
      ${hint ? `<p class="text-xs leading-5 text-liad-muted">${hint}</p>` : ""}
    </div>
  `;
}

function renderSectionBadge(sectionName) {
  const dirty = getSectionDirtyState(sectionName);

  return `
    <span
      data-settings-unsaved="${sectionName}"
      class="${dirty ? "inline-flex" : "hidden"} items-center gap-2 rounded-full border border-[#ffbd59]/25 bg-[#ffbd59]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ffe4ae]"
    >
      <span class="h-2 w-2 rounded-full bg-[#ffd68e]"></span>
      Nao salvo
    </span>
  `;
}

function renderAccountSettingsTab() {
  const accountValues = state.settings.accountSection.draft;
  const storeValues = state.settings.storeSection.draft;
  const logoSection = state.settings.logoSection;
  const logoPreviewUrl = logoSection.draftLogoUrl;

  return `
    <div class="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4 sm:px-6 lg:px-8">
      <div class="space-y-4">
        <form data-settings-form="account" novalidate class="${cardClass("p-5 sm:p-6")}">
          <div class="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <div class="mt-2 flex flex-wrap items-center gap-3">
                <h2 class="text-xl font-semibold text-liad-text">Dados da conta</h2>
                ${renderSectionBadge("account")}
              </div>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-liad-muted">Informacoes pessoais vinculadas ao seu acesso.</p>
            </div>
          </div>

          <div class="mt-6 grid gap-5 sm:grid-cols-2">
            ${renderSettingsField({ section: "account", field: "firstName", label: "Nome", value: accountValues.firstName, placeholder: "Pedro", autocomplete: "given-name" })}
            ${renderSettingsField({ section: "account", field: "lastName", label: "Sobrenome", value: accountValues.lastName, placeholder: "Silva", autocomplete: "family-name" })}
            <div class="sm:col-span-2">
              ${renderSettingsField({
                section: "account",
                field: "email",
                label: "E-mail",
                type: "email",
                value: accountValues.email,
                placeholder: "seuemail@email.com",
                autocomplete: "email",
                readOnly: true,
                trailing: `<span class="pointer-events-auto absolute inset-y-0 right-3 inline-flex items-center text-liad-muted" title="O e-mail nao pode ser alterado nesta etapa." aria-label="O e-mail nao pode ser alterado nesta etapa.">${getIconMarkup("lock")}</span>`
              })}
            </div>
          </div>

          <div class="mt-6 flex justify-end">
            <button type="submit" data-settings-submit="account" class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-liad-violet to-liad-purple px-5 text-sm font-semibold text-black transition hover:-translate-y-0.5">Salvar alteracoes</button>
          </div>
        </form>

        <form data-settings-form="store" novalidate class="${cardClass("p-5 sm:p-6")}">
          <div>
            <div class="mt-2 flex flex-wrap items-center gap-3">
              <h2 class="text-xl font-semibold text-liad-text">Dados da loja</h2>
              ${renderSectionBadge("store")}
            </div>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-liad-muted">Informacoes da sua empresa cadastradas na LIAD.</p>
          </div>

          <div class="mt-6 grid gap-5 sm:grid-cols-2">
            <div class="sm:col-span-2">
              ${renderSettingsField({ section: "store", field: "storeName", label: "Nome da loja", value: storeValues.storeName, placeholder: "Nome da sua loja", autocomplete: "organization" })}
            </div>
            ${renderSettingsField({
              section: "store",
              field: "cnpj",
              label: "CNPJ",
              value: storeValues.cnpj,
              readOnly: true,
              trailing: `<span class="pointer-events-auto absolute inset-y-0 right-3 inline-flex items-center text-liad-muted" title="O CNPJ nao pode ser alterado. Entre em contato com o suporte." aria-label="O CNPJ nao pode ser alterado. Entre em contato com o suporte.">${getIconMarkup("lock")}</span>`
            })}
            <div>
              <label class="mb-2 block text-sm font-medium text-liad-text" for="settings-store-monthlyCustomersRange">Quantidade estimada de clientes por mes</label>
              <select id="settings-store-monthlyCustomersRange" data-settings-field="store.monthlyCustomersRange" aria-invalid="${state.settings.storeSection.errors.monthlyCustomersRange ? "true" : "false"}" class="liad-input">
                ${MONTHLY_CUSTOMER_OPTIONS.map((option) => `<option value="${option.value}" ${option.value === storeValues.monthlyCustomersRange ? "selected" : ""}>${option.label}</option>`).join("")}
              </select>
              <p data-settings-error="store.monthlyCustomersRange" class="liad-field-error">${state.settings.storeSection.errors.monthlyCustomersRange ?? ""}</p>
            </div>
          </div>

          <div class="mt-6 flex justify-end">
            <button type="submit" data-settings-submit="store" class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-liad-violet to-liad-purple px-5 text-sm font-semibold text-black transition hover:-translate-y-0.5">Salvar alteracoes</button>
          </div>
        </form>

        <form data-settings-form="logo" novalidate class="${cardClass("p-5 sm:p-6")}">
          <div>
            <div class="mt-2 flex flex-wrap items-center gap-3">
              <h2 class="text-xl font-semibold text-liad-text">Logo da loja</h2>
              ${renderSectionBadge("logo")}
            </div>
            <p class="mt-2 max-w-2xl text-sm leading-6 text-liad-muted">Essa imagem sera usada para identificar sua loja na plataforma.</p>
          </div>

          <div class="mt-6 space-y-4">
            ${logoPreviewUrl ? `<div class="flex flex-col gap-4 rounded-[24px] border border-white/10 bg-white/[0.03] p-4 sm:flex-row sm:items-center"><img src="${escapeHtml(logoPreviewUrl)}" alt="Preview da logo da loja" class="h-16 w-16 rounded-full border border-white/10 object-cover" /><div class="min-w-0 flex-1"><p class="text-sm font-semibold text-liad-text">${escapeHtml(logoSection.draftFileName || "Logo selecionada")}</p><p class="mt-1 text-sm text-liad-muted">${logoSection.draftIsGenerated ? "Logo padrao gerada a partir do nome da loja." : "Preview pronta para salvar na plataforma."}</p></div>${logoSection.draftIsGenerated ? "" : `<button type="button" data-settings-logo-remove class="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-liad-text transition hover:bg-white/[0.08]">Remover</button>`}</div>` : ""}
            <label data-logo-dropzone class="group flex min-h-[184px] cursor-pointer flex-col items-center justify-center rounded-[28px] border border-dashed ${logoSection.error ? "border-[#ff8439]/40 bg-[#ff8439]/10" : "border-white/12 bg-white/[0.025]"} px-6 py-8 text-center transition hover:border-liad-purple/30 hover:bg-white/[0.04]">
              <input data-settings-logo-input id="settings-logo-input" type="file" accept=".jpg,.jpeg,.png,.svg,image/jpeg,image/png,image/svg+xml" class="hidden" />
              <span class="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-liad-purple transition group-hover:-translate-y-0.5">${getIconMarkup("upload")}</span>
              <span class="mt-4 text-base font-semibold text-liad-text">Arraste uma imagem ou clique para selecionar</span>
              <span class="mt-2 max-w-md text-sm leading-6 text-liad-muted">Formatos aceitos: JPG, PNG, SVG - maximo 2MB.</span>
            </label>
            <p data-settings-logo-error class="liad-field-error">${logoSection.error}</p>
          </div>

          <div class="mt-6 flex justify-end">
            <button type="submit" data-settings-submit="logo" class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-liad-violet to-liad-purple px-5 text-sm font-semibold text-black transition hover:-translate-y-0.5">Salvar logo</button>
          </div>
        </form>

        <section class="${cardClass("border-[#ff8439]/20 bg-[#ff8439]/10 p-5 sm:p-6")}">
          <div class="inline-flex items-center gap-2 rounded-full border border-[#ff8439]/20 bg-[#ff8439]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ffd5bd]">${getIconMarkup("alert")}Zona de risco</div>
          <h2 class="mt-4 text-xl font-semibold text-liad-text">Essas ações são irreversíveis</h2>
          <p class="mt-2 max-w-2xl text-sm leading-7 text-[#ffd5bd]">Ao excluir sua conta, todos os dados, integrações e histórico de conversas serão permanentemente removidos. Esta ação não pode ser desfeita.</p>
          <div class="mt-6 flex justify-start">
            <button type="button" data-settings-delete-open class="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#ff8439]/35 bg-[#ff8439]/14 px-5 text-sm font-semibold text-[#ffe2d0] transition hover:bg-[#ff8439]/20">Excluir minha conta</button>
          </div>
        </section>
      </div>
    </div>
  `;
}

function getPaymentStatusBadge(status) {
  if (status === "Pago") {
    return "bg-emerald-400/12 text-emerald-300";
  }

  if (status === "Pendente") {
    return "bg-[#ffbd59]/12 text-[#ffe4ae]";
  }

  return "bg-[#ff8439]/12 text-[#ffe2d0]";
}

function renderPaymentSettingsTab() {
  const invoices = state.settings.payment.showAllInvoices ? PAYMENT_INVOICES : PAYMENT_INVOICES.slice(0, 6);

  return `
    <div class="flex-1 overflow-y-auto overscroll-contain px-4 pb-6 pt-4 sm:px-6 lg:px-8">
      <div class="space-y-4">
        <section class="${cardClass("p-5 sm:p-6")}">
          <div class="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
            <div>
              <div class="mt-2 flex flex-wrap items-center gap-3">
                <h2 class="text-xl font-semibold text-liad-text">Seu plano</h2>
                <span class="inline-flex rounded-full border border-emerald-400/20 bg-emerald-400/10 px-3 py-1 text-xs font-semibold text-emerald-300">${PAYMENT_PLAN.status}</span>
              </div>
              <p class="mt-2 max-w-2xl text-sm leading-6 text-liad-muted">${PAYMENT_PLAN.description}</p>
            </div>
            <div class="rounded-[24px] border border-liad-purple/20 bg-[linear-gradient(135deg,_rgba(204,151,255,0.16),_rgba(105,156,255,0.1))] px-5 py-4 shadow-glow">
              <p class="text-[10px] uppercase tracking-[0.2em] text-liad-muted">Plano atual</p>
              <p class="mt-2 font-display text-xl font-extrabold tracking-[-0.05em] text-liad-text">${PAYMENT_PLAN.name}</p>
            </div>
          </div>
          <div class="mt-6 flex justify-start">
            <button type="button" data-settings-payment-action="upgrade" class="inline-flex min-h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-liad-violet to-liad-purple px-5 text-sm font-semibold text-black transition hover:-translate-y-0.5">Fazer upgrade</button>
          </div>
        </section>

        <section class="${cardClass("p-5 sm:p-6")}">
          <div class="mb-6">
            <h2 class="mt-2 text-xl font-semibold text-liad-text">Detalhes da cobranca</h2>
          </div>
          <div class="grid gap-4 md:grid-cols-2">
            ${PAYMENT_DETAILS.map((detail) => `<div class="rounded-[24px] border border-white/10 bg-white/[0.03] p-4"><p class="text-[11px] uppercase tracking-[0.18em] text-liad-muted">${detail.label}</p><p class="mt-3 text-sm font-semibold text-liad-text">${detail.value}</p></div>`).join("")}
          </div>
          <div class="mt-6 flex justify-start">
            <button type="button" data-settings-payment-action="payment-method" class="inline-flex min-h-11 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-5 text-sm font-semibold text-liad-text transition hover:bg-white/[0.08]">${getIconMarkup("creditCard")}Atualizar metodo de pagamento</button>
          </div>
        </section>

        <section class="${cardClass("p-5 sm:p-6")}">
          <div class="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <h2 class="mt-2 text-xl font-semibold text-liad-text">Faturas</h2>
            </div>
            <button type="button" data-settings-payment-action="toggle-invoices" class="inline-flex min-h-10 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-liad-text transition hover:bg-white/[0.08]">${state.settings.payment.showAllInvoices ? "Mostrar menos" : "Ver todas"}</button>
          </div>
          <div class="overflow-x-auto">
            <table class="min-w-[720px] w-full border-collapse">
              <thead>
                <tr class="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.16em] text-liad-muted">
                  <th class="px-3 py-3 font-medium">Mes de referencia</th>
                  <th class="px-3 py-3 font-medium">Valor</th>
                  <th class="px-3 py-3 font-medium">Status</th>
                  <th class="px-3 py-3 font-medium">Acao</th>
                </tr>
              </thead>
              <tbody>
                ${invoices.map((invoice) => `<tr class="border-b border-white/6 text-sm text-liad-text transition hover:bg-white/[0.03]"><td class="px-3 py-4">${invoice.month}</td><td class="px-3 py-4">${invoice.value}</td><td class="px-3 py-4"><span class="inline-flex rounded-full px-3 py-1 text-xs font-semibold ${getPaymentStatusBadge(invoice.status)}">${invoice.status}</span></td><td class="px-3 py-4"><button type="button" data-settings-payment-action="download-invoice" data-invoice-id="${invoice.id}" class="inline-flex min-h-9 items-center justify-center gap-2 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-liad-text transition hover:bg-white/[0.08]">${getIconMarkup("download")}Baixar PDF</button></td></tr>`).join("")}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  `;
}

function renderDeleteConfirmation() {
  const storeName = state.settings.storeSection.saved.storeName;
  const isMatch = state.settings.deleteInput === storeName;

  return `
    <div data-settings-delete-layer class="absolute inset-0 z-20 flex items-center justify-center p-4 sm:p-6">
      <div data-settings-delete-overlay class="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      <div data-settings-delete-dialog role="dialog" aria-modal="true" aria-labelledby="settings-delete-title" class="relative z-10 w-full max-w-[520px] rounded-[28px] border border-white/10 bg-[rgba(19,19,21,0.98)] p-6 shadow-panel">
        <div class="inline-flex items-center gap-2 rounded-full border border-[#ff8439]/20 bg-[#ff8439]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.16em] text-[#ffd5bd]">${getIconMarkup("alert")}Acao permanente</div>
        <h3 id="settings-delete-title" class="mt-4 font-display text-3xl font-extrabold tracking-[-0.05em] text-liad-text">Excluir conta</h3>
        <p class="mt-4 text-sm leading-7 text-liad-muted">Esta acao e permanente e nao pode ser desfeita. Para confirmar a exclusao da sua conta, digite <strong class="text-liad-text">${escapeHtml(storeName)}</strong> no campo abaixo.</p>
        <div class="mt-5">
          <label class="mb-2 block text-sm font-medium text-liad-text" for="settings-delete-input">Digite o nome da loja</label>
          <input id="settings-delete-input" data-settings-delete-input type="text" placeholder="Digite o nome da loja" value="${escapeHtml(state.settings.deleteInput)}" class="liad-input" />
        </div>
        <div class="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
          <button type="button" data-settings-delete-cancel class="inline-flex min-h-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] px-4 text-sm font-semibold text-liad-text transition hover:bg-white/[0.08]">Cancelar</button>
          <button type="button" data-settings-delete-confirm ${isMatch ? "" : "disabled"} class="inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#ff8439]/35 bg-[#ff8439]/14 px-4 text-sm font-semibold text-[#ffe2d0] transition hover:bg-[#ff8439]/20 disabled:cursor-not-allowed disabled:opacity-40">Confirmar exclusao</button>
        </div>
      </div>
    </div>
  `;
}

function renderSettingsPanel() {
  if (!state.settings.open) {
    return;
  }

  recomputeAllSettingsDirtyState();

  elements.settingsContent.innerHTML = `
    <div class="flex min-h-0 flex-1 flex-col">
      <header class="border-b border-white/10 px-4 py-4 sm:px-6 lg:px-8">
        <div class="flex items-start justify-between gap-4">
          <div class="min-w-0">
            <h2 id="settings-title" class="mt-2 font-display text-[2rem] font-extrabold tracking-[-0.05em] text-liad-text sm:text-[2.25rem]">Configuracoes</h2>
          </div>
          <div class="flex shrink-0 items-center gap-3">
            <span data-settings-pending-count class="hidden rounded-full border border-white/10 bg-white/[0.04] px-3 py-1 text-xs font-semibold text-liad-muted sm:inline-flex"></span>
            <button type="button" data-settings-close aria-label="Fechar configuracoes" class="inline-flex h-11 w-11 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-liad-text transition hover:-translate-y-0.5 hover:bg-white/[0.08]">${getIconMarkup("close")}</button>
          </div>
        </div>
        <div class="mt-5 inline-flex w-full gap-2 overflow-x-auto rounded-[22px] border border-white/10 bg-white/[0.03] p-1.5">
          ${SETTINGS_TABS.map((tab) => `<button type="button" data-settings-tab="${tab.id}" class="inline-flex min-h-11 min-w-[128px] items-center justify-center rounded-[18px] px-4 text-sm font-semibold transition ${tab.id === state.settings.activeTab ? "bg-[linear-gradient(135deg,_rgba(204,151,255,0.18),_rgba(105,156,255,0.1))] text-liad-text shadow-[inset_0_0_0_1px_rgba(204,151,255,0.18)]" : "text-liad-muted hover:bg-white/[0.06] hover:text-liad-text"}">${tab.label}</button>`).join("")}
        </div>
      </header>
      ${state.settings.activeTab === "conta" ? renderAccountSettingsTab() : renderPaymentSettingsTab()}
      ${state.settings.deleteOpen ? renderDeleteConfirmation() : ""}
    </div>
  `;

  syncSettingsHeaderStats();
}

function getFocusableElements(container) {
  return Array.from(
    container.querySelectorAll('button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])')
  ).filter((element) => !element.hasAttribute("hidden"));
}

function getActiveFocusContainer() {
  if (state.settings.open && state.settings.deleteOpen) {
    return elements.settingsContent.querySelector("[data-settings-delete-dialog]");
  }

  if (isModalOpen()) {
    return elements.modalDialog;
  }

  if (state.settings.open) {
    return elements.settingsPanel;
  }

  return null;
}

function trapFocus(event, container) {
  const focusable = getFocusableElements(container);

  if (focusable.length === 0) {
    event.preventDefault();
    container.focus();
    return;
  }

  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  const active = document.activeElement;

  if (event.shiftKey && active === first) {
    event.preventDefault();
    last.focus();
    return;
  }

  if (!event.shiftKey && active === last) {
    event.preventDefault();
    first.focus();
  }
}

function focusInsideSettings(selector) {
  const target = selector ? elements.settingsContent.querySelector(selector) : null;
  const fallback = target ?? getFocusableElements(elements.settingsPanel)[0];
  fallback?.focus();
}

function syncBodyScrollLock() {
  const shouldLock = state.settings.open || isModalOpen();
  document.body.classList.toggle("overflow-hidden", shouldLock);
  document.documentElement.classList.toggle("overflow-hidden", shouldLock);
}

function openSettingsPanel(tab = state.settings.activeTab) {
  if (!state.account) {
    return;
  }

  window.clearTimeout(settingsCloseTimer);
  setStoreMenuOpen(false);
  state.settings.activeTab = tab;
  state.settings.deleteOpen = false;
  state.settings.deleteInput = "";
  state.settings.focusRestore = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  state.settings.open = true;
  renderSettingsPanel();
  elements.settingsRoot.hidden = false;
  syncBodyScrollLock();

  requestAnimationFrame(() => {
    elements.settingsRoot.classList.remove("opacity-0");
    elements.settingsRoot.classList.add("opacity-100");
    elements.settingsPanel.classList.remove("translate-y-6");
    elements.settingsPanel.classList.add("translate-y-0");
    focusInsideSettings("[data-settings-close]");
  });
}

function closeSettingsPanel({ restoreFocus = true, immediate = false } = {}) {
  if (!state.settings.open && elements.settingsRoot.hidden) {
    return;
  }

  state.settings.deleteOpen = false;
  state.settings.deleteInput = "";
  state.settings.open = false;
  elements.settingsRoot.classList.remove("opacity-100");
  elements.settingsRoot.classList.add("opacity-0");
  elements.settingsPanel.classList.remove("translate-y-0");
  elements.settingsPanel.classList.add("translate-y-6");

  const finalize = () => {
    elements.settingsRoot.hidden = true;
    elements.settingsContent.innerHTML = "";
    syncBodyScrollLock();

    if (restoreFocus) {
      state.settings.focusRestore?.focus();
    }

    state.settings.focusRestore = null;
  };

  if (immediate) {
    finalize();
    return;
  }

  settingsCloseTimer = window.setTimeout(finalize, 200);
}

function openDeleteConfirmation() {
  state.settings.deleteOpen = true;
  state.settings.deleteInput = "";
  renderSettingsPanel();
  requestAnimationFrame(() => {
    focusInsideSettings("[data-settings-delete-input]");
  });
}

function closeDeleteConfirmation({ restoreFocus = true } = {}) {
  state.settings.deleteOpen = false;
  state.settings.deleteInput = "";
  renderSettingsPanel();

  if (restoreFocus) {
    requestAnimationFrame(() => {
      focusInsideSettings("[data-settings-delete-open]");
    });
  }
}

function readFileAsDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.addEventListener("load", () => {
      resolve(String(reader.result ?? ""));
    });
    reader.addEventListener("error", () => {
      reject(new Error("Nao foi possivel ler a imagem selecionada."));
    });

    reader.readAsDataURL(file);
  });
}

function loadImageFromDataUrl(dataUrl) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Nao foi possivel processar a imagem selecionada."));
    image.src = dataUrl;
  });
}

async function buildInlineLogoDataUrl(file) {
  const originalDataUrl = await readFileAsDataUrl(file);

  if (file.type === "image/svg+xml" || /\.svg$/i.test(file.name)) {
    return originalDataUrl;
  }

  const image = await loadImageFromDataUrl(originalDataUrl);
  const canvas = document.createElement("canvas");
  const maxDimension = 320;
  const scale = Math.min(1, maxDimension / Math.max(image.width, image.height));

  canvas.width = Math.max(1, Math.round(image.width * scale));
  canvas.height = Math.max(1, Math.round(image.height * scale));

  const context = canvas.getContext("2d");

  if (!context) {
    return originalDataUrl;
  }

  context.drawImage(image, 0, 0, canvas.width, canvas.height);

  if (file.type === "image/png") {
    return canvas.toDataURL("image/png");
  }

  let quality = 0.86;
  let dataUrl = canvas.toDataURL("image/jpeg", quality);

  while (dataUrl.length > 700000 && quality > 0.5) {
    quality -= 0.08;
    dataUrl = canvas.toDataURL("image/jpeg", quality);
  }

  return dataUrl;
}

function applyLogoPreviewState(file, dataUrl) {
  state.settings.logoSection.draftLogoUrl = dataUrl;
  state.settings.logoSection.draftLogoStoragePath = "";
  state.settings.logoSection.draftFileName = file.name;
  state.settings.logoSection.draftIsGenerated = false;
  state.settings.logoSection.pendingFile = file;
  setLogoError("");
  syncSectionDirty("logo");
  renderSettingsPanel();
  requestAnimationFrame(() => {
    focusInsideSettings('[data-settings-submit="logo"]');
  });
}

async function handleLogoSelection(file) {
  if (!file) {
    return;
  }

  const allowedTypes = ["image/jpeg", "image/png", "image/svg+xml"];
  const extensionAllowed = /\.(jpe?g|png|svg)$/i.test(file.name);

  if (!allowedTypes.includes(file.type) && !extensionAllowed) {
    setLogoError("Selecione um arquivo JPG, PNG ou SVG.");
    return;
  }

  if (file.size > 2 * 1024 * 1024) {
    setLogoError("A imagem precisa ter no maximo 2MB.");
    return;
  }

  try {
    const inlineDataUrl = await buildInlineLogoDataUrl(file);

    if (inlineDataUrl.length > 900000) {
      setLogoError("A imagem ainda ficou grande demais para salvar. Use uma imagem menor.");
      return;
    }

    applyLogoPreviewState(file, inlineDataUrl);
  } catch (error) {
    setLogoError(error.message ?? "Nao foi possivel preparar a imagem.");
  }
}

function handleSettingsFieldInput(field) {
  const [sectionName, fieldName] = String(field.dataset.settingsField ?? "").split(".");

  if (!sectionName || !fieldName) {
    return;
  }

  if (sectionName === "account") {
    state.settings.accountSection.draft[fieldName] = field.value;
    clearSettingsFieldError("account", fieldName);
    syncSectionDirty("account");
  }

  if (sectionName === "store") {
    state.settings.storeSection.draft[fieldName] = field.value;
    clearSettingsFieldError("store", fieldName);
    syncSectionDirty("store");
  }

  syncSettingsHeaderStats();
}

async function saveAccountSection() {
  const form = elements.settingsContent.querySelector('[data-settings-form="account"]');
  const submitButton = form?.querySelector('[data-settings-submit="account"]');
  const errors = validateAccountSection();

  clearSettingsErrors("account");
  ["firstName", "lastName", "email"].forEach((fieldName) => {
    setSettingsFieldError("account", fieldName, "");
  });

  if (Object.keys(errors).length > 0) {
    state.settings.accountSection.errors = errors;
    Object.entries(errors).forEach(([fieldName, message]) => {
      setSettingsFieldError("account", fieldName, message);
    });
    return;
  }

  toggleButtonLoading(submitButton, true, "Salvando...");

  try {
    const nextFirstName = normalizeWhitespace(state.settings.accountSection.draft.firstName);
    const nextLastName = normalizeWhitespace(state.settings.accountSection.draft.lastName);
    const persisted = await updateAccountOwnerProfile(state.currentUser, {
      accountId: state.accountId,
      ownerFirstName: nextFirstName,
      ownerLastName: nextLastName
    });

    state.settings.accountSection.saved = {
      firstName: persisted.ownerFirstName,
      lastName: persisted.ownerLastName,
      email: state.settings.accountSection.saved.email
    };
    state.settings.accountSection.draft = {
      firstName: persisted.ownerFirstName,
      lastName: persisted.ownerLastName,
      email: state.settings.accountSection.draft.email
    };
    state.account.ownerFirstName = persisted.ownerFirstName;
    state.account.ownerLastName = persisted.ownerLastName;
    syncSectionDirty("account");
    renderSettingsPanel();
    showToast("Dados da conta salvos com sucesso.");
  } catch (error) {
    showToast(error.message ?? "Nao foi possivel salvar os dados da conta.", "danger");
  } finally {
    toggleButtonLoading(submitButton, false, "Salvar alteracoes");
  }
}

async function saveStoreSection() {
  const form = elements.settingsContent.querySelector('[data-settings-form="store"]');
  const submitButton = form?.querySelector('[data-settings-submit="store"]');
  const errors = validateStoreSection();

  clearSettingsErrors("store");
  setSettingsFieldError("store", "storeName", "");
  setSettingsFieldError("store", "monthlyCustomersRange", "");

  if (Object.keys(errors).length > 0) {
    state.settings.storeSection.errors = errors;
    Object.entries(errors).forEach(([fieldName, message]) => {
      setSettingsFieldError("store", fieldName, message);
    });
    return;
  }

  toggleButtonLoading(submitButton, true, "Salvando...");

  try {
    const nextStoreName = normalizeWhitespace(state.settings.storeSection.draft.storeName);
    const nextRange = state.settings.storeSection.draft.monthlyCustomersRange;
    const persisted = await updateStoreProfile(state.currentUser, {
      accountId: state.accountId,
      storeName: nextStoreName,
      monthlyVisitsRange: nextRange
    });

    state.settings.storeSection.saved = {
      ...state.settings.storeSection.saved,
      storeName: persisted.storeName,
      monthlyCustomersRange: persisted.monthlyVisitsRange
    };
    state.settings.storeSection.draft = {
      ...state.settings.storeSection.draft,
      storeName: persisted.storeName,
      monthlyCustomersRange: persisted.monthlyVisitsRange
    };

    if (state.settings.logoSection.savedIsGenerated) {
      state.settings.logoSection.savedLogoUrl = buildGeneratedLogo(persisted.storeName);
      state.settings.logoSection.savedFileName = "logo-gerada.svg";
    }

    if (state.settings.logoSection.draftIsGenerated) {
      state.settings.logoSection.draftLogoUrl = buildGeneratedLogo(persisted.storeName);
      state.settings.logoSection.draftFileName = "logo-gerada.svg";
    }

    state.account.storeName = persisted.storeName;
    state.account.monthlyVisitsRange = persisted.monthlyVisitsRange;
    renderAccount(state.account);
    syncSectionDirty("store");
    syncSectionDirty("logo");
    renderSettingsPanel();
    showToast("Dados da loja atualizados com sucesso.");
  } catch (error) {
    showToast(error.message ?? "Nao foi possivel salvar os dados da loja.", "danger");
  } finally {
    toggleButtonLoading(submitButton, false, "Salvar alteracoes");
  }
}

async function saveLogoSection() {
  const form = elements.settingsContent.querySelector('[data-settings-form="logo"]');
  const submitButton = form?.querySelector('[data-settings-submit="logo"]');

  if (state.settings.logoSection.error) {
    return;
  }

  toggleButtonLoading(submitButton, true, "Salvando...");

  try {
    const persisted = await saveStoreLogo(state.currentUser, {
      accountId: state.accountId,
      file: state.settings.logoSection.pendingFile,
      inlineDataUrl: state.settings.logoSection.draftIsGenerated
        ? ""
        : state.settings.logoSection.draftLogoUrl,
      previousLogoStoragePath: state.settings.logoSection.savedIsGenerated
        ? ""
        : state.settings.logoSection.savedLogoStoragePath
    });
    const fallbackLogoUrl = buildGeneratedLogo(state.settings.storeSection.saved.storeName);

    state.settings.logoSection.savedLogoUrl = persisted.hasCustomLogo ? persisted.logoUrl : fallbackLogoUrl;
    state.settings.logoSection.draftLogoUrl = persisted.hasCustomLogo ? persisted.logoUrl : fallbackLogoUrl;
    state.settings.logoSection.savedLogoStoragePath = persisted.logoStoragePath;
    state.settings.logoSection.draftLogoStoragePath = persisted.logoStoragePath;
    state.settings.logoSection.savedFileName = persisted.hasCustomLogo ? state.settings.logoSection.draftFileName : "logo-gerada.svg";
    state.settings.logoSection.draftFileName = persisted.hasCustomLogo ? state.settings.logoSection.draftFileName : "logo-gerada.svg";
    state.settings.logoSection.savedIsGenerated = !persisted.hasCustomLogo;
    state.settings.logoSection.draftIsGenerated = !persisted.hasCustomLogo;
    state.settings.logoSection.pendingFile = null;
    state.account.logoUrl = persisted.logoUrl;
    state.account.logoStoragePath = persisted.logoStoragePath;
    state.account.hasCustomLogo = persisted.hasCustomLogo;
    renderAccount(state.account);
    syncSectionDirty("logo");
    renderSettingsPanel();
    showToast(persisted.hasCustomLogo ? "Logo salva com sucesso." : "Logo removida com sucesso.", persisted.hasCustomLogo ? "success" : "warning");
  } catch (error) {
    setLogoError(error.message ?? "Nao foi possivel salvar a logo.");
    showToast(error.message ?? "Nao foi possivel salvar a logo.", "danger");
  } finally {
    toggleButtonLoading(submitButton, false, "Salvar logo");
  }
}

async function confirmAccountDeletion() {
  const button = elements.settingsContent.querySelector("[data-settings-delete-confirm]");
  toggleButtonLoading(button, true, "Confirmando...");

  try {
    await wait(320);
    closeDeleteConfirmation({ restoreFocus: false });
    closeSettingsPanel({ restoreFocus: false });
    showToast("Exclusao confirmada em modo demonstracao. Nenhum dado foi removido nesta entrega.", "danger");
  } finally {
    toggleButtonLoading(button, false, "Confirmar exclusao");
  }
}

function handlePaymentAction(action, invoiceId = "") {
  if (action === "upgrade") {
    showToast("Fluxo de upgrade aberto em modo demonstracao.");
    return;
  }

  if (action === "payment-method") {
    showToast("Atualizacao do metodo de pagamento disponivel na integracao real.");
    return;
  }

  if (action === "download-invoice") {
    showToast(`Download da fatura ${invoiceId} iniciado em modo mock.`);
    return;
  }

  if (action === "toggle-invoices") {
    state.settings.payment.showAllInvoices = !state.settings.payment.showAllInvoices;
    renderSettingsPanel();
    requestAnimationFrame(() => {
      focusInsideSettings('[data-settings-payment-action="toggle-invoices"]');
    });
  }
}

function renderCurrentView() {
  renderChrome();

  if (state.currentRoute !== "/api") {
    state.apiKey.justGenerated = false;
  }

  elements.viewRoot.innerHTML =
    state.currentRoute === "/dashboard"
      ? renderDashboardView()
      : state.currentRoute === "/metricas"
        ? renderMetricsView()
        : renderApiView();

  bindViewInteractions();
  bindChartTooltips();
}

function bindChartTooltips() {
  elements.viewRoot.querySelectorAll("[data-chart-wrap]").forEach((wrap) => {
    const tooltip = wrap.querySelector("[data-tooltip]");
    const svg = wrap.querySelector("svg");
    const width = Number(wrap.dataset.width);
    const height = Number(wrap.dataset.height);

    wrap.querySelectorAll(".liad-chart-target").forEach((target) => {
      const showTooltip = () => {
        const rect = svg.getBoundingClientRect();
        tooltip.innerHTML = `<strong class="block text-liad-text">${target.dataset.label}</strong><span class="mt-1 block text-liad-muted">${target.dataset.value}</span>`;
        tooltip.style.left = `${(Number(target.dataset.x) / width) * rect.width}px`;
        tooltip.style.top = `${(Number(target.dataset.y) / height) * rect.height}px`;
        tooltip.classList.remove("invisible", "opacity-0");
        tooltip.classList.add("visible", "opacity-100");
      };

      const hideTooltip = () => {
        tooltip.classList.remove("visible", "opacity-100");
        tooltip.classList.add("invisible", "opacity-0");
      };

      target.addEventListener("mouseenter", showTooltip);
      target.addEventListener("focus", showTooltip);
      target.addEventListener("mouseleave", hideTooltip);
      target.addEventListener("blur", hideTooltip);
    });
  });
}

function bindViewInteractions() {
  elements.viewRoot.querySelectorAll("[data-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      state.metricsFilter = button.dataset.filter;
      state.metricsPage = 1;
      renderCurrentView();
    });
  });

  elements.viewRoot.querySelectorAll("[data-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const maxPage = Math.ceil(RECENT_CONVERSATIONS.length / 10);
      state.metricsPage =
        button.dataset.page === "prev"
          ? Math.max(1, state.metricsPage - 1)
          : Math.min(maxPage, state.metricsPage + 1);
      renderCurrentView();
    });
  });

  elements.viewRoot.querySelectorAll("[data-platform]").forEach((button) => {
    button.addEventListener("click", () => {
      state.snippetPlatform = button.dataset.platform;
      renderCurrentView();
    });
  });

  elements.viewRoot.querySelectorAll("[data-api-action]").forEach((button) => {
    button.addEventListener("click", () => handleApiAction(button.dataset.apiAction));
  });
}

function openModal({ eyebrow, title, body, confirmLabel, tone = "primary", onConfirm }) {
  state.modalAction = onConfirm;
  state.modalReturnFocus = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  elements.modalEyebrow.textContent = eyebrow;
  elements.modalTitle.textContent = title;
  elements.modalBody.textContent = body;
  elements.modalConfirm.textContent = confirmLabel;
  elements.modalConfirm.className =
    tone === "danger"
      ? "inline-flex min-h-11 items-center justify-center rounded-2xl border border-[#ff8439]/30 bg-[#ff8439]/10 px-4 text-sm font-semibold text-[#ffe2d0] transition hover:bg-[#ff8439]/15"
      : "inline-flex min-h-11 items-center justify-center rounded-2xl bg-gradient-to-r from-liad-violet to-liad-purple px-4 text-sm font-semibold text-black transition hover:-translate-y-0.5";
  elements.modalRoot.classList.remove("hidden");
  elements.modalRoot.classList.add("grid");
  syncBodyScrollLock();
  requestAnimationFrame(() => {
    elements.modalConfirm.focus();
  });
}

function closeModal({ restoreFocus = true } = {}) {
  state.modalAction = null;
  elements.modalRoot.classList.add("hidden");
  elements.modalRoot.classList.remove("grid");
  syncBodyScrollLock();

  if (restoreFocus) {
    state.modalReturnFocus?.focus();
  }

  state.modalReturnFocus = null;
}

function setStoreMenuOpen(isOpen) {
  elements.storeMenu.hidden = !isOpen;
  elements.storeMenuTrigger.setAttribute("aria-expanded", String(isOpen));
}

function setMobileOpen(isOpen) {
  state.mobileOpen = isOpen;
  renderChrome();
}

function toggleSidebar() {
  if (isMobile()) {
    setMobileOpen(!state.mobileOpen);
    return;
  }

  state.sidebarCollapsed = !state.sidebarCollapsed;
  renderChrome();
}

function navigateTo(route, options = {}) {
  const target = normalizeRoute(route);

  if (target === state.currentRoute && !options.force) {
    state.mobileOpen = false;
    renderChrome();
    return;
  }

  closeSettingsPanel({ restoreFocus: false, immediate: true });
  clearBanner();
  setStoreMenuOpen(false);
  elements.viewRoot.classList.add("opacity-0", "translate-y-2");

  window.setTimeout(() => {
    if (!options.fromPopState) {
      window.history.pushState({}, "", target);
    }
    state.currentRoute = target;
    state.mobileOpen = false;
    renderCurrentView();
    requestAnimationFrame(() => {
      elements.viewRoot.classList.remove("opacity-0", "translate-y-2");
    });
  }, 160);
}

function generateApiKey() {
  const seed = Math.random().toString(36).slice(2, 12) + Date.now().toString(36).slice(-8);
  state.apiKey.exists = true;
  state.apiKey.value = `sk-liad-${seed}`;
  state.apiKey.revealed = true;
  state.apiKey.justGenerated = true;
  renderCurrentView();
  setBanner("Nova API Key gerada. Salve a chave exibida antes de seguir.", "warning");
}

function deleteApiKey() {
  state.apiKey.exists = false;
  state.apiKey.revealed = false;
  state.apiKey.justGenerated = false;
  renderCurrentView();
  setBanner("API Key excluida. A integracao da loja fica desativada ate uma nova geracao.", "warning");
}

function toggleApiKeyVisibility() {
  state.apiKey.revealed = !state.apiKey.revealed;
  if (!state.apiKey.revealed) {
    state.apiKey.justGenerated = false;
  }
  renderCurrentView();
}

async function copyText(text, successMessage) {
  try {
    await navigator.clipboard.writeText(text);
    setBanner(successMessage, "success");
  } catch (error) {
    const helper = document.createElement("textarea");
    helper.value = text;
    helper.setAttribute("readonly", "");
    helper.style.position = "absolute";
    helper.style.left = "-9999px";
    document.body.appendChild(helper);
    helper.select();
    const copied = document.execCommand("copy");
    helper.remove();

    if (copied) {
      setBanner(successMessage, "success");
      return;
    }

    setBanner("Nao foi possivel copiar. Tente novamente.");
  }
}

function handleApiAction(action) {
  if (action === "copy-key" && state.apiKey.exists) {
    copyText(state.apiKey.value, "API Key copiada com sucesso.");
    return;
  }

  if (action === "toggle-key" && state.apiKey.exists) {
    toggleApiKeyVisibility();
    return;
  }

  if (action === "copy-snippet") {
    const snippet = SNIPPETS[state.snippetPlatform];
    const key = state.apiKey.exists ? state.apiKey.value : "sk-liad-sua-chave-aqui";
    copyText(snippet.code(key), `Snippet de ${snippet.label} copiado.`);
    return;
  }

  if (action === "generate" || action === "generate-empty") {
    openModal({
      eyebrow: "Nova chave",
      title: "Gerar uma nova API Key?",
      body:
        action === "generate"
          ? "Gerar uma nova chave invalidara a chave atual. Deseja continuar?"
          : "Uma nova API Key sera criada para ativar a integracao da LIAD. Deseja continuar?",
      confirmLabel: "Confirmar",
      onConfirm: generateApiKey
    });
    return;
  }

  if (action === "delete") {
    openModal({
      eyebrow: "Acao destrutiva",
      title: "Excluir API Key?",
      body: "Excluir a chave atual desativara a integracao da LIAD na sua loja ate que uma nova chave seja gerada.",
      confirmLabel: "Excluir chave",
      tone: "danger",
      onConfirm: deleteApiKey
    });
  }
}

async function handleLogout() {
  const logoutButton = document.querySelector("[data-logout]");
  toggleButtonLoading(logoutButton, true, "Saindo...");

  try {
    const { auth } = await getFirebaseServices();
    await signOut(auth);
    redirectToLogin();
  } catch (error) {
    setBanner("Nao foi possivel encerrar a sessao. Tente novamente.");
  } finally {
    toggleButtonLoading(logoutButton, false, "Desconectar");
  }
}

function bindShellEvents() {
  document.addEventListener("click", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const target = event.target;
    const navLink = target.closest("[data-nav-link][data-route]");
    const settingsTab = target.closest("[data-settings-tab]");
    const paymentActionButton = target.closest("[data-settings-payment-action]");

    if (navLink) {
      event.preventDefault();
      navigateTo(navLink.getAttribute("href"));
      return;
    }

    if (target.closest("[data-sidebar-toggle]")) {
      toggleSidebar();
      return;
    }

    if (target.closest("[data-mobile-overlay]")) {
      setMobileOpen(false);
      return;
    }

    if (target.closest("[data-store-menu-trigger]")) {
      setStoreMenuOpen(elements.storeMenu.hidden);
      return;
    }

    if (target.closest("[data-store-settings]")) {
      openSettingsPanel("conta");
      return;
    }

    if (target.closest("[data-logout]")) {
      handleLogout();
      return;
    }

    if (target.closest("[data-settings-overlay]") || target.closest("[data-settings-close]")) {
      closeSettingsPanel();
      return;
    }

    if (settingsTab) {
      state.settings.activeTab = settingsTab.dataset.settingsTab;
      renderSettingsPanel();
      requestAnimationFrame(() => {
        focusInsideSettings(`[data-settings-tab="${state.settings.activeTab}"]`);
      });
      return;
    }

    if (target.closest("[data-settings-delete-open]")) {
      openDeleteConfirmation();
      return;
    }

    if (target.closest("[data-settings-delete-overlay]") || target.closest("[data-settings-delete-cancel]")) {
      closeDeleteConfirmation();
      return;
    }

    if (target.closest("[data-settings-delete-confirm]")) {
      confirmAccountDeletion();
      return;
    }

    if (target.closest("[data-settings-logo-remove]")) {
      state.settings.logoSection.draftLogoUrl = buildGeneratedLogo(state.settings.storeSection.saved.storeName);
      state.settings.logoSection.draftLogoStoragePath = "";
      state.settings.logoSection.draftFileName = "logo-gerada.svg";
      state.settings.logoSection.draftIsGenerated = true;
      state.settings.logoSection.pendingFile = null;
      setLogoError("");
      syncSectionDirty("logo");
      renderSettingsPanel();
      requestAnimationFrame(() => {
        focusInsideSettings('[data-settings-submit="logo"]');
      });
      return;
    }

    if (paymentActionButton) {
      handlePaymentAction(paymentActionButton.dataset.settingsPaymentAction, paymentActionButton.dataset.invoiceId);
      return;
    }

    if (target.closest("[data-modal-close]") || target.closest("[data-modal-cancel]")) {
      closeModal();
      return;
    }

    if (target.closest("[data-modal-confirm]")) {
      const action = state.modalAction;
      closeModal({ restoreFocus: false });
      action?.();
      return;
    }

    if (!target.closest("[data-store-menu-trigger]") && !target.closest("[data-store-menu]")) {
      setStoreMenuOpen(false);
    }
  });

  document.addEventListener("submit", (event) => {
    const form = event.target instanceof HTMLFormElement ? event.target : null;

    if (!form?.dataset.settingsForm) {
      return;
    }

    event.preventDefault();

    if (form.dataset.settingsForm === "account") {
      saveAccountSection();
      return;
    }

    if (form.dataset.settingsForm === "store") {
      saveStoreSection();
      return;
    }

    if (form.dataset.settingsForm === "logo") {
      saveLogoSection();
    }
  });

  document.addEventListener("input", (event) => {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }

    if (event.target.matches("[data-settings-field]")) {
      handleSettingsFieldInput(event.target);
      return;
    }

    if (event.target.matches("[data-settings-delete-input]")) {
      state.settings.deleteInput = event.target.value;
      const confirmButton = elements.settingsContent.querySelector("[data-settings-delete-confirm]");

      if (confirmButton) {
        confirmButton.disabled = state.settings.deleteInput !== state.settings.storeSection.saved.storeName;
      }
    }
  });

  document.addEventListener("change", (event) => {
    if (!(event.target instanceof HTMLElement)) {
      return;
    }

    if (event.target.matches("[data-settings-field]")) {
      handleSettingsFieldInput(event.target);
      return;
    }

    if (event.target instanceof HTMLInputElement && event.target.matches("[data-settings-logo-input]")) {
      handleLogoSelection(event.target.files?.[0]);
      event.target.value = "";
    }
  });

  document.addEventListener("dragover", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const dropzone = event.target.closest("[data-logo-dropzone]");

    if (!dropzone) {
      return;
    }

    event.preventDefault();
    dropzone.classList.add("border-liad-purple/30", "bg-white/[0.04]");
  });

  document.addEventListener("dragleave", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const dropzone = event.target.closest("[data-logo-dropzone]");

    if (!dropzone) {
      return;
    }

    dropzone.classList.remove("border-liad-purple/30", "bg-white/[0.04]");
  });

  document.addEventListener("drop", (event) => {
    if (!(event.target instanceof Element)) {
      return;
    }

    const dropzone = event.target.closest("[data-logo-dropzone]");

    if (!dropzone) {
      return;
    }

    event.preventDefault();
    dropzone.classList.remove("border-liad-purple/30", "bg-white/[0.04]");
    handleLogoSelection(event.dataTransfer?.files?.[0]);
  });

  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") {
      if (state.settings.deleteOpen) {
        event.preventDefault();
        closeDeleteConfirmation();
        return;
      }

      if (isModalOpen()) {
        event.preventDefault();
        closeModal();
        return;
      }

      if (state.settings.open) {
        event.preventDefault();
        closeSettingsPanel();
      }

      return;
    }

    if (event.key !== "Tab") {
      return;
    }

    const activeContainer = getActiveFocusContainer();

    if (activeContainer) {
      trapFocus(event, activeContainer);
    }
  });

  window.addEventListener("popstate", () => {
    closeSettingsPanel({ restoreFocus: false, immediate: true });
    state.currentRoute = normalizeRoute(window.location.pathname);
    state.mobileOpen = false;
    renderCurrentView();
  });

  window.addEventListener("resize", () => {
    if (!isMobile()) {
      state.mobileOpen = false;
    }
    renderChrome();
  });
}

async function init() {
  const user = await requireAuthenticated();
  const context = await getCurrentAccountContext(user);

  if (!context?.account) {
    redirectToCompleteProfile();
    return;
  }

  state.currentUser = user;
  state.accountId = context.accountId;
  state.account = context.account;
  state.settings = createSettingsStateFromAccount(context.account);
  renderAccount(context.account);
  renderCurrentView();
  bindShellEvents();
}

init().catch((error) => {
  console.error(error);
  setBanner(error.message ?? "Nao foi possivel carregar o dashboard.");
});
