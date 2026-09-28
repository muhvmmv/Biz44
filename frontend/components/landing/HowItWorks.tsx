"use client";

import { motion } from "framer-motion";
import { UserPlus, Settings, Rocket } from "lucide-react";

const steps = [
  {
    number: "01",
    title: "Create your free account",
    desc: "Sign up in seconds, no credit card required. Choose your industry and we’ll tailor the experience.",
    icon: UserPlus,
  },
  {
    number: "02",
    title: "Configure your company",
    desc: "Add your team, connect bank accounts, set up tax profiles. Everything auto‑syncs.",
    icon: Settings,
  },
  {
    number: "03",
    title: "Launch & grow",
    desc: "Run payroll, send invoices, track inventory — all from one intuitive dashboard.",
    icon: Rocket,
  },
];

export default function HowItWorks() {
  return (
    <section className="py-24 bg-brand-50/50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <span className="text-sm font-bold text-brand uppercase tracking-wider">Get started</span>
            <h2 className="mt-4 text-4xl sm:text-5xl font-extrabold text-neutral-900">
              How it works
            </h2>
            <p className="mt-4 text-neutral-600 text-lg">Three simple steps to transform your business.</p>
          </motion.div>
        </div>

        <div className="grid md:grid-cols-3 gap-8">
          {steps.map((step, idx) => {
            const Icon = step.icon;
            return (
              <motion.div
                key={step.number}
                initial={{ opacity: 0, y: 30 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ duration: 0.5, delay: idx * 0.15 }}
                className="relative bg-white rounded-2xl p-8 shadow-md hover:shadow-xl transition-shadow border border-white/60"
              >
                <span className="absolute top-4 right-6 text-5xl font-black text-brand-100">{step.number}</span>
                <div className="w-12 h-12 rounded-xl bg-brand-100 text-brand flex items-center justify-center mb-6">
                  <Icon size={24} />
                </div>
                <h3 className="text-xl font-bold text-neutral-900">{step.title}</h3>
                <p className="mt-3 text-neutral-600">{step.desc}</p>
              </motion.div>
            );
          })}
        </div>
      </div>
    </section>
  );
}