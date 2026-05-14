// ============================================================
// products-view.js
// Importe este arquivo no dashboard.js e chame renderProductsView()
// ============================================================
 
import {
  deleteProductsCsvUpload,
  formatFileSize,
  formatUploadDate,
  listProductsCsvUploads,
  uploadProductsCsv,
  updateProductsCsvStatus
} from "./products-csv.js";
 
// Formatos aceitos
const ACCEPTED_EXTENSIONS = [".csv", ".tsv", ".xlsx", ".xls", ".json"];
const ACCEPTED_MIME_TYPES = [
  "text/csv",
  "text/tab-separated-values",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  "application/vnd.ms-excel",
  "application/json"
];
const ACCEPTED_ACCEPT_ATTR =
  ".csv,.tsv,.xlsx,.xls,.json,text/csv,text/tab-separated-values,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-excel,application/json";
 
// Estado local da view de produtos
const productsState = {
  uploads: [],
  loading: false,
  uploading: false,
  uploadProgress: 0,
  error: "",
  deleteTarget: null // { docId, storagePath, fileName }
};
 
// Referência ao container da view (injetado pelo dashboard)
let viewContainer = null;
let accountId = "";
let onDeleteConfirm = null; // callback para o modal do dashboard
 
// ------------------------------------------------------------------
// Inicialização pública — chamada pelo dashboard ao montar a view
// ------------------------------------------------------------------
export async function initProductsView(container, ctxAccountId, modalCallback) {
  viewContainer = container;
  accountId = ctxAccountId;
  onDeleteConfirm = modalCallback;
  productsState.error = "";
  productsState.deleteTarget = null;
  await loadUploads();
}
 
async function loadUploads() {
  productsState.loading = true;
  render();
 
  try {
    productsState.uploads = await listProductsCsvUploads(accountId);
    productsState.error = "";
  } catch (error) {
    productsState.error = error.message ?? "Nao foi possivel carregar os arquivos.";
  } finally {
    productsState.loading = false;
    render();
    bindEvents();
  }
}
 
// ------------------------------------------------------------------
// Upload
// ------------------------------------------------------------------
async function handleFileSelected(file) {
  if (!file) return;

  const extOk = ACCEPTED_EXTENSIONS.some((ext) =>
    file.name.toLowerCase().endsWith(ext)
  );

  const mimeOk = ACCEPTED_MIME_TYPES.includes(file.type);

  if (!extOk && !mimeOk) {
    setError(
      "Formato nao suportado. Envie um arquivo .csv, .tsv, .xlsx, .xls ou .json."
    );
    return;
  }

  if (file.size > 10 * 1024 * 1024) {
    setError("O arquivo nao pode ultrapassar 10 MB.");
    return;
  }

  setError("");

  productsState.uploading = true;
  productsState.uploadProgress = 0;

  render();
  bindEvents();

  try {
    const result = await uploadProductsCsv(
      accountId,
      file,
      (pct) => {
        productsState.uploadProgress = pct;
        updateProgressBar(pct);
      }
    );

    try {
      const extension =
        file.name.split(".").pop()?.toLowerCase() ?? "";

      if (["csv", "tsv"].includes(extension)) {
        const text = await file.text();

        if (!text || text.trim().length === 0) {
          throw new Error("Arquivo vazio.");
        }

        const lines = text
          .split("\n")
          .filter((line) => line.trim().length > 0);

        if (lines.length < 2) {
          throw new Error(
            "O arquivo precisa possuir cabecalho e pelo menos uma linha."
          );
        }
      } else if (extension === "json") {
        const text = await file.text();

        JSON.parse(text);
      } else if (["xlsx", "xls"].includes(extension)) {
        if (file.size <= 0) {
          throw new Error("Planilha invalida.");
        }
      }

      await updateProductsCsvStatus(
        accountId,
        result.docId,
        "processed"
      );

    } catch (processingError) {

      await updateProductsCsvStatus(
        accountId,
        result.docId,
        "error",
        {
          errorMessage:
            processingError.message ??
            "Erro ao processar arquivo."
        }
      );
    }

    productsState.uploads =
      await listProductsCsvUploads(accountId);

  } catch (error) {

    setError(
      error.message ??
      "Nao foi possivel enviar o arquivo."
    );

  } finally {

    productsState.uploading = false;
    productsState.uploadProgress = 0;

    render();
    bindEvents();
  }
}
 
async function handleDelete(docId, storagePath, fileName) {
  if (!onDeleteConfirm) return;
 
  onDeleteConfirm({
    eyebrow: "Remover arquivo",
    title: "Excluir este arquivo?",
    body: `O arquivo "${fileName}" sera removido permanentemente do Storage e do Firestore.`,
    confirmLabel: "Excluir arquivo",
    tone: "danger",
    onConfirm: async () => {
      try {
        await deleteProductsCsvUpload(accountId, docId, storagePath);
        productsState.uploads = await listProductsCsvUploads(accountId);
      } catch (error) {
        setError(error.message ?? "Nao foi possivel excluir o arquivo.");
      }
      render();
      bindEvents();
    }
  });
}
 
// ------------------------------------------------------------------
// Helpers
// ------------------------------------------------------------------
function setError(message) {
  productsState.error = message;
  const el = viewContainer?.querySelector("[data-products-error]");
  if (el) el.textContent = message;
}
 
function updateProgressBar(pct) {
  const bar = viewContainer?.querySelector("[data-upload-progress-bar]");
  const label = viewContainer?.querySelector("[data-upload-progress-label]");
  if (bar) bar.style.width = `${pct}%`;
  if (label) label.textContent = `${pct}%`;
}
 
function escHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
 
function cardClass(extra = "") {
  return `overflow-hidden rounded-[28px] border border-white/10 bg-[rgba(19,19,21,0.88)] shadow-panel ${extra}`.trim();
}
 
function getFileIcon(fileName) {
  const ext = fileName?.split(".").pop()?.toLowerCase() ?? "";
  if (["xlsx", "xls"].includes(ext)) return "table";
  if (ext === "json") return "json";
  return "csv"; // csv, tsv e fallback
}
 
function getIconMarkup(icon) {
  const base = 'class="h-5 w-5 stroke-current" fill="none" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"';
  const icons = {
    upload: `<svg viewBox="0 0 24 24" ${base}><path d="M12 16V4"></path><path d="m7 9 5-5 5 5"></path><path d="M5 20h14"></path></svg>`,
    csv: `<svg viewBox="0 0 24 24" ${base}><path d="M3 9h18"></path><path d="M3 15h18"></path><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M8 4v16"></path></svg>`,
    table: `<svg viewBox="0 0 24 24" ${base}><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M2 9h20"></path><path d="M2 15h20"></path><path d="M8 4v16"></path><path d="M16 4v16"></path></svg>`,
    json: `<svg viewBox="0 0 24 24" ${base}><path d="M8 3H7a2 2 0 0 0-2 2v5a2 2 0 0 1-2 2 2 2 0 0 1 2 2v5a2 2 0 0 0 2 2h1"></path><path d="M16 21h1a2 2 0 0 0 2-2v-5a2 2 0 0 1 2-2 2 2 0 0 1-2-2V5a2 2 0 0 0-2-2h-1"></path></svg>`,
    trash: `<svg viewBox="0 0 24 24" ${base}><path d="M3 6h18"></path><path d="M8 6V4h8v2"></path><path d="M19 6l-1 14H6L5 6"></path><path d="M10 11v6"></path><path d="M14 11v6"></path></svg>`,
    download: `<svg viewBox="0 0 24 24" ${base}><path d="M12 3v12"></path><path d="m7 10 5 5 5-5"></path><path d="M5 21h14"></path></svg>`,
    spinner: `<svg viewBox="0 0 24 24" ${base} class="h-5 w-5 animate-spin stroke-current"><circle cx="12" cy="12" r="10" stroke-opacity="0.25"></circle><path d="M12 2a10 10 0 0 1 10 10" stroke-opacity="1"></path></svg>`,
    empty: `<svg viewBox="0 0 24 24" ${base}><rect x="2" y="4" width="20" height="16" rx="2"></rect><path d="M8 4v16"></path><path d="M3 9h18"></path><path d="M3 15h18"></path><path d="M11 12h2"></path></svg>`
  };
  return icons[icon] ?? "";
}
 
// ------------------------------------------------------------------
// Render
// ------------------------------------------------------------------
function render() {
  if (!viewContainer) return;
  viewContainer.innerHTML = buildHtml();
}
 
function buildHtml() {
  return `
    <div class="mb-5 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
      <div>
        <h1 class="font-display text-[2.35rem] font-extrabold tracking-[-0.06em] text-liad-text sm:text-[2.8rem]">Produtos</h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-liad-muted">
          Envie arquivos com o catalogo da sua loja. A IA usa esses dados para responder perguntas sobre produtos, precos e disponibilidade.
        </p>
      </div>
    </div>
 
    ${buildUploadCard()}
    ${buildListCard()}
  `;
}
 
function buildUploadCard() {
  return `
    <section class="${cardClass("p-5 sm:p-6 mb-4")}">
      <div class="mb-4">
        <p class="text-[11px] uppercase tracking-[0.2em] text-liad-muted">Importacao</p>
        <h2 class="mt-2 text-lg font-semibold text-liad-text">Enviar catalogo de produtos</h2>
        <p class="mt-1 text-sm leading-6 text-liad-muted">Formatos aceitos: <strong class="text-liad-text">.csv · .tsv · .xlsx · .xls · .json</strong> — tamanho maximo 10 MB. Arquivos tabulares devem conter cabecalho na primeira linha.</p>
      </div>
 
      ${productsState.uploading ? buildProgressState() : buildDropzone()}
 
      <p data-products-error class="mt-3 text-sm text-[#ffb49e]">${escHtml(productsState.error)}</p>
    </section>
  `;
}
 
function buildDropzone() {
  return `
    <label
      data-csv-dropzone
      class="group flex min-h-[200px] cursor-pointer flex-col items-center justify-center rounded-[24px] border border-dashed border-white/12 bg-white/[0.025] px-6 py-10 text-center transition hover:border-liad-purple/30 hover:bg-white/[0.04]"
    >
      <input
        data-csv-input
        type="file"
        accept="${ACCEPTED_ACCEPT_ATTR}"
        class="hidden"
      />
      <span class="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.05] text-liad-purple transition group-hover:-translate-y-0.5">
        ${getIconMarkup("upload")}
      </span>
      <span class="mt-4 text-base font-semibold text-liad-text">Arraste um arquivo ou clique para selecionar</span>
      <span class="mt-2 text-sm leading-6 text-liad-muted">.csv · .tsv · .xlsx · .xls · .json — maximo 10 MB</span>
    </label>
  `;
}
 
function buildProgressState() {
  const pct = productsState.uploadProgress;
  return `
    <div class="flex min-h-[200px] flex-col items-center justify-center rounded-[24px] border border-liad-purple/20 bg-[linear-gradient(135deg,_rgba(204,151,255,0.06),_rgba(105,156,255,0.04))] px-6 py-10">
      <span class="inline-flex h-14 w-14 items-center justify-center rounded-2xl border border-liad-purple/20 bg-liad-purple/10 text-liad-purple">
        ${getIconMarkup("spinner")}
      </span>
      <p class="mt-5 text-base font-semibold text-liad-text">Enviando arquivo...</p>
      <div class="mt-4 w-full max-w-xs">
        <div class="flex items-center justify-between mb-1.5 text-xs text-liad-muted">
          <span>Progresso</span>
          <span data-upload-progress-label>${pct}%</span>
        </div>
        <div class="h-2 w-full rounded-full bg-white/10">
          <div
            data-upload-progress-bar
            class="h-2 rounded-full bg-gradient-to-r from-liad-violet to-liad-blue transition-all duration-200"
            style="width:${pct}%"
          ></div>
        </div>
      </div>
    </div>
  `;
}
 
function buildListCard() {
  return `
    <section class="${cardClass("p-5 sm:p-6")}">
      <div class="mb-4 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p class="text-[11px] uppercase tracking-[0.2em] text-liad-muted">Historico</p>
          <h2 class="mt-2 text-lg font-semibold text-liad-text">Arquivos enviados</h2>
        </div>
        ${productsState.loading ? `<span class="text-sm text-liad-muted inline-flex items-center gap-2">${getIconMarkup("spinner")} Carregando...</span>` : ""}
      </div>
 
      ${buildListContent()}
    </section>
  `;
}
 
function buildListContent() {
  if (productsState.loading) {
    return `
      <div class="flex min-h-[160px] items-center justify-center text-liad-muted text-sm">
        Buscando arquivos...
      </div>
    `;
  }
 
  if (productsState.uploads.length === 0) {
    return `
      <div class="flex min-h-[160px] flex-col items-center justify-center gap-3 text-center">
        <span class="inline-flex h-12 w-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04] text-liad-muted">
          ${getIconMarkup("empty")}
        </span>
        <p class="text-sm font-medium text-liad-text">Nenhum arquivo enviado ainda</p>
        <p class="text-sm text-liad-muted">Os arquivos enviados aparecem aqui para consulta e gerenciamento.</p>
      </div>
    `;
  }
 
  return `
    <div class="overflow-x-auto">
      <table class="min-w-[640px] w-full border-collapse">
        <thead>
          <tr class="border-b border-white/10 text-left text-[11px] uppercase tracking-[0.16em] text-liad-muted">
            <th class="px-3 py-3 font-medium">Arquivo</th>
            <th class="px-3 py-3 font-medium">Tamanho</th>
            <th class="px-3 py-3 font-medium">Enviado em</th>
            <th class="px-3 py-3 font-medium">Status</th>
            <th class="px-3 py-3 font-medium">Acoes</th>
          </tr>
        </thead>
        <tbody>
          ${productsState.uploads.map((upload) => buildUploadRow(upload)).join("")}
        </tbody>
      </table>
    </div>
  `;
}
 
function buildUploadRow(upload) {
  const status = upload.status ?? "pending";
  const statusBadge = {
    pending: "bg-[#ffbd59]/12 text-[#ffe4ae]",
    processed: "bg-emerald-400/12 text-emerald-300",
    error: "bg-red-500/12 text-red-300"
  }[status] ?? "bg-white/10 text-liad-muted";
 
  const statusLabel = {
    pending: "Aguardando IA",
    processed: "Processado",
    error: "Erro"
  }[status] ?? status;
 
  const fileIcon = getFileIcon(upload.fileName);
 
  return `
    <tr class="border-b border-white/6 text-sm text-liad-text transition hover:bg-white/[0.03]">
      <td class="px-3 py-4">
        <span class="flex items-center gap-2.5">
          <span class="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/[0.04] text-liad-purple">
            ${getIconMarkup(fileIcon)}
          </span>
          <span class="truncate max-w-[220px] font-medium" title="${escHtml(upload.fileName)}">${escHtml(upload.fileName)}</span>
        </span>
      </td>
      <td class="px-3 py-4 text-liad-muted">${formatFileSize(upload.fileSize)}</td>
      <td class="px-3 py-4 text-liad-muted">${formatUploadDate(upload.uploadedAt)}</td>
      <td class="px-3 py-4">
        <span class="inline-flex rounded-full px-3 py-1 text-xs font-semibold ${statusBadge}">${statusLabel}</span>
      </td>
      <td class="px-3 py-4">
        <div class="flex items-center gap-2">
          ${upload.downloadUrl ? `
            <a
              href="${escHtml(upload.downloadUrl)}"
              target="_blank"
              rel="noopener noreferrer"
              class="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-2xl border border-white/10 bg-white/[0.04] px-3 text-sm font-semibold text-liad-text transition hover:bg-white/[0.08]"
            >
              ${getIconMarkup("download")}
              <span>Baixar</span>
            </a>
          ` : ""}
          <button
            type="button"
            data-delete-upload
            data-doc-id="${escHtml(upload.id)}"
            data-storage-path="${escHtml(upload.storagePath ?? "")}"
            data-file-name="${escHtml(upload.fileName)}"
            class="inline-flex min-h-9 items-center justify-center gap-1.5 rounded-2xl border border-[#ff8439]/20 bg-[#ff8439]/08 px-3 text-sm font-semibold text-[#ffb49e] transition hover:bg-[#ff8439]/15"
          >
            ${getIconMarkup("trash")}
            <span>Remover</span>
          </button>
        </div>
      </td>
    </tr>
  `;
}
 
// ------------------------------------------------------------------
// Event binding
// ------------------------------------------------------------------
function bindEvents() {
  if (!viewContainer) return;
 
  const input = viewContainer.querySelector("[data-csv-input]");
  const dropzone = viewContainer.querySelector("[data-csv-dropzone]");
 
  input?.addEventListener("change", (e) => {
    handleFileSelected(e.target.files?.[0]);
    e.target.value = "";
  });
 
  dropzone?.addEventListener("dragover", (e) => {
    e.preventDefault();
    dropzone.classList.add("border-liad-purple/30", "bg-white/[0.04]");
  });
 
  dropzone?.addEventListener("dragleave", () => {
    dropzone.classList.remove("border-liad-purple/30", "bg-white/[0.04]");
  });
 
  dropzone?.addEventListener("drop", (e) => {
    e.preventDefault();
    dropzone.classList.remove("border-liad-purple/30", "bg-white/[0.04]");
    handleFileSelected(e.dataTransfer?.files?.[0]);
  });
 
  viewContainer.querySelectorAll("[data-delete-upload]").forEach((btn) => {
    btn.addEventListener("click", () => {
      handleDelete(btn.dataset.docId, btn.dataset.storagePath, btn.dataset.fileName);
    });
  });
}
 