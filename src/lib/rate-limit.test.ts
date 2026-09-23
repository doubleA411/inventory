import { describe, it, expect, vi } from "vitest";
import { sql } from "drizzle-orm";
import { db } from "@/lib/db";

vi.mock("next/headers", () => ({ headers: async () => new Headers() }));
const { hit } = await import("./rate-limit");

describe("rate limit", () => {
  it("allows up to the limit, then blocks until the window lapses", async () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await hit(key, 3, 60));
    expect(results).toEqual([true, true, true, false]);

    // Age the window instead of waiting for it.
    await db.execute(sql`update rate_limits set window_start = now() - interval '2 minutes' where key = ${key}`);
    expect(await hit(key, 3, 60)).toBe(true);
  });

  it("counts concurrent attempts atomically", async () => {
    const key = `test:${Date.now()}:${Math.random()}`;
    const results = await Promise.all(Array.from({ length: 10 }, () => hit(key, 5, 60)));
    expect(results.filter(Boolean)).toHaveLength(5);
  });
});
