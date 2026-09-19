import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { execFileSync } from "node:child_process";
import { resolveRank } from "../src/lib/rank-resolve";
import { fetchSnapshot } from "../src/lib/page-monitor";
import { shutdownBrowser } from "../src/lib/rank-checker";

vi.mock("../src/lib/rank-resolve", () => ({ prefetchGscSnapshot: vi.fn(), resolveRank: vi.fn() }));
vi.mock("../src/lib/rank-checker", () => ({ shutdownBrowser: vi.fn() }));
vi.mock("../src/lib/page-monitor", async importOriginal => ({
  ...await importOriginal<typeof import("../src/lib/page-monitor")>(), fetchSnapshot: vi.fn(),
}));
// Importing any of these is itself a regression, even if no function gets called.
vi.mock("../src/lib/notifier", () => { throw new Error("Monitoring must not import notifier"); });
vi.mock("../src/lib/automation-engine", () => { throw new Error("Monitoring must not import automations"); });
vi.mock("next/cache", () => { throw new Error("Monitoring must not import request cache"); });

const dir = mkdtempSync(join(tmpdir(), "seo-monitor-test-"));
let sqlite: typeof import("../src/db/client").sqlite;
let jobs: typeof import("../src/lib/scheduled-monitoring");
beforeAll(async () => {
  vi.stubEnv("SEO_DB_PATH", join(dir, "data.db"));
  vi.stubEnv("SEO_DATA_DIR", dir);
  vi.stubEnv("SEO_MCP_READ_ONLY", "0");
  execFileSync(process.execPath, ["scripts/migrate.cjs"], { env: process.env, stdio: "pipe" });
  ({ sqlite } = await import("../src/db/client"));
  jobs = await import("../src/lib/scheduled-monitoring");
  sqlite.exec(`INSERT INTO clients (id,name,url) VALUES (1,'Selected','https://example.com'),(2,'Other','https://example.org');
    INSERT INTO keywords (id,client_id,query,country,device) VALUES (1,1,'first','SE','mobile'),(2,1,'second','SE','desktop'),(3,2,'other','US','desktop');
    INSERT INTO monitored_pages (id,client_id,url,status,last_title,last_content_hash) VALUES
      (1,1,'https://example.com','active','Old title','old'),
      (2,1,'https://example.com/paused','paused','Paused','old'),
      (3,2,'https://example.org','active','Other','old');`);
});
afterAll(() => { sqlite?.close(); vi.unstubAllEnvs(); rmSync(dir, { recursive: true, force: true }); });
it("scopes queries, preserves provenance and does not store failed ranks as missing positions", async () => {
  vi.mocked(resolveRank).mockResolvedValueOnce({
    query: "first", position: 7, url: null, device: "mobile", source: "gsc",
    checkedAt: new Date(), impressions: 8, dataDate: "2026-09-17", resultsScanned: 0,
  }).mockResolvedValueOnce({
    query: "second", position: null, url: null, device: "desktop", source: "scrape",
    checkedAt: new Date(), impressions: null, dataDate: null, resultsScanned: 0, error: "blocked",
  });
  await expect(jobs.checkScheduledRanks(1)).rejects.toThrow("keyword IDs: 2");
  expect(resolveRank).toHaveBeenCalledTimes(2);
  expect(resolveRank).toHaveBeenNthCalledWith(1, expect.objectContaining({ clientIdScope: 1, device: "mobile", country: "SE" }));
  expect(sqlite.prepare("SELECT keyword_id,source,device,position,data_date FROM keyword_rankings").all()).toEqual([
    { keyword_id: 1, source: "gsc", device: "mobile", position: 7, data_date: "2026-09-17" },
  ]);
  expect(shutdownBrowser).toHaveBeenCalledOnce();
});
it("checks only active scoped pages, saves diffs and preserves prior snapshot on failure", async () => {
  vi.mocked(fetchSnapshot).mockResolvedValueOnce({ title: "New title", description: null, h1: null, canonical: null, contentHash: "new" });
  await jobs.checkScheduledPages(1);
  expect(fetchSnapshot).toHaveBeenCalledExactlyOnceWith("https://example.com");
  expect(sqlite.prepare("SELECT last_title FROM monitored_pages ORDER BY id").all()).toEqual([
    { last_title: "New title" }, { last_title: "Paused" }, { last_title: "Other" },
  ]);
  expect(sqlite.prepare("SELECT old_value,new_value FROM page_changes WHERE field='title'").all()).toEqual([{ old_value: "Old title", new_value: "New title" }]);
  vi.mocked(fetchSnapshot).mockResolvedValueOnce(null);
  await expect(jobs.checkScheduledPages(1)).rejects.toThrow("monitor IDs: 1");
  expect(sqlite.prepare("SELECT last_title FROM monitored_pages WHERE id=1").get()).toEqual({ last_title: "New title" });
});
it("rejects nonexistent clients", async () => {
  await expect(jobs.checkScheduledRanks(999)).rejects.toThrow("not found");
  await expect(jobs.checkScheduledPages(0)).rejects.toThrow("Invalid");
});
