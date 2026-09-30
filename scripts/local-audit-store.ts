import { and, desc, eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { audits, auditIssues } from '../src/db/schema';
import type { AuditResult } from '../src/lib/audit';

export function completeLocalAudit(auditId: number, result: AuditResult) {
  // status belongs to the first page to finish, not necessarily the entry URL.
  // HTTP errors are findings, not proof the entire crawl failed.
  if (result.pagesCrawled < 1) throw new Error('Crawl failed: no pages could be inspected');
  db.transaction((tx) => {
    const [current] = tx.select({ clientId: audits.clientId }).from(audits).where(eq(audits.id, auditId)).all();
    if (!current) throw new Error(`Audit ${auditId} does not exist`);
    const [previous] = tx.select({ id: audits.id }).from(audits)
      .where(and(eq(audits.clientId, current.clientId), eq(audits.status, 'completed'), eq(audits.kind, 'crawler')))
      .orderBy(desc(audits.completedAt), desc(audits.id)).limit(1).all();
    const previousStatuses = previous
      ? tx.select({ type: auditIssues.type, url: auditIssues.url, status: auditIssues.status })
        .from(auditIssues).where(eq(auditIssues.auditId, previous.id)).all()
      : [];
    const muted = new Map(previousStatuses
      .filter(issue => issue.status === 'ignored' || issue.status === 'false_positive')
      .map(issue => [`${issue.type}::${issue.url}`, issue.status] as const));
    if (result.findings.length) tx.insert(auditIssues).values(result.findings.map(f => ({
      ...f, auditId, status: muted.get(`${f.type}::${f.url}`) ?? 'new',
    }))).run();
    tx.update(audits).set({ status: 'completed', score: result.score, pagesCrawled: result.pagesCrawled, issuesCount: result.findings.length, completedAt: new Date(), updatedAt: new Date() }).where(eq(audits.id, auditId)).run();
  });
}
