"use client";

import { motion } from "framer-motion";
import { Layers, Cloud, Building2, Globe, ShieldCheck, Zap } from "lucide-react";

const advantages = [
  { title: "All‑in‑one", icon: Layers, desc: "Accounting, inventory, payroll – all in one place." },
  { title: "Cloud‑native", icon: Cloud, desc: "Access anywhere, real‑time sync." },
  { title: "Multi‑entity", icon: Building2, desc: "Manage multiple companies effortlessly." },
  { title: "Global taxes", icon: Globe, desc: "50+ country tax rules built‑in." },
  { title: "Enterprise security", icon: ShieldCheck, desc: "SOC 2 Type II, encrypted." },
  { title: "Lightning fast", icon: Zap, desc: "Pages load instantly." },
];

export default function Advantages() {
  return (
    <section id="advantages" className="py-24 bg-violet-50/40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <span className="text-sm font-bold text-violet-600 uppercase tracking-wider">Why Biz44</span>
            <h2 className="mt-4 text-4xl sm:text-5xl font-extrabold text-neutral-900">Built for modern teams</h2>
            <p className="mt-4 text-neutral-600 text-lg">No complexity, just power.</p>
          </motion.div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-6">
          {advantages.map(({ title, icon: Icon, desc }, idx) => (
            <motion.div
              key={title}
              initial={{ opacity: 0, scale: 0.9 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.4, delay: idx * 0.05 }}
              whileHover={{ scale: 1.03, y: -5 }}
              className="group relative rounded-2xl border border-violet-100 bg-white p-6 shadow-md hover:shadow-xl transition-all"
            >
              <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-violet-500 to-purple-400 text-white flex items-center justify-center mb-5 shadow-md">
                <Icon size={22} />
              </div>
              <h3 className="text-lg font-bold text-neutral-900">{title}</h3>
              <p className="mt-2 text-sm text-neutral-500">{desc}</p>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}