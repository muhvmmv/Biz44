"use client";

import { motion } from "framer-motion";
import {
  Calculator, Package, Users, BarChart3, FileText, Receipt, Wallet, ShieldCheck,
} from "lucide-react";

const features = [
  { title: "Accounting", icon: Calculator, color: "bg-emerald-50 text-emerald-600" },
  { title: "Inventory", icon: Package, color: "bg-sky-50 text-sky-600" },
  { title: "Payroll", icon: Wallet, color: "bg-violet-50 text-violet-600" },
  { title: "Employees", icon: Users, color: "bg-amber-50 text-amber-600" },
  { title: "Analytics", icon: BarChart3, color: "bg-rose-50 text-rose-600" },
  { title: "Reports", icon: FileText, color: "bg-teal-50 text-teal-600" },
  { title: "Tax", icon: Receipt, color: "bg-indigo-50 text-indigo-600" },
  { title: "Invoices", icon: ShieldCheck, color: "bg-orange-50 text-orange-600" },
];

export default function Features() {
  return (
    <section id="features" className="py-24 bg-brand-50/30">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <span className="text-sm font-bold text-brand uppercase tracking-wider">Core Modules</span>
            <h2 className="mt-4 text-4xl sm:text-5xl font-extrabold text-neutral-900">
              Everything you need,{" "}
              <span className="bg-gradient-to-r from-brand to-accent bg-clip-text text-transparent">beautifully integrated</span>
            </h2>
            <p className="mt-4 text-neutral-600 text-lg">Modern tools that feel like magic.</p>
          </motion.div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {features.map(({ title, icon: Icon, color }, idx) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, y: 40 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.05 }}
              whileHover={{ y: -5, scale: 1.02 }}
              className="group relative rounded-2xl border border-white/60 bg-white/80 backdrop-blur-sm p-6 shadow-md hover:shadow-xl transition-shadow"
            >
              <div className={`w-12 h-12 rounded-xl ${color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                <Icon size={22} />
              </div>
              <h3 className="text-lg font-bold text-neutral-900">{title}</h3>
              <p className="mt-2 text-sm text-neutral-500">Powerful {title.toLowerCase()} tools for modern businesses.</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}