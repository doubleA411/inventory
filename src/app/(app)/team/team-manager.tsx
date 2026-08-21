"use client";

import { useActionState, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { UserPlus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui";
import { ConfirmButton } from "@/components/confirm-button";
import { fmtDate } from "@/lib/utils";
import {
  inviteMemberAction,
  removeMemberAction,
  type ActionState,
} from "./actions";

type Member = {
  membershipId: string;
  userId: string;
  name: string;
  email: string;
  role: "owner" | "admin" | "staff";
  createdAt: Date;
};

export function TeamManager({
  members,
  currentUserId,
}: {
  members: Member[];
  currentUserId: string;
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    inviteMemberAction,
    {},
  );

  useEffect(() => {
    if (state.ok) router.refresh();
  }, [state, router]);

  const [removeError, setRemoveError] = useState<string | null>(null);

  async function remove(id: string) {
    setRemoveError(null);
    const res = await removeMemberAction(id);
    if (res.ok) router.refresh();
    // Was an alert() — a dialog the user has to dismiss before they can even
    // re-read the row it was about.
    else setRemoveError(res.error ?? "Could not remove that person.");
  }

  const roleTone = { owner: "primary", admin: "ok", staff: "default" } as const;

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="lg:col-span-2">
        <div className="card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                <th className="px-4 py-3 font-medium">Member</th>
                <th className="px-4 py-3 font-medium">Role</th>
                <th className="px-4 py-3 font-medium">Added</th>
                <th className="px-4 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-(--color-border)">
              {members.map((m) => (
                <tr key={m.membershipId}>
                  <td className="px-4 py-3">
                    <div className="font-medium">
                      {m.name}
                      {m.userId === currentUserId && (
                        <span className="ml-2 text-xs text-(--color-muted)">(you)</span>
                      )}
                    </div>
                    <div className="text-xs text-(--color-muted)">{m.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <Badge tone={roleTone[m.role]}>{m.role}</Badge>
                  </td>
                  <td className="px-4 py-3 text-(--color-muted)">
                    {fmtDate(m.createdAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    {m.role !== "owner" && m.userId !== currentUserId && (
                      <ConfirmButton
                        compact
                        icon={<Trash2 className="h-4 w-4" />}
                        label=""
                        triggerTitle="Remove from team"
                        question="Remove this person?"
                        confirmLabel="Remove person"
                        busyLabel="Removing…"
                        onConfirm={() => remove(m.membershipId)}
                      />
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {removeError && (
          <p className="border-t border-(--color-border) px-4 py-3 text-sm text-(--color-danger)">
            {removeError}
          </p>
        )}
      </div>

      <form action={formAction} className="card space-y-3 p-4">
        <div className="text-sm font-semibold">Invite a team member</div>
        <div>
          <label className="label" htmlFor="name">Name</label>
          <input id="name" name="name" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="email">Email</label>
          <input id="email" name="email" type="email" className="input" required />
        </div>
        <div>
          <label className="label" htmlFor="password">Temporary password</label>
          <input id="password" name="password" type="text" className="input" required minLength={6} />
          <p className="mt-1 text-xs text-(--color-muted)">
            Share this with them; they can change it later.
          </p>
        </div>
        <div>
          <label className="label" htmlFor="role">Role</label>
          <select id="role" name="role" className="input" defaultValue="staff">
            <option value="staff">Staff — log stock, view</option>
            <option value="admin">Admin — full access</option>
          </select>
        </div>
        {state.error && (
          <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
            {state.error}
          </p>
        )}
        {state.ok && (
          <p className="rounded-lg bg-(--color-ok-soft) px-3 py-2 text-sm text-(--color-ok)">
            Member added.
          </p>
        )}
        <button className="btn-primary w-full" disabled={pending}>
          <UserPlus className="h-4 w-4" /> Add member
        </button>
      </form>
    </div>
  );
}
