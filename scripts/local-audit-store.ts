import { eq } from 'drizzle-orm';
import { db } from '../src/db/client';
import { audits, auditIssues } from '../src/db/schema';
import type { AuditResult } from '../src/lib/audit';

export function completeLocalAudit(auditId: number, result: AuditResult) {
  // status belongs to the first page to finish, not necessarily the entry URL.
  // HTTP errors are findings, not proof the entire crawl failed.
  if (result.pagesCrawled < 1) throw new Error('Crawl failed: no pages could be inspected');
  db.transaction((tx) => {
    if (result.findings.length) tx.insert(auditIssues).values(result.findings.map(f => ({ ...f, auditId }))).run();
    tx.update(audits).set({ status: 'completed', score: result.score, pagesCrawled: result.pagesCrawled, issuesCount: result.findings.length, completedAt: new Date(), updatedAt: new Date() }).where(eq(audits.id, auditId)).run();
  });
}
