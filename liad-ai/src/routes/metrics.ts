import { Request, Response, Router } from "express";
import * as admin from "firebase-admin";
import { getAdminApp } from "../services/firebase-admin";

const router: Router = Router();

type Period = "today" | "7d" | "30d";

interface ConversationRecord {
  timestamp: admin.firestore.Timestamp;
  messageCount: number;
  topProduct: string | null;
  responseTimeMs: number;
}

function getPeriodStart(period: Period): Date {
  const now = new Date();
  if (period === "today") {
    const d = new Date(now);
    d.setHours(0, 0, 0, 0);
    return d;
  }
  const days = period === "30d" ? 30 : 7;
  return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
}

function buildVolumeData(
  docs: ConversationRecord[],
  period: Period,
): Array<{ label: string; value: number }> {
  if (period === "today") {
    const buckets = new Map<number, number>();
    for (const d of docs) {
      const h = d.timestamp?.toDate?.()?.getHours() ?? 0;
      buckets.set(h, (buckets.get(h) ?? 0) + 1);
    }
    const now = new Date();
    const result: Array<{ label: string; value: number }> = [];
    for (let h = 0; h <= now.getHours(); h++) {
      if (buckets.has(h)) {
        result.push({ label: `${String(h).padStart(2, "0")}h`, value: buckets.get(h)! });
      }
    }
    return result.length > 0
      ? result
      : [{ label: `${String(now.getHours()).padStart(2, "0")}h`, value: 0 }];
  }

  const dayLabels = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sab"];
  const totalDays = period === "30d" ? 30 : 7;
  const now = new Date();

  const buckets = new Map<string, { label: string; value: number }>();
  for (let i = totalDays - 1; i >= 0; i--) {
    const d = new Date(now);
    d.setDate(d.getDate() - i);
    d.setHours(0, 0, 0, 0);
    const key = d.toISOString().split("T")[0];
    const label = period === "7d"
      ? dayLabels[d.getDay()]
      : String(d.getDate()).padStart(2, "0");
    buckets.set(key, { label, value: 0 });
  }

  for (const d of docs) {
    const ts = d.timestamp?.toDate?.();
    if (!ts) continue;
    const key = ts.toISOString().split("T")[0];
    const bucket = buckets.get(key);
    if (bucket) bucket.value += 1;
  }

  const allBuckets = [...buckets.values()];
  if (period === "30d") {
    const step = Math.ceil(allBuckets.length / 6);
    return allBuckets.filter((_, i) => i % step === 0 || i === allBuckets.length - 1);
  }
  return allBuckets;
}

router.get("/metrics", async (req: Request, res: Response) => {
  // Auth: require X-Admin-Key when ADMIN_KEY is configured
  const adminKey = process.env.ADMIN_KEY;
  if (adminKey) {
    if (req.headers["x-admin-key"] !== adminKey) {
      res.status(401).json({ error: "Acesso negado. Inclua o header X-Admin-Key correto." });
      return;
    }
  }

  const { accountId, period = "7d" } = req.query as {
    accountId?: string;
    period?: string;
  };

  if (!accountId || typeof accountId !== "string") {
    res.status(400).json({ error: "accountId e obrigatorio." });
    return;
  }

  const validPeriods: Period[] = ["today", "7d", "30d"];
  const safePeriod: Period = validPeriods.includes(period as Period)
    ? (period as Period)
    : "7d";

  try {
    const app = getAdminApp();
    const db = admin.firestore(app);
    const periodStart = getPeriodStart(safePeriod);

    const snapshot = await db
      .collection("accounts")
      .doc(accountId)
      .collection("conversations")
      .where("timestamp", ">=", admin.firestore.Timestamp.fromDate(periodStart))
      .orderBy("timestamp", "desc")
      .limit(500)
      .get();

    if (snapshot.empty) {
      res.json({
        period: safePeriod,
        empty: true,
        kpis: { totalRequests: 0, avgMessages: 0, avgResponseTimeMs: 0, topProduct: null },
        volume: [],
        topProducts: [],
        recentConversations: [],
      });
      return;
    }

    const docs = snapshot.docs.map(d => d.data() as ConversationRecord);
    const totalRequests = docs.length;

    const avgMessages =
      Math.round(
        (docs.reduce((s, d) => s + (d.messageCount ?? 0), 0) / totalRequests) * 10,
      ) / 10;

    const avgResponseTimeMs = Math.round(
      docs.reduce((s, d) => s + (d.responseTimeMs ?? 0), 0) / totalRequests,
    );

    const productCounts = new Map<string, number>();
    for (const d of docs) {
      if (d.topProduct) {
        productCounts.set(d.topProduct, (productCounts.get(d.topProduct) ?? 0) + 1);
      }
    }
    const topProducts = [...productCounts.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([name, count]) => ({ name, count }));

    const recentConversations = docs.slice(0, 50).map(d => {
      const ts = d.timestamp?.toDate?.() ?? new Date();
      const date = ts.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      const time = ts.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
      const respSec = d.responseTimeMs > 0
        ? `${(d.responseTimeMs / 1000).toFixed(1)}s`
        : "-";
      return {
        id: `LIAD-${ts.getTime().toString(36).slice(-6).toUpperCase()}`,
        date: `${date} ${time}`,
        messages: d.messageCount ?? 0,
        responseTime: respSec,
        product: d.topProduct ?? "-",
      };
    });

    res.json({
      period: safePeriod,
      empty: false,
      kpis: {
        totalRequests,
        avgMessages,
        avgResponseTimeMs,
        topProduct: topProducts[0]?.name ?? null,
      },
      volume: buildVolumeData(docs, safePeriod),
      topProducts,
      recentConversations,
    });
  } catch (error) {
    console.error("[/metrics]", error);
    res.status(500).json({ error: "Erro ao buscar metricas." });
  }
});

export default router;
