import {
  deleteUser,
  updateProfile
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  doc,
  getDoc,
  serverTimestamp,
  writeBatch
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-storage.js";
import { getFirebaseServices } from "./firebase-client.js";
import {
  formatCnpj,
  normalizeCnpj,
  normalizeEmail,
  normalizeWhitespace
} from "./validators.js";

const pendingProfileKey = "liad.pendingProfile";

function isPermissionDeniedError(error) {
  return error?.code === "permission-denied";
}

function buildUserSnapshot(payload, user, provider) {
  return {
    accountId: payload.cnpjNormalized,
    storeName: payload.storeName,
    ownerFirstName: payload.ownerFirstName,
    ownerLastName: payload.ownerLastName,
    email: user.email ?? payload.email,
    logoUrl: "",
    logoStoragePath: "",
    hasCustomLogo: false,
    provider,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  };
}

function buildAccountSnapshot(payload, user, provider) {
  return {
    storeName: payload.storeName,
    ownerFirstName: payload.ownerFirstName,
    ownerLastName: payload.ownerLastName,
    email: user.email ?? payload.email,
    cnpj: payload.cnpj,
    cnpjNormalized: payload.cnpjNormalized,
    monthlyVisitsRange: payload.monthlyVisitsRange,
    logoUrl: "",
    logoStoragePath: "",
    hasCustomLogo: false,
    ownerUid: user.uid,
    provider,
    profileCompleted: true,
    updatedAt: serverTimestamp(),
    createdAt: serverTimestamp()
  };
}

export async function getCurrentAccountContext(user) {
  const { db } = await getFirebaseServices();
  const userDocRef = doc(db, "users", user.uid);
  let userDoc;

  try {
    userDoc = await getDoc(userDocRef);
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      throw new Error(
        "O Firestore bloqueou a leitura do perfil. Publique as regras das colecoes accounts e users antes de testar o login."
      );
    }

    throw error;
  }

  if (!userDoc.exists()) {
    return null;
  }

  const userProfile = userDoc.data();
  const accountDocRef = doc(db, "accounts", userProfile.accountId);
  let accountDoc;

  try {
    accountDoc = await getDoc(accountDocRef);
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      throw new Error(
        "O Firestore bloqueou a leitura da conta da empresa. Revise as regras da colecao accounts."
      );
    }

    throw error;
  }

  return {
    userProfile,
    account: accountDoc.exists() ? accountDoc.data() : null,
    accountId: userProfile.accountId
  };
}

export async function saveAccountProfile(user, rawPayload, options = {}) {
  const { db } = await getFirebaseServices();
  const provider = options.provider ?? "password";
  const cnpjNormalized = normalizeCnpj(rawPayload.cnpj);
  const accountDocRef = doc(db, "accounts", cnpjNormalized);
  const accountDoc = await getDoc(accountDocRef);

  if (accountDoc.exists() && accountDoc.data().ownerUid !== user.uid) {
    throw new Error("Ja existe uma conta cadastrada para este CNPJ.");
  }

  const payload = {
    storeName: normalizeWhitespace(rawPayload.storeName),
    ownerFirstName: normalizeWhitespace(rawPayload.ownerFirstName),
    ownerLastName: normalizeWhitespace(rawPayload.ownerLastName),
    email: normalizeEmail(rawPayload.email ?? user.email ?? ""),
    cnpj: formatCnpj(rawPayload.cnpj),
    cnpjNormalized,
    monthlyVisitsRange: rawPayload.monthlyVisitsRange
  };

  const batch = writeBatch(db);
  const userDocRef = doc(db, "users", user.uid);

  batch.set(accountDocRef, buildAccountSnapshot(payload, user, provider));
  batch.set(userDocRef, buildUserSnapshot(payload, user, provider), {
    merge: true
  });

  try {
    await batch.commit();
  } catch (error) {
    if (options.rollbackAuthUserOnFailure) {
      try {
        await deleteUser(user);
      } catch (deleteError) {
        console.error("Falha ao remover usuario apos erro de persistencia.", deleteError);
      }
    }

    if (isPermissionDeniedError(error)) {
      throw new Error(
        "O usuario foi autenticado, mas o Firestore bloqueou o salvamento do cadastro. Publique as regras de accounts e users e remova este usuario em Authentication antes de tentar de novo."
      );
    }

    throw error;
  }

  clearPendingProfile();
  return payload.cnpjNormalized;
}

function buildAccountRefs(db, user, accountId) {
  return {
    accountDocRef: doc(db, "accounts", accountId),
    userDocRef: doc(db, "users", user.uid)
  };
}

function sanitizeStorageFileName(fileName) {
  const trimmed = String(fileName ?? "").trim().toLowerCase();
  const normalized = trimmed
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9._-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");

  return normalized || "logo";
}

function buildLogoStoragePath(accountId, file) {
  const safeFileName = sanitizeStorageFileName(file?.name);
  return `accounts/${accountId}/store-logo/${Date.now()}-${safeFileName}`;
}

async function deleteLogoIfExists(storage, storagePath) {
  if (!storagePath) {
    return;
  }

  try {
    await deleteObject(ref(storage, storagePath));
  } catch (error) {
    if (error?.code === "storage/object-not-found") {
      return;
    }

    throw error;
  }
}

async function commitProfilePatch(user, accountId, accountPatch, userPatch, authPatch) {
  const { db } = await getFirebaseServices();
  const { accountDocRef, userDocRef } = buildAccountRefs(db, user, accountId);
  const batch = writeBatch(db);

  batch.set(
    accountDocRef,
    {
      ...accountPatch,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
  batch.set(
    userDocRef,
    {
      ...userPatch,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  try {
    await batch.commit();
    if (authPatch) {
      await updateProfile(user, authPatch);
    }
  } catch (error) {
    if (isPermissionDeniedError(error)) {
      throw new Error(
        "O Firestore bloqueou o salvamento das configuracoes. Revise as regras das colecoes accounts e users."
      );
    }

    throw error;
  }
}

export async function updateAccountOwnerProfile(user, payload) {
  const ownerFirstName = normalizeWhitespace(payload.ownerFirstName);
  const ownerLastName = normalizeWhitespace(payload.ownerLastName);

  await commitProfilePatch(
    user,
    payload.accountId,
    {
      ownerFirstName,
      ownerLastName
    },
    {
      ownerFirstName,
      ownerLastName
    },
    {
      displayName: `${ownerFirstName} ${ownerLastName}`.trim()
    }
  );

  return {
    ownerFirstName,
    ownerLastName
  };
}

export async function updateStoreProfile(user, payload) {
  const storeName = normalizeWhitespace(payload.storeName);
  const monthlyVisitsRange = payload.monthlyVisitsRange;

  await commitProfilePatch(
    user,
    payload.accountId,
    {
      storeName,
      monthlyVisitsRange
    },
    {
      storeName,
      monthlyVisitsRange
    }
  );

  return {
    storeName,
    monthlyVisitsRange
  };
}

export async function saveStoreLogo(user, payload) {
  const { db, storage } = await getFirebaseServices();
  const { accountDocRef, userDocRef } = buildAccountRefs(db, user, payload.accountId);
  let logoUrl = "";
  let logoStoragePath = "";
  let hasCustomLogo = false;
  let uploadedLogoStoragePath = "";

  if (payload.file) {
    uploadedLogoStoragePath = buildLogoStoragePath(payload.accountId, payload.file);

    try {
      const uploadResult = await uploadBytes(ref(storage, uploadedLogoStoragePath), payload.file, {
        contentType: payload.file.type || undefined,
        cacheControl: "public,max-age=3600"
      });

      logoUrl = await getDownloadURL(uploadResult.ref);
      logoStoragePath = uploadedLogoStoragePath;
      hasCustomLogo = true;
    } catch (error) {
      if (error?.code?.startsWith?.("storage/")) {
        throw new Error("Nao foi possivel enviar a logo para o Firebase Storage.");
      }

      throw error;
    }
  }

  const batch = writeBatch(db);

  batch.set(
    accountDocRef,
    {
      logoUrl,
      logoStoragePath,
      hasCustomLogo,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );
  batch.set(
    userDocRef,
    {
      logoUrl,
      logoStoragePath,
      hasCustomLogo,
      updatedAt: serverTimestamp()
    },
    { merge: true }
  );

  try {
    await batch.commit();
  } catch (error) {
    if (uploadedLogoStoragePath) {
      try {
        await deleteLogoIfExists(storage, uploadedLogoStoragePath);
      } catch (cleanupError) {
        console.error("Falha ao limpar a logo enviada apos erro no Firestore.", cleanupError);
      }
    }

    if (isPermissionDeniedError(error)) {
      throw new Error(
        "O Firestore bloqueou o salvamento da logo. Revise as regras das colecoes accounts e users."
      );
    }

    throw error;
  }

  if (payload.previousLogoStoragePath && payload.previousLogoStoragePath !== logoStoragePath) {
    try {
      await deleteLogoIfExists(storage, payload.previousLogoStoragePath);
    } catch (error) {
      console.error("Falha ao remover a logo anterior do Firebase Storage.", error);
    }
  }

  return {
    logoUrl,
    logoStoragePath,
    hasCustomLogo
  };
}

export function storePendingProfile(data) {
  sessionStorage.setItem(pendingProfileKey, JSON.stringify(data));
}

export function readPendingProfile() {
  const rawValue = sessionStorage.getItem(pendingProfileKey);

  if (!rawValue) {
    return null;
  }

  try {
    return JSON.parse(rawValue);
  } catch (error) {
    clearPendingProfile();
    return null;
  }
}

export function clearPendingProfile() {
  sessionStorage.removeItem(pendingProfileKey);
}
