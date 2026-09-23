"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
import { db } from "@/lib/db";
import { auditLabel, recordAudit } from "@/lib/audit";
import { fmtMoney } from "@/lib/utils";
import {
  saveExpense,
  deleteExpense,
  saveExpenseCategory,
  deleteExpenseCategory,
  type ExpenseInput,
  type SaveResult,
} from "@/lib/expenses";

export async function saveExpenseAction(raw: ExpenseInput): Promise<SaveResult> {
  const { organization, user } = await requireRole("admin");
  const result = await saveExpense(organization.id, user.id, raw);
  if (result.ok) {
    await recordAudit({
      orgId: organization.id,
      action: raw.id ? "expense.updated" : "expense.created",
      entityType: "expense",
      entityId: result.id,
      summary: `${raw.id ? "Updated" : "Recorded"} expense of ${fmtMoney(raw.amount)}`,
      details: { amount: raw.amount, date: raw.expenseDate },
      actorUserId: user.id,
    });
    revalidatePath("/expenses");
  }
  return result;
}

export async function deleteExpenseAction(id: string): Promise<void> {
  const { organization, user } = await requireRole("admin");
  await deleteExpense(organization.id, id, user.id);
  await recordAudit({
    orgId: organization.id,
    action: "expense.archived",
    entityType: "expense",
    entityId: id,
    summary: "Archived expense",
    actorUserId: user.id,
  });
  revalidatePath("/expenses");
}

export async function saveExpenseCategoryAction(
  name: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const { organization, user } = await requireRole("admin");
  const result = await saveExpenseCategory(organization.id, name);
  if (result.ok) {
    await recordAudit({
      orgId: organization.id,
      action: "expense_category.created",
      entityType: "expense_category",
      entityId: result.id,
      entityLabel: result.name,
      summary: `Created expense category ${result.name}`,
      actorUserId: user.id,
    });
    revalidatePath("/expenses");
  }
  return result;
}

export async function deleteExpenseCategoryAction(id: string): Promise<void> {
  const { organization, user } = await requireRole("admin");
  const name = await auditLabel(db, organization.id, "expense_category", id);
  await deleteExpenseCategory(organization.id, id);
  await recordAudit({
    orgId: organization.id,
    action: "expense_category.deleted",
    entityType: "expense_category",
    entityId: id,
    entityLabel: name,
    summary: "Deleted expense category",
    actorUserId: user.id,
  });
  revalidatePath("/expenses");
}
