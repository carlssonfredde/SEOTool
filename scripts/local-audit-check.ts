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
      assert.throws(() => completeLocalAudit(2, { ...result, pagesCrawled: 0 }), /no pages/);
      assert.deepEqual(sqlite.prepare('SELECT status,issues_count FROM audits WHERE id=2').get(), { status: 'running', issues_count: 0 });
      console.log('PASS: nonempty 404 crawl retains completed state and findings; empty crawl cannot be completed.');
    } finally { sqlite.close(); }
  } finally { rmSync(dir, { recursive: true, force: true }); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
