"use client";

import { useCallback, useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { Sparkles } from "lucide-react";
import { TOUR_STEPS } from "@/lib/help-content";

const STORAGE_KEY = "sw_onboarded_v1";

function buildSteps(): DriveStep[] {
  return TOUR_STEPS.filter((s) => {
    if (!s.selector) return true;
    const el = document.querySelector(s.selector) as HTMLElement | null;
    // Only include steps whose target is actually rendered & visible.
    return !!el && el.offsetParent !== null;
  }).map((s) => ({
    element: s.selector,
    popover: {
      title: s.title,
      description: s.description,
      side: s.side ?? "bottom",
      align: "start",
    },
  }));
}

export function OnboardingTour({ collapsed = false }: { collapsed?: boolean }) {
  const pathname = usePathname();
  const router = useRouter();

  const startTour = useCallback(() => {
    // Wait until the sidebar targets are actually painted before launching,
    // so the tour never starts with a half-rendered nav (missing steps).
    function waitForTargets(attempt = 0) {
      const ready = document.querySelector('[data-tour="nav-products"]');
      if (ready || attempt > 20) {
        launch();
      } else {
        setTimeout(() => waitForTargets(attempt + 1), 150);
      }
    }

    // Make sure the nav targets exist on this route.
    if (pathname !== "/dashboard") {
      router.push("/dashboard");
    }
    waitForTargets();

    function launch() {
      const steps = buildSteps();
      if (steps.length === 0) return;
      const d = driver({
        showProgress: true,
        allowClose: true,
        nextBtnText: "Next",
        prevBtnText: "Back",
        doneBtnText: "Done",
        popoverClass: "sw-tour",
        steps,
        onDestroyed: () => {
          try {
            localStorage.setItem(STORAGE_KEY, "1");
          } catch {}
        },
      });
      d.drive();
    }
  }, [pathname, router]);

  // Auto-start once for brand-new users.
  useEffect(() => {
    let seen = "1";
    try {
      seen = localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {}
    if (!seen) {
      const t = setTimeout(() => startTour(), 900);
      return () => clearTimeout(t);
    }
  }, [startTour]);

  // Allow other components (e.g. Help page) to trigger the tour.
  useEffect(() => {
    const handler = () => startTour();
    window.addEventListener("sw:start-tour", handler);
    return () => window.removeEventListener("sw:start-tour", handler);
  }, [startTour]);

  return (
    <button
      onClick={startTour}
      className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm font-medium text-(--color-muted) transition-colors hover:bg-(--color-bg) hover:text-(--color-fg)"
      title="Take a quick product tour"
    >
      <Sparkles className="h-4.5 w-4.5" />
      {!collapsed && "Take a tour"}
    </button>
  );
}
