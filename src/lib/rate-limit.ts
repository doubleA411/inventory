import "server-only";

import { sql } from "drizzle-orm";
import { headers } from "next/headers";
import { db } from "@/lib/db";

/**
 * Fixed-window rate limiting backed by the rate_limits table.
 *
 * There is no Redis in this stack, and a per-instance in-memory counter is
 * useless on serverless — every cold instance would start from zero. One
 * atomic upsert per attempt is cheap next to the bcrypt compare it guards.
 */
export async function hit(key: string, limit: number, windowSeconds: number): Promise<boolean> {
  const rows = await db.execute<{ count: number }>(sql`
    insert into rate_limits (key, count, window_start)
    values (${key}, 1, now())
    on conflict (key) do update set
      count = case
        when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
          then 1 else rate_limits.count + 1 end,
      window_start = case
        when rate_limits.window_start < now() - make_interval(secs => ${windowSeconds})
          then now() else rate_limits.window_start end
    returning count
  `);
  return Number(rows[0]?.count ?? 0) <= limit;
}

/**
 * Count one attempt against every key; allowed only if all are under their
 * limit. Every key is counted even after one trips, so hammering one account
 * from many IPs still exhausts the per-account budget.
 */
export async function allowAttempt(
  checks: { key: string; limit: number; windowSeconds: number }[],
): Promise<boolean> {
  let allowed = true;
  for (const c of checks) {
    if (!(await hit(c.key, c.limit, c.windowSeconds))) allowed = false;
  }
  return allowed;
}

/**
 * The caller's IP. On Vercel the platform sets x-forwarded-for itself (the
 * client can't prepend a spoofed hop), and its first entry is the client.
 */
export async function clientIp(): Promise<string> {
  const h = await headers();
  return (
    h.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    h.get("x-real-ip")?.trim() ||
    "unknown"
  );
}

export const MINUTE = 60;
export const HOUR = 60 * MINUTE;
