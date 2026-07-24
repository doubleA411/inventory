/**
 * Check whether a thrown error is a Postgres unique-constraint violation for
 * the given constraint name.
 *
 * drizzle-orm wraps the underlying postgres.js error: the top-level
 * `.message` is a generic "Failed query: ..." summary, while the actual
 * driver error (with the real Postgres message, e.g.
 * `duplicate key value violates unique constraint "products_org_code_uq"`)
 * lives on `.cause`. Check both so this works regardless of wrapping.
 */
export function isUniqueViolation(e: unknown, constraintName: string): boolean {
  if (!(e instanceof Error)) return false;
  if (e.message.includes(constraintName)) return true;
  const cause = (e as { cause?: unknown }).cause;
  if (cause instanceof Error) return cause.message.includes(constraintName);
  return typeof cause === "string" && cause.includes(constraintName);
}
