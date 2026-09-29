import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { getSetting, setSetting } from "./settings-store";
import { startScheduler, tickScheduler, schedulerStatus } from "./scheduler";
import { checkScheduledPages, checkScheduledRanks } from "./scheduled-monitoring";

vi.mock("./settings-store", () => ({ getSetting: vi.fn(), setSetting: vi.fn() }));
vi.mock("./scheduled-monitoring", () => ({ checkScheduledRanks: vi.fn(), checkScheduledPages: vi.fn() }));
const settings = new Map<string, unknown>();
beforeEach(() => {
  settings.clear();
  vi.stubEnv("SEO_DISABLE_SCHEDULER", "0");
  vi.stubEnv("SEO_MCP_READ_ONLY", "0");
  vi.stubEnv("SEO_SCHEDULER_MODE", "monitoring");
  vi.stubEnv("SEO_MONITOR_CLIENT_ID", "1");
  vi.mocked(getSetting).mockImplementation(async key => settings.get(key) ?? null);
  vi.mocked(setSetting).mockImplementation(async (key, value) => { settings.set(key, value); });
});
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.resetAllMocks(); });

it.each(["SEO_DISABLE_SCHEDULER", "SEO_MCP_READ_ONLY"])("honors %s for dashboard and boot", async key => {
  vi.stubEnv(key, "1");
  vi.useFakeTimers();
  startScheduler();
  await tickScheduler();
  expect(vi.getTimerCount()).toBe(0);
  expect(getSetting).not.toHaveBeenCalled();
});
it("runs only scoped collection once per day, including after module reload", async () => {
  await Promise.all([tickScheduler(), tickScheduler()]);
  expect(checkScheduledRanks).toHaveBeenCalledExactlyOnceWith(1);
  expect(checkScheduledPages).toHaveBeenCalledExactlyOnceWith(1);
  expect((await schedulerStatus()).map(r => r.id)).toEqual(["monitoring_ranks_1", "monitoring_pages_1"]);
  vi.resetModules();
  const reloaded = await import("./scheduler");
  await reloaded.tickScheduler();
  expect(checkScheduledRanks).toHaveBeenCalledTimes(1);
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 24 * 60 * 60_000 + 1);
  await reloaded.tickScheduler();
  expect(checkScheduledRanks).toHaveBeenCalledTimes(2);
});
it.each(["", "0", "1.5", "NaN", "1e2"])("fails closed for invalid client %s", async id => {
  vi.stubEnv("SEO_MONITOR_CLIENT_ID", id);
  await expect(tickScheduler()).rejects.toThrow("SEO_MONITOR_CLIENT_ID");
  expect(setSetting).not.toHaveBeenCalled();
});
it("does not fall back to the autonomous scheduler for a typo", async () => {
  vi.stubEnv("SEO_SCHEDULER_MODE", "monitor");
  await expect(tickScheduler()).rejects.toThrow("Invalid SEO_SCHEDULER_MODE");
});
it("records failures without marking success and still runs page checks", async () => {
  vi.mocked(checkScheduledRanks).mockRejectedValueOnce(new Error("collection failed"));
  await tickScheduler();
  expect(settings.get("scheduler.monitoring_ranks_1.finished_at")).toBeUndefined();
  expect(settings.get("scheduler.monitoring_ranks_1.last_error")).toBe("collection failed");
  expect(checkScheduledPages).toHaveBeenCalledOnce();
  await tickScheduler();
  expect(checkScheduledRanks).toHaveBeenCalledOnce();
  vi.useFakeTimers();
  vi.setSystemTime(Date.now() + 30 * 60_000 + 1);
  await tickScheduler();
  expect(checkScheduledRanks).toHaveBeenCalledTimes(2);
  expect(settings.get("scheduler.monitoring_ranks_1.last_error")).toBeNull();
});
