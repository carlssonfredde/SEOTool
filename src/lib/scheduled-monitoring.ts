/** Background collection only: no server actions, AI, notifications or CMS writes. */
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { clients, keywords, keywordRankings, monitoredPages, pageChanges } from "@/db/schema";
import { prefetchGscSnapshot, resolveRank } from "./rank-resolve";
import { shutdownBrowser } from "./rank-checker";
import { diffSnapshots, fetchSnapshot } from "./page-monitor";

async function requireClient(clientId: number) {
  if (!Number.isSafeInteger(clientId) || clientId <= 0) throw new Error("Invalid monitoring client");
  const [client] = await db.select().from(clients).where(eq(clients.id, clientId));
  if (!client) throw new Error(`Monitoring client ${clientId} not found`);
  return client;
}

export async function checkScheduledRanks(clientId: number): Promise<void> {
  const client = await requireClient(clientId);
  const rows = await db.select().from(keywords).where(eq(keywords.clientId, clientId));
  const failures: number[] = [];
  try {
    // Separate snapshots for keyword country overrides; preserve device and provenance.
    const snapshots = new Map<string, Awaited<ReturnType<typeof prefetchGscSnapshot>>>();
    for (const keyword of rows) {
      try {
        const country = keyword.country || client.country || "US";
        if (!snapshots.has(country)) {
          snapshots.set(country, await prefetchGscSnapshot({
            gscProperty: client.gscProperty, clientIdScope: clientId, country,
          }));
        }
        const result = await resolveRank({
          query: keyword.query, domain: client.url, device: keyword.device,
          country, language: keyword.language || client.language || "en",
          city: keyword.city ?? client.city ?? undefined,
          gscProperty: client.gscProperty, clientIdScope: clientId,
          snapshot: snapshots.get(country), screenshot: false,
        });
        // Failed collection is not a measured ranking loss. Leave history intact.
        if (result.error) throw new Error("Rank collection failed");
        await db.insert(keywordRankings).values({
          keywordId: keyword.id, position: result.position, url: result.url,
          checkedAt: result.checkedAt, device: keyword.device, source: result.source,
          impressions: result.impressions, dataDate: result.dataDate,
        });
      } catch {
        failures.push(keyword.id);
      }
    }
  } finally {
    await shutdownBrowser();
  }
  if (failures.length) throw new Error(`Rank checks failed for keyword IDs: ${failures.join(", ")}`);
}

export async function checkScheduledPages(clientId: number): Promise<void> {
  await requireClient(clientId);
  const pages = await db.select().from(monitoredPages).where(and(
    eq(monitoredPages.clientId, clientId), eq(monitoredPages.status, "active"),
  ));
  const failures: number[] = [];
  for (const page of pages) {
    try {
      const snap = await fetchSnapshot(page.url);
      if (!snap) throw new Error("Page collection failed");
      const diffs = diffSnapshots(page.lastContentHash ? {
        title: page.lastTitle, description: page.lastDescription, h1: page.lastH1,
        canonical: page.lastCanonical, contentHash: page.lastContentHash,
      } : null, snap);
      db.transaction((tx) => {
        if (diffs.length) tx.insert(pageChanges).values(diffs.map((diff) => ({
          monitoredPageId: page.id, ...diff,
        }))).run();
        tx.update(monitoredPages).set({
          lastTitle: snap.title, lastDescription: snap.description, lastH1: snap.h1,
          lastCanonical: snap.canonical, lastContentHash: snap.contentHash,
          lastCheckedAt: new Date(), updatedAt: new Date(),
        }).where(eq(monitoredPages.id, page.id)).run();
      });
    } catch {
      failures.push(page.id);
    }
  }
  if (failures.length) throw new Error(`Page checks failed for monitor IDs: ${failures.join(", ")}`);
}
