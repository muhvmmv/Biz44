/**
 * Roles and what each may do. Every API area is either readable ('read'),
 * readable and changeable ('write'), or hidden (absent).
 *
 *   admin        everything, including users and company settings
 *   manager      runs the business day to day: everything except users and settings
 *   accountant   money, sales, purchasing, payroll; sees stock but cannot move it
 *   storekeeper  stock, receiving and production; sees sales; no money
 *   sales        invoices, customers and payments; sees stock
 */
export const ROLES = ['admin', 'manager', 'accountant', 'storekeeper', 'sales'] as const;
export type Role = (typeof ROLES)[number];

export const AREAS = [
  'sales', // invoices, customers, customer payments, receivables
  'inventory', // products, stock, production, bills of materials
  'purchasing', // suppliers, deliveries, supplier returns, payables
  'money', // cash & bank, journal, expenses, VAT, financial reports, paying suppliers
  'payroll',
  'hr', // employees, attendance, leave
  'reports',
  'settings', // company settings, locations, staff accounts
] as const;
export type Area = (typeof AREAS)[number];
export type Access = 'read' | 'write';

const ALL_WRITE = Object.fromEntries(AREAS.map((a) => [a, 'write'])) as Record<Area, Access>;

export const ROLE_ACCESS: Record<Role, Partial<Record<Area, Access>>> = {
  admin: ALL_WRITE,
  manager: {
    sales: 'write', inventory: 'write', purchasing: 'write', money: 'write',
    payroll: 'write', hr: 'write', reports: 'read', settings: 'read',
  },
  accountant: {
    sales: 'write', inventory: 'read', purchasing: 'write', money: 'write',
    payroll: 'write', hr: 'read', reports: 'read', settings: 'read',
  },
  storekeeper: {
    sales: 'read', inventory: 'write', purchasing: 'write', reports: 'read', settings: 'read',
  },
  sales: {
    sales: 'write', inventory: 'read', settings: 'read',
  },
};

export const ROLE_LABELS: Record<Role, string> = {
  admin: 'Administrator',
  manager: 'Manager',
  accountant: 'Accountant',
  storekeeper: 'Storekeeper',
  sales: 'Sales',
};

export function isRole(value: unknown): value is Role {
  return typeof value === 'string' && (ROLES as readonly string[]).includes(value);
}

/** Can this role do `need` in `area`? Unknown roles get nothing. */
export function can(role: string, area: Area, need: Access = 'read'): boolean {
  const access = isRole(role) ? ROLE_ACCESS[role][area] : undefined;
  if (!access) return false;
  return need === 'read' || access === 'write';
}

/** The access map sent to the app so it can hide what a user cannot use. */
export function permissionsFor(role: string): Partial<Record<Area, Access>> {
  return isRole(role) ? ROLE_ACCESS[role] : {};
}
