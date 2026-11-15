/** Mirrors backend/src/lib/permissions.ts: what a role may read or change. */
export type Area = "sales" | "inventory" | "purchasing" | "money" | "payroll" | "hr" | "reports" | "settings";
export type Access = "read" | "write";
export type Permissions = Partial<Record<Area, Access>>;

export const ROLE_LABELS: Record<string, string> = {
  admin: "Administrator",
  manager: "Manager",
  accountant: "Accountant",
  storekeeper: "Storekeeper",
  sales: "Sales",
};

export const ROLE_DESCRIPTIONS: Record<string, string> = {
  admin: "Everything, including staff accounts and company settings.",
  manager: "Runs the business day to day: everything except staff accounts and settings.",
  accountant: "Money, sales, purchasing and payroll. Sees stock but cannot move it.",
  storekeeper: "Stock, receiving goods and production. Sees sales, no money.",
  sales: "Invoices, customers and payments. Sees stock.",
};

export function can(permissions: Permissions | undefined, area: Area | undefined, need: Access = "read") {
  if (!area) return true;
  const access = permissions?.[area];
  if (!access) return false;
  return need === "read" || access === "write";
}
