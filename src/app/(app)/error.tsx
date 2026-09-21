"use client";

import { useEffect } from "react";
import Link from "next/link";
import { AlertTriangle, RefreshCw } from "lucide-react";

export default function AppError({
  error,
  unstable_retry,
}: {
  error: Error & { digest?: string };
  unstable_retry: () => void;
}) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <div className="mx-auto grid min-h-[60vh] max-w-xl place-items-center px-4 py-12">
      <section className="card w-full p-6 text-center sm:p-8" role="alert">
        <span className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-amber-50 text-amber-700">
          <AlertTriangle className="h-5 w-5" aria-hidden="true" />
        </span>
        <h1 className="mt-4 text-xl font-semibold text-gray-950">This page couldn’t be loaded</h1>
        <p className="mt-2 text-sm leading-6 text-gray-600">
          Your data is unchanged. Try loading the page again, or return to the dashboard and
          continue working.
        </p>
        <div className="mt-6 flex flex-col-reverse justify-center gap-2 sm:flex-row">
          <Link className="btn-secondary justify-center" href="/dashboard">
            Go to dashboard
          </Link>
          <button className="btn-primary justify-center" type="button" onClick={unstable_retry}>
            <RefreshCw className="h-4 w-4" aria-hidden="true" />
            Try again
          </button>
        </div>
        {error.digest ? (
          <p className="mt-5 text-xs text-gray-400">Reference: {error.digest}</p>
        ) : null}
      </section>
    </div>
  );
}
