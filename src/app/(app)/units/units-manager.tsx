"use client";

import { useActionState, useState } from "react";
import { useRouter } from "next/navigation";
import { Plus, Trash2 } from "lucide-react";
import { Badge } from "@/components/ui";
import {
  createUnitAction,
  createUnitGroupAction,
  deleteUnitAction,
  type ActionState,
} from "./actions";

type Unit = {
  id: string;
  name: string;
  symbol: string;
  factorToBase: string;
  isBase: boolean;
  groupId: string;
  groupName: string;
};
type Group = { id: string; name: string };

export function UnitsManager({
  units,
  groups,
}: {
  units: Unit[];
  groups: Group[];
}) {
  const router = useRouter();
  const [state, formAction, pending] = useActionState<ActionState, FormData>(
    createUnitAction,
    {},
  );
  const [newGroup, setNewGroup] = useState("");
  const [busy, setBusy] = useState(false);

  // Group units by their group name.
  const byGroup = groups.map((g) => ({
    group: g,
    units: units.filter((u) => u.groupId === g.id),
  }));

  async function addGroup() {
    if (!newGroup.trim()) return;
    setBusy(true);
    const res = await createUnitGroupAction(newGroup);
    setBusy(false);
    if (res.ok) {
      setNewGroup("");
      router.refresh();
    } else alert(res.error);
  }

  async function removeUnit(id: string) {
    const res = await deleteUnitAction(id);
    if (res.ok) router.refresh();
    else alert(res.error);
  }

  return (
    <div className="grid gap-6 lg:grid-cols-3">
      <div className="space-y-6 lg:col-span-2">
        {byGroup.map(({ group, units: us }) => (
          <div key={group.id} className="card">
            <div className="border-b border-(--color-border) px-4 py-3 text-sm font-semibold">
              {group.name}
            </div>
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-(--color-border) text-left text-xs uppercase tracking-wide text-(--color-muted)">
                    <th className="px-4 py-2 font-medium">Unit</th>
                    <th className="px-4 py-2 font-medium">Symbol</th>
                    <th className="px-4 py-2 font-medium">1 unit =</th>
                    <th className="px-4 py-2"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-(--color-border)">
                  {us.map((u) => {
                    const base = us.find((x) => x.isBase);
                    return (
                      <tr key={u.id}>
                        <td className="px-4 py-2 font-medium">
                          {u.name}
                          {u.isBase && (
                            <Badge tone="primary">base</Badge>
                          )}
                        </td>
                        <td className="px-4 py-2 font-mono">{u.symbol}</td>
                        <td className="px-4 py-2 text-(--color-muted)">
                          {Number(u.factorToBase)} {base?.symbol ?? ""}
                        </td>
                        <td className="px-4 py-2 text-right">
                          {!u.isBase && (
                            <button
                              className="btn-ghost"
                              onClick={() => removeUnit(u.id)}
                              title="Delete unit"
                            >
                              <Trash2 className="h-4 w-4" />
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        ))}
      </div>

      {/* Add unit + add group */}
      <div className="space-y-6">
        <form action={formAction} className="card space-y-3 p-4">
          <div className="text-sm font-semibold">Add a unit</div>
          <div>
            <label className="label" htmlFor="groupId">
              Unit type
            </label>
            <select id="groupId" name="groupId" className="input" required defaultValue="">
              <option value="" disabled>
                Choose type…
              </option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="name">
                Name
              </label>
              <input id="name" name="name" className="input" placeholder="Bag" required />
            </div>
            <div>
              <label className="label" htmlFor="symbol">
                Symbol
              </label>
              <input id="symbol" name="symbol" className="input" placeholder="bag" required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="factorToBase">
              Equals how many base units?
            </label>
            <input
              id="factorToBase"
              name="factorToBase"
              type="number"
              step="any"
              min="0"
              className="input"
              placeholder="e.g. 25000 (if base = g)"
              required
            />
            <p className="mt-1 text-xs text-(--color-muted)">
              e.g. a 25&nbsp;kg bag = 25000 if the base unit is gram.
            </p>
          </div>
          {state.error && (
            <p className="rounded-lg bg-(--color-danger-soft) px-3 py-2 text-sm text-(--color-danger)">
              {state.error}
            </p>
          )}
          {state.ok && (
            <p className="rounded-lg bg-(--color-ok-soft) px-3 py-2 text-sm text-(--color-ok)">
              Unit added.
            </p>
          )}
          <button className="btn-primary w-full" disabled={pending}>
            <Plus className="h-4 w-4" /> Add unit
          </button>
        </form>

        <div className="card space-y-3 p-4">
          <div className="text-sm font-semibold">Add a unit type</div>
          <p className="text-xs text-(--color-muted)">
            Types group convertible units (e.g. Weight, Volume, Count).
          </p>
          <div className="flex gap-2">
            <input
              className="input"
              placeholder="e.g. Length"
              value={newGroup}
              onChange={(e) => setNewGroup(e.target.value)}
            />
            <button className="btn-outline shrink-0" onClick={addGroup} disabled={busy}>
              Add
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
