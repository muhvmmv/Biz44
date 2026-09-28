"use client";

import Link from "next/link";
import { ArrowRight, Play } from "lucide-react";
import { motion } from "framer-motion";

export default function Hero() {
  return (
    <section className="relative bg-gradient-to-b from-purple-50 to-purple-100/40 pt-24 pb-32 sm:pt-28 sm:pb-40 overflow-hidden">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid lg:grid-cols-2 gap-16 items-center">
          <motion.div
            initial={{ opacity: 0, x: -30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.2 }}
            className="space-y-8"
          >
            <div className="inline-flex items-center gap-2 bg-purple-100/80 text-purple-700 px-4 py-2 rounded-full text-sm font-semibold backdrop-blur-sm">
              ✨ The all‑in‑one business platform
            </div>
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-extrabold tracking-tight text-neutral-900 leading-[1.1]">
              Run your entire business
              <br />
              <span className="bg-gradient-to-r from-purple-600 to-pink-400 bg-clip-text text-transparent">
                from one beautiful place.
              </span>
            </h1>
            <p className="text-lg sm:text-xl text-neutral-600 max-w-xl leading-relaxed">
              Biz44 combines accounting, inventory, payroll, and advanced analytics into a
              stunningly simple platform. Stop juggling tools and start growing.
            </p>
            <div className="flex flex-col sm:flex-row gap-4">
              <Link
                href="/auth/register"
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-purple-600 to-pink-400 px-7 py-4 text-base font-semibold text-white shadow-xl shadow-purple-200 hover:scale-105 transition-all"
              >
                Start Free
                <ArrowRight size={18} />
              </Link>
              <Link
                href="/demo"
                className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-neutral-200 bg-white px-7 py-4 text-base font-semibold text-neutral-700 hover:border-purple-200 hover:text-purple-600 transition-all"
              >
                <Play size={18} />
                Book Demo
              </Link>
            </div>
          </motion.div>

          {/* Dashboard mockup stays unchanged */}
          <motion.div
            initial={{ opacity: 0, x: 30 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.7, delay: 0.4 }}
            className="relative"
          >
            <div className="relative rounded-2xl border border-neutral-200 bg-white shadow-2xl overflow-hidden rotate-1 hover:rotate-0 transition-transform duration-500">
              <div className="flex items-center gap-2 border-b border-neutral-100 px-5 py-3">
                <div className="flex gap-1.5">
                  <div className="w-3 h-3 rounded-full bg-red-400" />
                  <div className="w-3 h-3 rounded-full bg-amber-400" />
                  <div className="w-3 h-3 rounded-full bg-emerald-400" />
                </div>
                <div className="text-xs text-neutral-400 ml-2">Biz44 Dashboard</div>
              </div>
              <div className="p-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <motion.div whileHover={{ y: -3 }} className="bg-neutral-50 rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-neutral-500">Revenue</p>
                    <p className="text-xl font-bold text-neutral-900">$48,290</p>
                    <p className="text-xs text-emerald-600">+12.5%</p>
                  </motion.div>
                  <motion.div whileHover={{ y: -3 }} className="bg-neutral-50 rounded-xl p-4 shadow-sm">
                    <p className="text-xs text-neutral-500">Expenses</p>
                    <p className="text-xl font-bold text-neutral-900">$18,430</p>
                    <p className="text-xs text-red-500">+3.2%</p>
                  </motion.div>
                </div>
                <div className="bg-neutral-50 rounded-xl p-5 h-32 flex items-end gap-2">
                  {[40, 70, 45, 90, 60, 80].map((h, i) => (
                    <motion.div
                      key={i}
                      whileHover={{ scaleY: 1.2 }}
                      className="w-1/6 bg-gradient-to-t from-purple-400 to-pink-300 rounded-t-lg"
                      style={{ height: `${h}%` }}
                    />
                  ))}
                </div>
                <div className="space-y-2">
                  <p className="text-xs font-medium text-neutral-500">Recent transactions</p>
                  {["Invoice #1023", "Payroll Mar", "Office Supplies"].map((item) => (
                    <div key={item} className="flex justify-between text-sm text-neutral-700 py-2 border-b border-neutral-100">
                      <span>{item}</span>
                      <span className="font-medium">$2,450</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="absolute -inset-2 rounded-2xl bg-gradient-to-r from-purple-100 to-pink-100 opacity-30 blur-2xl -z-10" />
          </motion.div>
        </div>
      </div>
    </section>
  );
}