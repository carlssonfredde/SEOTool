import { afterEach, expect, it, vi } from "vitest";
import { getSetting, setSetting } from "./settings-store";
import { startScheduler, tickScheduler } from "./scheduler";

vi.mock("./settings-store", () => ({ getSetting: vi.fn(), setSetting: vi.fn() }));
afterEach(() => { vi.unstubAllEnvs(); vi.useRealTimers(); vi.clearAllMocks(); });

it("keeps both dashboard-triggered and timed work disabled for a manual pilot", async () => {
  vi.stubEnv("SEO_DISABLE_SCHEDULER", "1");
  vi.useFakeTimers();
  startScheduler();
  await tickScheduler();
  expect(vi.getTimerCount()).toBe(0);
  expect(getSetting).not.toHaveBeenCalled();
  expect(setSetting).not.toHaveBeenCalled();
});
