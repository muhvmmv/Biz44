"use client";

import { motion } from "framer-motion";

const screens = [
  { title: "Smart Dashboard", badge: "Live" },
  { title: "Inventory", badge: "New" },
  { title: "Accounting", badge: "Popular" },
  { title: "Payroll", badge: "Coming" },
];

export default function Screenshots() {
  return (
    <section id="screenshots" className="py-24 bg-amber-50/60">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="text-center max-w-2xl mx-auto mb-16">
          <motion.div initial={{ opacity: 0, y: 20 }} whileInView={{ opacity: 1, y: 0 }} viewport={{ once: true }}>
            <span className="text-sm font-bold text-amber-600 uppercase tracking-wider">Beautiful interface</span>
            <h2 className="mt-4 text-4xl sm:text-5xl font-extrabold text-neutral-900">See Biz44 in action</h2>
            <p className="mt-4 text-neutral-600 text-lg">Every screen is designed for clarity and speed.</p>
          </motion.div>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6">
          {screens.map((screen, idx) => (
            <motion.div
              key={screen.title}
              initial={{ opacity: 0, scale: 0.95 }}
              whileInView={{ opacity: 1, scale: 1 }}
              viewport={{ once: true }}
              transition={{ duration: 0.5, delay: idx * 0.1 }}
              whileHover={{ y: -8 }}
              className="group relative bg-white rounded-2xl overflow-hidden shadow-md hover:shadow-2xl transition-all border border-amber-100"
            >
              <div className="h-48 bg-gradient-to-br from-amber-100 to-orange-50 flex items-center justify-center">
                <span className="text-3xl font-black text-amber-300 group-hover:scale-110 transition-transform">
                  {screen.title.split(" ")[0]}
                </span>
                <span className="absolute top-3 right-3 bg-white/90 text-xs font-bold text-amber-600 px-3 py-1 rounded-full shadow">
                  {screen.badge}
                </span>
              </div>
              <div className="p-5">
                <h3 className="font-bold text-neutral-900">{screen.title}</h3>
                <p className="text-sm text-neutral-500 mt-1">Real-time {screen.title.toLowerCase()} view</p>
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}