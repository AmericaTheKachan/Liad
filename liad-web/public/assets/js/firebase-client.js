import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  GoogleAuthProvider,
  browserLocalPersistence,
  getAuth,
  setPersistence
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

let servicesPromise;

async function fetchFirebaseConfig() {
  const response = await fetch("/api/firebase-config", {
    credentials: "same-origin",
    headers: {
      Accept: "application/json"
    }
  });

  if (!response.ok) {
    throw new Error("Nao foi possivel carregar a configuracao do Firebase.");
  }

  const payload = await response.json();

  if (!payload.configured) {
    const missingKeys = Array.isArray(payload.missingKeys)
      ? payload.missingKeys.join(", ")
      : "FIREBASE_*";

    throw new Error(
      `Firebase nao configurado no servidor. Preencha as variaveis: ${missingKeys}.`
    );
  }

  return payload.config;
}

export async function getFirebaseServices() {
  if (!servicesPromise) {
    servicesPromise = fetchFirebaseConfig().then((config) => {
      const app = initializeApp(config);
      const auth = getAuth(app);
      const db = getFirestore(app);
      const googleProvider = new GoogleAuthProvider();

      googleProvider.setCustomParameters({
        prompt: "select_account"
      });

      return { app, auth, db, googleProvider };
    });
  }

  return servicesPromise;
}

export async function ensureLocalPersistence() {
  const { auth } = await getFirebaseServices();
  await setPersistence(auth, browserLocalPersistence);
  return auth;
}
