import { ArrowRight, Box, BarChart3, Wallet, Calculator } from "lucide-react";

const modules = [
  {
    title: "Inventory Management",
    description:
      "Track stock across multiple warehouses in real time. Automatic reorder points, batch tracking, and barcode scanning keep your operations smooth.",
    icon: Box,
    illustration: (
      <div className="relative w-full max-w-md mx-auto">
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-lg p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-medium text-sm">Warehouse A</h4>
            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">In Stock</span>
          </div>
          <div className="space-y-2">
            {["SKU-2394", "SKU-1287", "SKU-4482"].map((sku) => (
              <div key={sku} className="flex justify-between text-sm text-neutral-600">
                <span>{sku}</span>
                <span className="font-medium">320 units</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Accounting",
    description:
      "Automate your bookkeeping with double-entry ledger, bank reconciliation, and real‑time profit & loss statements. Built for compliance.",
    icon: Calculator,
    illustration: (
      <div className="relative w-full max-w-md mx-auto">
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-lg p-5 space-y-4">
          <div className="flex justify-between items-center">
            <h4 className="font-medium text-sm">Profit & Loss</h4>
            <span className="text-xs text-emerald-600 bg-emerald-50 px-2 py-0.5 rounded-full">Q1 2026</span>
          </div>
          <div className="grid grid-cols-2 gap-3 text-sm">
            <div className="bg-neutral-50 p-3 rounded-lg">
              <p className="text-neutral-500">Revenue</p>
              <p className="font-bold">$84,200</p>
            </div>
            <div className="bg-neutral-50 p-3 rounded-lg">
              <p className="text-neutral-500">Expenses</p>
              <p className="font-bold">$42,100</p>
            </div>
          </div>
          <div className="h-2 bg-emerald-100 rounded-full overflow-hidden">
            <div className="w-2/3 h-full bg-emerald-500 rounded-full" />
          </div>
          <p className="text-xs text-neutral-500">Gross margin 50%</p>
        </div>
      </div>
    ),
  },
  {
    title: "Business Analytics",
    description:
      "From cash flow to customer insights, interactive dashboards help you make data-driven decisions in real time.",
    icon: BarChart3,
    illustration: (
      <div className="relative w-full max-w-md mx-auto">
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-lg p-5 space-y-4">
          <h4 className="font-medium text-sm">Monthly Sales</h4>
          <div className="flex items-end gap-2 h-24">
            {[40, 70, 45, 90, 60, 80].map((h, i) => (
              <div
                key={i}
                className="w-1/6 bg-emerald-200 rounded-t-md"
                style={{ height: `${h}%` }}
              />
            ))}
          </div>
          <div className="flex justify-between text-xs text-neutral-500">
            <span>Jan</span><span>Feb</span><span>Mar</span><span>Apr</span><span>May</span><span>Jun</span>
          </div>
        </div>
      </div>
    ),
  },
  {
    title: "Payroll",
    description:
      "Run payroll in minutes with automatic tax calculations, direct deposit, and compliance reporting across multiple countries.",
    icon: Wallet,
    illustration: (
      <div className="relative w-full max-w-md mx-auto">
        <div className="rounded-2xl border border-neutral-200 bg-white shadow-lg p-5 space-y-4">
          <h4 className="font-medium text-sm">March Payroll</h4>
          <div className="space-y-2">
            {["Alice K.", "Bob M.", "Clara D."].map((name) => (
              <div key={name} className="flex justify-between text-sm py-1 border-b border-neutral-100">
                <span>{name}</span>
                <span className="font-medium">$5,200</span>
              </div>
            ))}
          </div>
          <div className="flex justify-between text-sm font-medium border-t pt-2">
            <span>Total</span>
            <span className="text-emerald-600">$15,600</span>
          </div>
        </div>
      </div>
    ),
  },
];

export default function Showcase() {
  return (
    <section id="showcase" className="py-24 bg-white">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-20">
          <p className="text-sm font-semibold text-emerald-600 uppercase tracking-wide">
            Built‑in business modules
          </p>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-neutral-900">
            The tools you need, perfectly integrated
          </h2>
        </div>
        <div className="space-y-32">
          {modules.map((mod, idx) => {
            const isEven = idx % 2 === 0;
            const Icon = mod.icon;
            return (
              <div
                key={mod.title}
                className={`flex flex-col ${isEven ? "lg:flex-row" : "lg:flex-row-reverse"} gap-12 items-center`}
              >
                <div className="flex-1 space-y-5">
                  <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
                    <Icon size={16} />
                    {mod.title}
                  </div>
                  <h3 className="text-2xl sm:text-3xl font-bold text-neutral-900">
                    {mod.title}
                  </h3>
                  <p className="text-neutral-600 leading-relaxed">
                    {mod.description}
                  </p>
                  <a
                    href="#"
                    className="inline-flex items-center gap-2 text-emerald-600 font-semibold hover:text-emerald-700 transition-colors"
                  >
                    Learn more <ArrowRight size={18} />
                  </a>
                </div>
                <div className="flex-1 flex justify-center">
                  {mod.illustration}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}