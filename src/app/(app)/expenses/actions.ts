"use server";

import { revalidatePath } from "next/cache";
import { requireRole } from "@/lib/auth";
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
  if (result.ok) revalidatePath("/expenses");
  return result;
}

export async function deleteExpenseAction(id: string): Promise<void> {
  const { organization } = await requireRole("admin");
  await deleteExpense(organization.id, id);
  revalidatePath("/expenses");
}

export async function saveExpenseCategoryAction(
  name: string,
): Promise<{ ok: true; id: string; name: string } | { ok: false; error: string }> {
  const { organization } = await requireRole("admin");
  const result = await saveExpenseCategory(organization.id, name);
  if (result.ok) revalidatePath("/expenses");
  return result;
}

export async function deleteExpenseCategoryAction(id: string): Promise<void> {
  const { organization } = await requireRole("admin");
  await deleteExpenseCategory(organization.id, id);
  revalidatePath("/expenses");
}
