import Link from "next/link";
import { redirect } from "next/navigation";
import { getAuthContext } from "@/lib/auth";
import { LoginForm } from "./login-form";

export default async function LoginPage() {
  const ctx = await getAuthContext();
  if (ctx) redirect("/dashboard");

  return (
    <div className="min-h-full grid place-items-center px-4 py-12">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 grid h-14 w-14 place-items-center rounded-2xl bg-(--color-primary)">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src="/icon.svg" alt="" className="h-9 w-9" />
          </div>
          <h1 className="text-xl font-semibold">StockKitchen</h1>
          <p className="mt-1 text-sm text-(--color-muted)">
            Sign in to manage your inventory
          </p>
        </div>

        <div className="card p-6">
          <LoginForm />
        </div>

        <p className="mt-6 text-center text-sm text-(--color-muted)">
          New here?{" "}
          <Link href="/signup" className="font-medium text-(--color-primary) hover:underline">
            Create a workspace
          </Link>
        </p>
        <p className="mt-3 text-center text-xs text-(--color-muted)">
          Demo login: <span className="font-mono">owner@catering.local</span> /{" "}
          <span className="font-mono">password123</span>
        </p>
      </div>
    </div>
  );
}
