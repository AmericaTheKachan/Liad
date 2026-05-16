import * as admin from "firebase-admin";

let adminApp: admin.app.App | null = null;

export function getAdminApp(): admin.app.App {
  if (!adminApp) {
    const credential = process.env.GOOGLE_APPLICATION_CREDENTIALS
      ? admin.credential.applicationDefault()
      : (() => {
          throw new Error(
            "GOOGLE_APPLICATION_CREDENTIALS nao configurada. Baixe o service account no Console do Firebase."
          );
        })();

    adminApp = admin.initializeApp({
      credential,
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET
    });
  }

  return adminApp;
}

// ─── CSV in-memory cache ──────────────────────────────────────────────────────

interface CsvCacheEntry {
  content: string;
  fetchedAt: number;
}

const csvMemoryCache = new Map<string, CsvCacheEntry>();
const CSV_CACHE_TTL_MS = 60_000; // 60 seconds

export function invalidateCsvCache(accountId: string): void {
  csvMemoryCache.delete(accountId);
}

export async function getLatestCsvForAccount(accountId: string): Promise<string | null> {
  const cached = csvMemoryCache.get(accountId);
  if (cached && Date.now() - cached.fetchedAt < CSV_CACHE_TTL_MS) {
    return cached.content;
  }

  const content = await _fetchCsvFromFirebase(accountId);
  if (content !== null) {
    csvMemoryCache.set(accountId, { content, fetchedAt: Date.now() });
  }
  return content;
}

async function _fetchCsvFromFirebase(accountId: string): Promise<string | null> {
  const app = getAdminApp();
  const db = admin.firestore(app);

  const snapshot = await db
    .collection("accounts")
    .doc(accountId)
    .collection("csvUploads")
    .orderBy("uploadedAt", "desc")
    .limit(1)
    .get();

  if (snapshot.empty) return null;

  const storagePath: string = snapshot.docs[0].data().storagePath;
  if (!storagePath) return null;

  const bucket = admin.storage(app).bucket();
  const [contents] = await bucket.file(storagePath).download();
  return contents.toString("utf-8");
}

export async function getAccountData(accountId: string): Promise<admin.firestore.DocumentData | null> {
  const app = getAdminApp();
  const db = admin.firestore(app);
  const doc = await db.collection("accounts").doc(accountId).get();

  return doc.exists ? doc.data() ?? null : null;
}