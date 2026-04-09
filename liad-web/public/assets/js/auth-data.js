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
  const { db } = await getFirebaseServices();
  const { accountDocRef, userDocRef } = buildAccountRefs(db, user, payload.accountId);
  let logoUrl = "";
  let logoStoragePath = "";
  let hasCustomLogo = false;

  if (payload.file) {
    logoUrl = payload.inlineDataUrl ?? "";
    logoStoragePath = "";
    hasCustomLogo = true;
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
    if (isPermissionDeniedError(error)) {
      throw new Error(
        "O Firestore bloqueou o salvamento da logo. Revise as regras das colecoes accounts e users."
      );
    }

    throw error;
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
