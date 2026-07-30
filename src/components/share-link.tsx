"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Share2, Copy, Check, X } from "lucide-react";

export function ShareLink({
  initialToken,
  shareBasePath,
  waMessage,
  waPhone,
  onCreate,
  onRevoke,
}: {
  initialToken: string | null;
  shareBasePath: string;
  waMessage: string;
  waPhone: string | null;
  onCreate: () => Promise<{ token: string }>;
  onRevoke: () => Promise<void>;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  const [token, setToken] = useState(initialToken);
  const [copied, setCopied] = useState(false);

  const shareUrl =
    token && typeof window !== "undefined" ? `${window.location.origin}${shareBasePath}/${token}` : null;

  function create() {
    start(async () => {
      const res = await onCreate();
      setToken(res.token);
      router.refresh();
    });
  }

  function revoke() {
    if (!confirm("Revoke this share link? The old link stops working immediately.")) return;
    start(async () => {
      await onRevoke();
      setToken(null);
      router.refresh();
    });
  }

  function copy() {
    if (!shareUrl) return;
    navigator.clipboard.writeText(shareUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  }

  if (!token) {
    return (
      <button className="btn-outline" onClick={create} disabled={pending}>
        <Share2 className="h-4 w-4" /> {pending ? "Creating…" : "Create share link"}
      </button>
    );
  }

  const waHref = `https://wa.me/${waPhone ?? ""}?text=${encodeURIComponent(`${waMessage}\n${shareUrl}`)}`;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <a href={waHref} target="_blank" rel="noopener noreferrer" className="btn-primary">
        Send on WhatsApp
      </a>
      <button type="button" className="btn-outline" onClick={copy}>
        {copied ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
        {copied ? "Copied" : "Copy link"}
      </button>
      <button type="button" className="btn-ghost" onClick={revoke} disabled={pending}>
        <X className="h-4 w-4" /> Revoke
      </button>
    </div>
  );
}
