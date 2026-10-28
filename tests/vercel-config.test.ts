import { existsSync, readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

interface VercelCron {
  path: string;
  schedule: string;
}

const projectRoot = fileURLToPath(new URL("..", import.meta.url));
const vercelConfig = JSON.parse(readFileSync(`${projectRoot}vercel.json`, "utf8")) as {
  crons?: VercelCron[];
};

describe("vercel.json crons", () => {
  it("Supabase keep-alive の Cron だけが登録されている", () => {
    expect(vercelConfig.crons).toEqual([
      { path: "/api/cron/keep-alive", schedule: expect.any(String) },
    ]);
  });

  it("Cron の path に対応する Route Handler が実在する", () => {
    for (const cron of vercelConfig.crons ?? []) {
      expect(existsSync(`${projectRoot}app${cron.path}/route.ts`)).toBe(true);
    }
  });

  it("毎日1回（分・時が固定、日・月・曜日が *）のスケジュールである", () => {
    for (const cron of vercelConfig.crons ?? []) {
      expect(cron.schedule).toMatch(/^\d{1,2} \d{1,2} \* \* \*$/);
    }
  });
});
