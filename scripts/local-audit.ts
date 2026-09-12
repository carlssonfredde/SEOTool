/** Operator-only bounded crawl. Not exposed over MCP. No AI, CMS, or notification calls. */
import { eq } from 'drizzle-orm';
import { db, sqlite } from '../src/db/client';
import { clients, audits, auditIssues } from '../src/db/schema';
import { runAudit } from '../src/lib/audit';

async function main() {
  const [rawUrl, name] = process.argv.slice(2);
  if (!rawUrl || !name) throw new Error('Usage: local-audit.ts https://public-site/ "Site name"');
  const url = new URL(rawUrl);
  if (!['https:', 'http:'].includes(url.protocol)) throw new Error('HTTP(S) URL required');
  const target = url.href;
  let [client] = await db.select().from(clients).where(eq(clients.url, target)).limit(1);
  if (!client) [client] = await db.insert(clients).values({ name, url: target }).returning();
  const [audit] = await db.insert(audits).values({ clientId: client.id, status: 'running', targetUrl: target, startedAt: new Date() }).returning();
  try {
    const result = await runAudit(target, { maxPages: 5, maxDepth: 1, renderJs: false, ignoreRobots: false, allowPrivateHosts: false });
    if (result.pagesCrawled < 1 || result.status >= 400) throw new Error(`Crawl failed: HTTP ${result.status}, ${result.pagesCrawled} pages`);
    db.transaction((tx) => {
      if (result.findings.length) tx.insert(auditIssues).values(result.findings.map(f => ({ ...f, auditId: audit.id }))).run();
      tx.update(audits).set({ status: 'completed', score: result.score, pagesCrawled: result.pagesCrawled, issuesCount: result.findings.length, completedAt: new Date(), updatedAt: new Date() }).where(eq(audits.id, audit.id)).run();
    });
    console.log(JSON.stringify({ clientId: client.id, auditId: audit.id, options: { maxPages: 5, maxDepth: 1, renderJs: false }, ...result }, null, 2));
  } catch (error) {
    await db.update(audits).set({ status: 'failed', completedAt: new Date(), updatedAt: new Date() }).where(eq(audits.id, audit.id));
    throw error;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => sqlite.close());
