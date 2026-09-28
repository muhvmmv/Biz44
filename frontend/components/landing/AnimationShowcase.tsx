"use client";

import { motion } from "framer-motion";

export default function AnimationShowcase() {
  return (
    <section className="py-24 bg-neutral-50 relative overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
        <h2 className="text-4xl font-extrabold text-neutral-900">
          Smooth. Responsive. <span className="text-brand">Delightful.</span>
        </h2>
        <p className="mt-4 text-neutral-600 text-lg max-w-2xl mx-auto">
          Every interaction is crafted with micro‑animations that make work feel effortless.
        </p>
      </div>

      <motion.div
        className="mt-16 relative mx-auto max-w-5xl rounded-3xl bg-white shadow-2xl border border-neutral-200 overflow-hidden"
        initial={{ opacity: 0, y: 60 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true }}
        transition={{ duration: 0.8 }}
      >
        <div className="flex items-center gap-2 border-b border-neutral-100 px-6 py-4">
          <div className="flex gap-1.5">
            <div className="w-3 h-3 rounded-full bg-red-400" />
            <div className="w-3 h-3 rounded-full bg-amber-400" />
            <div className="w-3 h-3 rounded-full bg-emerald-400" />
          </div>
          <span className="text-xs text-neutral-400 ml-3">Biz44 / Inventory</span>
        </div>
        <div className="p-8 grid grid-cols-1 md:grid-cols-3 gap-6">
          {[1, 2, 3].map((col) => (
            <motion.div
              key={col}
              whileHover={{ y: -5 }}
              className="bg-neutral-50 rounded-xl p-5 space-y-4"
            >
              <div className="h-2 w-3/4 bg-neutral-200 rounded-full" />
              <div className="space-y-2">
                {[1, 2, 3].map((row) => (
                  <div key={row} className="h-1.5 bg-neutral-100 rounded-full" />
                ))}
              </div>
              <div className="h-24 bg-gradient-to-br from-brand-100 to-accent-100 rounded-lg" />
            </motion.div>
          ))}
        </div>
      </motion.div>

      <motion.div
        animate={{ rotate: 360 }}
        transition={{ repeat: Infinity, duration: 30, ease: "linear" }}
        className="absolute -top-20 -right-20 w-64 h-64 bg-brand-100 rounded-full opacity-20 blur-3xl"
      />
      <motion.div
        animate={{ rotate: -360 }}
        transition={{ repeat: Infinity, duration: 25, ease: "linear" }}
        className="absolute -bottom-20 -left-20 w-72 h-72 bg-accent-100 rounded-full opacity-20 blur-3xl"
      />
    </section>
  );
}