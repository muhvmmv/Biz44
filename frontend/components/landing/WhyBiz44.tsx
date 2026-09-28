import { Layers, Cloud, Building2, Globe, ShieldCheck, Zap } from "lucide-react";

const advantages = [
  {
    title: "Everything in one place",
    icon: Layers,
    desc: "No more juggling spreadsheets and disjointed tools. Biz44 unifies your entire back office.",
  },
  {
    title: "Cloud‑based",
    icon: Cloud,
    desc: "Access your business from anywhere, on any device. Real‑time sync across teams.",
  },
  {
    title: "Multi‑business",
    icon: Building2,
    desc: "Manage multiple companies or branches under one account with consolidated views.",
  },
  {
    title: "Multi‑country taxes",
    icon: Globe,
    desc: "Built‑in tax rules for 50+ countries. Stay compliant wherever you operate.",
  },
  {
    title: "Enterprise security",
    icon: ShieldCheck,
    desc: "SOC 2 Type II certified, with encryption at rest and in transit. Your data is safe.",
  },
  {
    title: "Blazing fast",
    icon: Zap,
    desc: "Optimised for speed. Pages load instantly, reports generate in seconds.",
  },
];

export default function WhyBiz44() {
  return (
    <section id="about" className="py-24 bg-neutral-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto">
          <p className="text-sm font-semibold text-emerald-600 uppercase tracking-wide">
            Why Biz44
          </p>
          <h2 className="mt-4 text-3xl sm:text-4xl font-bold text-neutral-900">
            Built for modern businesses
          </h2>
          <p className="mt-4 text-neutral-600">
            Everything you expect from a premium ERP, without the complexity.
          </p>
        </div>
        <div className="mt-16 grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {advantages.map(({ title, icon: Icon, desc }) => (
            <div
              key={title}
              className="group relative rounded-2xl border border-neutral-200 bg-white p-6 shadow-sm hover:shadow-md transition-shadow"
            >
              <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-5">
                <Icon size={20} />
              </div>
              <h3 className="text-lg font-semibold text-neutral-900">{title}</h3>
              <p className="mt-2 text-sm text-neutral-500 leading-relaxed">{desc}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}