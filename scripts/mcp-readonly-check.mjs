import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import Database from 'better-sqlite3';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

const dir = mkdtempSync(join(tmpdir(), 'seo-readonly-'));
const dbPath = join(dir, 'data.db');
const env = { ...process.env, SEO_DB_PATH: dbPath, SEO_DATA_DIR: dir, SEO_MCP_READ_ONLY: '1' };
const tsx = resolve('node_modules/tsx/dist/cli.mjs');
const expected = ['list_clients', 'get_client_overview', 'list_audit_issues', 'get_keyword_rankings', 'get_ai_visibility', 'get_citation_landscape', 'list_agent_actions', 'get_recent_agent_runs', 'list_proposed_fixes'];
const client = new Client({ name: 'readonly-check', version: '1' });
let db;
try {
  execFileSync(process.execPath, ['scripts/migrate.cjs'], { env, stdio: 'pipe' });
  db = new Database(dbPath);
  db.prepare('INSERT INTO clients (name,url) VALUES (?,?)').run('Synthetic check', 'https://example.com');
  db.prepare('INSERT INTO audits (client_id,status,score,pages_crawled,completed_at) VALUES (1,?,?,?,?)').run('completed', 80, 1, Math.floor(Date.now()/1000) - 30*86400);
  db.prepare('INSERT INTO audit_issues (audit_id,type,severity,url,message) VALUES (1,?,?,?,?)').run('missing_title','high','https://example.com','Synthetic missing title');
  db.prepare("INSERT INTO audits (client_id,status) VALUES (1,'failed')").run();
  await client.connect(new StdioClientTransport({ command: process.execPath, args: [tsx, 'scripts/mcp-server.ts'], env, stderr: 'pipe' }));
  const listed = await client.listTools();
  assert.deepEqual(listed.tools.map(t=>t.name).sort(), expected.sort());
  for (const name of expected) {
    const result = await client.callTool({ name, arguments: name === 'list_clients' ? {} : { clientId: 1 } });
    assert.ok(!result.isError, `${name}: ${JSON.stringify(result)}`);
  }
  for (const name of ['run_agent','apply_fix','revert_agent_action']) {
    assert.equal((await client.callTool({ name, arguments: { clientId: 1, fixId: 1, actionId: 1, newValue: 'forbidden' } })).isError, true);
  }
  const overview = JSON.parse((await client.callTool({ name: 'get_client_overview', arguments: { clientId: 1 } })).content[0].text);
  assert.equal(overview.latestAttempt.status, 'failed');
  assert.equal(overview.audit.freshness, '4 weeks ago');
  assert.equal(overview.audit.score, 80);
  assert.equal((await client.callTool({ name: 'get_client_overview', arguments: { clientId: 999999 } })).isError, true);
  db.prepare('INSERT INTO clients (name,url) VALUES (?,?)').run('Unaudited synthetic', 'https://example.org');
  const unaudited = JSON.parse((await client.callTool({ name: 'get_client_overview', arguments: { clientId: 2 } })).content[0].text);
  assert.match(unaudited.audit.note, /No completed audit/);
  assert.throws(() => execFileSync(process.execPath, [tsx, '-e', "import { sqlite } from './src/db/client'; sqlite.exec(\"INSERT INTO clients (name,url) VALUES ('forbidden','https://example.net')\")"], { env, stdio: 'pipe' }), /readonly database/);
  const missing = join(dir, 'missing.db');
  assert.throws(() => execFileSync(process.execPath, [tsx, '-e', "import './src/db/client'"], { env: { ...env, SEO_DB_PATH: missing }, stdio: 'pipe' }));
  assert.equal(existsSync(missing), false);
  assert.throws(() => execFileSync(process.execPath, [tsx, '-e', "import './src/db/client'"], { env: { ...env, SEO_DB_PATH: '' }, stdio: 'pipe' }), /explicit SEO_DB_PATH/);
  console.log('PASS: nine read tools, blocked mutation calls, read-only database, shared live data, freshness, failed attempt, unknown client, unaudited client, and missing database refusal.');
} finally {
  await client.close();
  db?.close();
  rmSync(dir, { recursive: true, force: true });
}
