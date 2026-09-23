import "server-only";
import { createHash, timingSafeEqual } from "node:crypto";

/**
 * True when the Authorization header carries `Bearer <CRON_SECRET>`. Compared
 * as fixed-length digests in constant time, so response timing reveals
 * nothing about how much of a guess was right.
 */
export function hasCronSecret(authorization: string | null): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret || !authorization) return false;
  const digest = (s: string) => createHash("sha256").update(s).digest();
  return timingSafeEqual(digest(authorization), digest(`Bearer ${secret}`));
}
