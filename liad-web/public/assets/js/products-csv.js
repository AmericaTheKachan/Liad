import {
  collection,
  deleteDoc,
  doc,
  getDocs,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytesResumable
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { getFirebaseServices } from "./firebase-client.js";

function isPermissionDeniedError(error) {
  return error?.code === "permission-denied";
}

function buildCsvStoragePath(accountId, file) {
  const safe = String(file.name ?? "produtos")
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return `accounts/${accountId}/products-csv/${Date.now()}-${safe}`;
}

export async function uploadProductsCsv(accountId, file, onProgress) {
  const { db, storage } = await getFirebaseServices();
  const storagePath = buildCsvStoragePath(accountId, file);
  const storageRef = ref(storage, storagePath);

  const downloadUrl = await new Promise((resolve, reject) => {
    const task = uploadBytesResumable(storageRef, file, {
      contentType: "text/csv",
      cacheControl: "private,max-age=0"
    });

    task.on(
      "state_changed",
      (snapshot) => {
        const pct = Math.round((snapshot.bytesTransferred / snapshot.totalBytes) * 100);
        onProgress?.(pct);
      },
      reject,
      async () => {
        try {
          resolve(await getDownloadURL(task.snapshot.ref));
        } catch (error) {
          reject(error);
        }
      }
    );
  });

  const docId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const docRef = doc(db, "accounts", accountId, "csvUploads", docId);

  try {
    await setDoc(docRef, {
      fileName: file.name,
      fileSize: file.size,
      storagePath,
      downloadUrl,
      status: "pending",
      uploadedAt: serverTimestamp()
    });
  } catch (error) {
    try {
      await deleteObject(storageRef);
    } catch (_) {}

    if (isPermissionDeniedError(error)) {
      throw new Error(
        "O Firestore bloqueou o registro do arquivo. Publique as regras da subcoleção csvUploads."
      );
    }

    throw error;
  }

  return { docId, storagePath, downloadUrl };
}

export async function listProductsCsvUploads(accountId) {
  const { db } = await getFirebaseServices();
  const col = collection(db, "accounts", accountId, "csvUploads");
  const q = query(col, orderBy("uploadedAt", "desc"));

  try {
    const snapshot = await getDocs(q);
    return snapshot.docs.map((d) => ({ id: d.id, ...d.data() }));
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      throw new Error(
        "O Firestore bloqueou a leitura dos uploads. Revise as regras da subcoleção csvUploads."
      );
    }

    throw error;
  }
}

export async function deleteProductsCsvUpload(accountId, docId, storagePath) {
  const { db, storage } = await getFirebaseServices();

  await deleteDoc(doc(db, "accounts", accountId, "csvUploads", docId));

  if (storagePath) {
    try {
      await deleteObject(ref(storage, storagePath));
    } catch (error) {
      if (error?.code !== "storage/object-not-found") {
        console.error("Falha ao remover arquivo do Storage.", error);
      }
    }
  }
}

export function formatFileSize(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function formatUploadDate(timestamp) {
  if (!timestamp) return "—";
  const date = timestamp.toDate ? timestamp.toDate() : new Date(timestamp);
  return new Intl.DateTimeFormat("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}
async function updateProductsCsvStatus(accountId, docId, status, errorMessage = null) {
  const { db } = await getFirebaseServices();
  const docRef = doc(db, "accounts", accountId, "csvUploads", docId);
  
  const updateData = { 
    status,
    updatedAt: serverTimestamp() 
  };
  
  if (errorMessage) {
    updateData.errorMessage = errorMessage;
  }

  return await updateDoc(docRef, updateData); 
}

export async function markUploadAsProcessed(accountId, docId) {
  return updateProductsCsvStatus(accountId, docId, "processed");
}

export async function markUploadAsError(accountId, docId, errorMessage) {
  return updateProductsCsvStatus(accountId, docId, "error", errorMessage);
}