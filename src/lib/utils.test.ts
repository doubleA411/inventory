import { describe, expect, it } from "vitest";
import { dateInTimeZone, localDateString } from "@/lib/utils";

describe("date helpers", () => {
  it("uses the organisation timezone around a UTC date boundary", () => {
    const instant = new Date("2026-09-20T20:00:00.000Z");
    expect(dateInTimeZone(instant, "UTC")).toBe("2026-09-20");
    expect(dateInTimeZone(instant, "Asia/Kolkata")).toBe("2026-09-21");
    expect(dateInTimeZone(instant, "America/New_York")).toBe("2026-09-20");
  });

  it("formats a Date from its local calendar fields instead of UTC", () => {
    const date = new Date(2026, 0, 5, 0, 30);
    expect(localDateString(date)).toBe("2026-01-05");
  });
});
