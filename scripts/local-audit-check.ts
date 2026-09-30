import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import type { AuditResult } from '../src/lib/audit';

async function main() {
  const dir = mkdtempSync(join(tmpdir(), 'seo-local-audit-'));
  process.env.SEO_DB_PATH = join(dir, 'test.db');
  process.env.SEO_MCP_READ_ONLY = '0';
  try {
    execFileSync(process.execPath, ['scripts/migrate.cjs'], { env: process.env, stdio: 'pipe' });
    const { sqlite } = await import('../src/db/client');
    try {
      const { completeLocalAudit } = await import('./local-audit-store');
      sqlite.exec("INSERT INTO clients (id,name,url) VALUES (1,'Synthetic','https://example.com'); INSERT INTO audits (id,client_id,status) VALUES (1,1,'running'),(2,1,'running')");
      const result: AuditResult = {
        url: 'https://example.com/', finalUrl: 'https://example.com/gone', status: 404,
        fetchedAt: new Date(), pagesCrawled: 2, score: 75,
        findings: [{ type: 'http_error', severity: 'critical', url: 'https://example.com/gone', message: 'HTTP 404' }],
      };
      completeLocalAudit(1, result);
      assert.deepEqual(sqlite.prepare('SELECT status,pages_crawled,issues_count FROM audits WHERE id=1').get(), { status: 'completed', pages_crawled: 2, issues_count: 1 });
      assert.deepEqual(sqlite.prepare('SELECT url,message FROM audit_issues WHERE audit_id=1').get(), { url: 'https://example.com/gone', message: 'HTTP 404' });
      sqlite.exec("UPDATE audit_issues SET status='false_positive' WHERE audit_id=1; INSERT INTO audit_issues (audit_id,severity,type,url,message,status) VALUES (1,'low','ignored_type','https://example.com/ignored','old','ignored'),(1,'low','resolved_type','https://example.com/resolved','old','resolved')");
      sqlite.exec("INSERT INTO audits (id,client_id,status,kind,completed_at) VALUES (5,1,'completed','ai_full',unixepoch()+1); INSERT INTO audit_issues (audit_id,severity,type,url,message,status) VALUES (5,'critical','http_error','https://example.com/gone','AI result','new')");
      completeLocalAudit(2, { ...result, findings: [
        ...result.findings,
        { type: 'ignored_type', severity: 'low', url: 'https://example.com/ignored', message: 'again' },
        { type: 'resolved_type', severity: 'low', url: 'https://example.com/resolved', message: 'again' },
        { type: 'http_error', severity: 'critical', url: 'https://example.com/other', message: 'new' },
      ] });
      assert.deepEqual(sqlite.prepare('SELECT type,url,status FROM audit_issues WHERE audit_id=2 ORDER BY id').all(), [
        { type: 'http_error', url: 'https://example.com/gone', status: 'false_positive' },
        { type: 'ignored_type', url: 'https://example.com/ignored', status: 'ignored' },
        { type: 'resolved_type', url: 'https://example.com/resolved', status: 'new' },
        { type: 'http_error', url: 'https://example.com/other', status: 'new' },
      ]);
      sqlite.exec("INSERT INTO audits (id,client_id,status) VALUES (3,1,'running'); UPDATE audit_issues SET status='new' WHERE audit_id=2 AND type='http_error' AND url='https://example.com/gone'");
      completeLocalAudit(3, result);
      assert.equal((sqlite.prepare('SELECT status FROM audit_issues WHERE audit_id=3').get() as { status: string }).status, 'new');
      sqlite.exec("INSERT INTO audits (id,client_id,status) VALUES (4,1,'running')");
      assert.throws(() => completeLocalAudit(4, { ...result, pagesCrawled: 0 }), /no pages/);
      assert.deepEqual(sqlite.prepare('SELECT status,issues_count FROM audits WHERE id=4').get(), { status: 'running', issues_count: 0 });
      console.log('PASS: crawl status, false-positive/ignored carry-forward, resolved reopening, restored issue, and empty-crawl guard.');
    } finally { sqlite.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
