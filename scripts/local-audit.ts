/** Operator-only bounded crawl. Not exposed over MCP. No AI, CMS, or notification calls. */
import { eq } from 'drizzle-orm';
import { db, sqlite } from '../src/db/client';
import { clients, audits } from '../src/db/schema';
import { runAudit } from '../src/lib/audit';
import { completeLocalAudit } from './local-audit-store';

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
    completeLocalAudit(audit.id, result);
    console.log(JSON.stringify({ clientId: client.id, auditId: audit.id, options: { maxPages: 5, maxDepth: 1, renderJs: false }, ...result }, null, 2));
  } catch (error) {
    await db.update(audits).set({ status: 'failed', completedAt: new Date(), updatedAt: new Date() }).where(eq(audits.id, audit.id));
    throw error;
  }
}
main().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => sqlite.close());
