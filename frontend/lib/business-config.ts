export type BusinessType =
  | "retail"
  | "services"
  | "manufacturing"
  | "healthcare"
  | "logistics"
  | "restaurant"
  | "education"
  | "other";

export interface BusinessConfig {
  label: string;
  priorities: string[]; // ordered list of module keys
  quickActions: string[];
  kpis: string[];
}

export const businessConfigs: Record<BusinessType, BusinessConfig> = {
  retail: {
    label: "Retail",
    priorities: ["inventory", "customers", "invoices", "suppliers", "accounting", "reports"],
    quickActions: ["create-invoice", "add-product", "receive-inventory", "add-customer"],
    kpis: ["revenue", "profit", "inventory", "outstanding"],
  },
  services: {
    label: "Services",
    priorities: ["customers", "invoices", "employees", "accounting", "reports"],
    quickActions: ["create-invoice", "add-customer", "record-expense"],
    kpis: ["revenue", "outstanding", "profit", "cashflow"],
  },
  manufacturing: {
    label: "Manufacturing",
    priorities: ["inventory", "suppliers", "invoices", "accounting", "reports"],
    quickActions: ["receive-inventory", "add-product", "create-invoice"],
    kpis: ["revenue", "profit", "inventory", "outstanding"],
  },
  healthcare: {
    label: "Healthcare",
    priorities: ["customers", "invoices", "employees", "inventory", "reports"],
    quickActions: ["create-invoice", "add-customer", "record-expense"],
    kpis: ["revenue", "outstanding", "profit", "cashflow"],
  },
  logistics: {
    label: "Logistics",
    priorities: ["customers", "employees", "invoices", "accounting", "reports"],
    quickActions: ["create-invoice", "add-customer", "record-expense"],
    kpis: ["revenue", "profit", "cashflow", "outstanding"],
  },
  restaurant: {
    label: "Restaurant",
    priorities: ["inventory", "invoices", "suppliers", "employees", "reports"],
    quickActions: ["create-invoice", "receive-inventory", "add-product"],
    kpis: ["revenue", "profit", "inventory", "outstanding"],
  },
  education: {
    label: "Education",
    priorities: ["customers", "invoices", "employees", "accounting", "reports"],
    quickActions: ["create-invoice", "add-customer", "record-expense"],
    kpis: ["revenue", "outstanding", "profit", "cashflow"],
  },
  other: {
    label: "Business",
    priorities: ["customers", "invoices", "inventory", "accounting", "reports"],
    quickActions: ["create-invoice", "add-customer", "record-expense", "receive-inventory"],
    kpis: ["revenue", "profit", "cashflow", "outstanding"],
  },
};

export function getBusinessConfig(type: string | null | undefined): BusinessConfig {
  const key = (type as BusinessType) || "other";
  return businessConfigs[key] || businessConfigs.other;
}