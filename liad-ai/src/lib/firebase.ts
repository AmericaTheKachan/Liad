import crypto from "crypto";
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
      storageBucket: process.env.FIREBASE_STORAGE_BUCKET,
    });
  }

  return adminApp;
}

// ─── CSV cache ────────────────────────────────────────────────────────────────

interface CsvCacheEntry {
  content: string;
  fetchedAt: number;
}

const csvMemoryCache = new Map<string, CsvCacheEntry>();
const CSV_CACHE_TTL_MS = 10 * 60_000;

// ─── Account cache ────────────────────────────────────────────────────────────

interface AccountCacheEntry {
  data: admin.firestore.DocumentData | null;
  fetchedAt: number;
}

const accountMemoryCache = new Map<string, AccountCacheEntry>();
const ACCOUNT_CACHE_TTL_MS = 30 * 60_000;

// ─── Public API ───────────────────────────────────────────────────────────────

export interface ApiKeySummary {
  exists: boolean;
  value: string;
  prefix: string;
  last4: string;
  createdAt: string | null;
  lastUsedAt: string | null;
}

export interface AuthenticatedAccount {
  accountId: string;
  account: admin.firestore.DocumentData;
}

export interface ApiKeyAccount extends AuthenticatedAccount {
  apiKeyHash: string;
}

function timestampToIso(value: unknown): string | null {
  if (value instanceof admin.firestore.Timestamp) {
    return value.toDate().toISOString();
  }

  if (typeof value === "string" && value.trim()) {
    return value;
  }

  return null;
}

function buildApiKeySummary(account: admin.firestore.DocumentData | null): ApiKeySummary {
  const value = typeof account?.apiKeyValue === "string" ? account.apiKeyValue : "";
  const prefix = typeof account?.apiKeyPrefix === "string" ? account.apiKeyPrefix : "";
  const last4 = typeof account?.apiKeyLast4 === "string" ? account.apiKeyLast4 : "";

  return {
    exists: Boolean(value),
    value,
    prefix,
    last4,
    createdAt: timestampToIso(account?.apiKeyCreatedAt),
    lastUsedAt: timestampToIso(account?.apiKeyLastUsedAt),
  };
}

function generateRawApiKey(): string {
  return `sk-liad-${crypto.randomBytes(24).toString("hex")}`;
}

function hashApiKey(apiKey: string): string {
  return crypto.createHash("sha256").update(apiKey.trim(), "utf8").digest("hex");
}

// ─── Public API ───────────────────────────────────────────────────────────────

export function invalidateCsvCache(accountId: string): void {
  csvMemoryCache.delete(accountId);
}

export function invalidateAccountCache(accountId: string): void {
  accountMemoryCache.delete(accountId);
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

export async function getAllAccountIds(): Promise<string[]> {
  const app = getAdminApp();
  const db = admin.firestore(app);
  const snapshot = await db.collection("accounts").get();
  return snapshot.docs.map(doc => doc.id);
}

export async function getAccountData(accountId: string): Promise<admin.firestore.DocumentData | null> {
  const cached = accountMemoryCache.get(accountId);
  if (cached && Date.now() - cached.fetchedAt < ACCOUNT_CACHE_TTL_MS) {
    return cached.data;
  }

  const app = getAdminApp();
  const db = admin.firestore(app);
  const doc = await db.collection("accounts").doc(accountId).get();
  const data = doc.exists ? doc.data() ?? null : null;

  accountMemoryCache.set(accountId, { data, fetchedAt: Date.now() });
  return data;
}

export async function verifyFirebaseToken(idToken: string): Promise<admin.auth.DecodedIdToken> {
  const app = getAdminApp();
  return admin.auth(app).verifyIdToken(idToken);
}

export async function getAuthenticatedAccount(uid: string): Promise<AuthenticatedAccount | null> {
  const app = getAdminApp();
  const db = admin.firestore(app);
  const userDoc = await db.collection("users").doc(uid).get();

  if (!userDoc.exists) {
    return null;
  }

  const accountId = userDoc.data()?.accountId;
  if (!accountId || typeof accountId !== "string") {
    return null;
  }

  const accountDoc = await db.collection("accounts").doc(accountId).get();
  if (!accountDoc.exists) {
    return null;
  }

  const account = accountDoc.data() ?? {};
  if (account.ownerUid !== uid) {
    return null;
  }

  return { accountId, account };
}

export async function getApiKeyForAccount(accountId: string): Promise<ApiKeySummary> {
  const account = await getAccountData(accountId);
  return buildApiKeySummary(account);
}

export async function createApiKeyForAccount(
  accountId: string,
): Promise<ApiKeySummary & { key: string }> {
  const app = getAdminApp();
  const db = admin.firestore(app);
  const key = generateRawApiKey();
  const createdAt = admin.firestore.Timestamp.now();
  const prefix = key.slice(0, "sk-liad-".length + 8);
  const last4 = key.slice(-4);

  await db.collection("accounts").doc(accountId).set(
    {
      apiKeyValue: key,
      apiKeyHash: hashApiKey(key),
      apiKeyPrefix: prefix,
      apiKeyLast4: last4,
      apiKeyCreatedAt: createdAt,
      apiKeyLastUsedAt: null,
      apiKeyRevokedAt: null,
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  invalidateAccountCache(accountId);

  return {
    exists: true,
    value: key,
    key,
    prefix,
    last4,
    createdAt: createdAt.toDate().toISOString(),
    lastUsedAt: null,
  };
}

export async function deleteApiKeyForAccount(accountId: string): Promise<ApiKeySummary> {
  const app = getAdminApp();
  const db = admin.firestore(app);

  await db.collection("accounts").doc(accountId).set(
    {
      apiKeyValue: admin.firestore.FieldValue.delete(),
      apiKeyHash: admin.firestore.FieldValue.delete(),
      apiKeyPrefix: admin.firestore.FieldValue.delete(),
      apiKeyLast4: admin.firestore.FieldValue.delete(),
      apiKeyCreatedAt: admin.firestore.FieldValue.delete(),
      apiKeyLastUsedAt: admin.firestore.FieldValue.delete(),
      apiKeyRevokedAt: admin.firestore.Timestamp.now(),
      updatedAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );

  invalidateAccountCache(accountId);

  return buildApiKeySummary(null);
}

export async function getAccountByApiKey(apiKey: string): Promise<ApiKeyAccount | null> {
  const normalizedKey = apiKey.trim();
  if (!normalizedKey.startsWith("sk-liad-")) {
    return null;
  }

  const app = getAdminApp();
  const db = admin.firestore(app);
  const apiKeyHash = hashApiKey(normalizedKey);
  const snapshot = await db
    .collection("accounts")
    .where("apiKeyHash", "==", apiKeyHash)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return null;
  }

  const doc = snapshot.docs[0];
  const account = doc.data();
  if (account.apiKeyRevokedAt) {
    return null;
  }

  return { accountId: doc.id, account, apiKeyHash };
}

export async function touchApiKeyUsage(accountId: string): Promise<void> {
  const app = getAdminApp();
  const db = admin.firestore(app);
  await db.collection("accounts").doc(accountId).set(
    {
      apiKeyLastUsedAt: admin.firestore.FieldValue.serverTimestamp(),
      apiKeyRequestCount: admin.firestore.FieldValue.increment(1),
    },
    { merge: true },
  );
}

export async function logConversation(
  accountId: string,
  data: {
    messageCount: number;
    topProduct: string | null;
    responseTimeMs: number;
  }
): Promise<void> {
  const app = getAdminApp();
  const db = admin.firestore(app);
  await db
    .collection("accounts")
    .doc(accountId)
    .collection("conversations")
    .add({
      timestamp: admin.firestore.FieldValue.serverTimestamp(),
      messageCount: data.messageCount,
      topProduct: data.topProduct,
      responseTimeMs: data.responseTimeMs,
    });
}
