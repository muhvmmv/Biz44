"use client";

import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { motion } from "framer-motion";

export default function CTA() {
  return (
    <section className="py-24 bg-gradient-to-b from-sky-50 to-white">
      <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8">
        <motion.div
          initial={{ opacity: 0, y: 40 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true }}
          className="relative rounded-3xl bg-gradient-to-br from-brand to-emerald-600 p-10 sm:p-16 text-center shadow-2xl overflow-hidden"
        >
          <h2 className="text-3xl sm:text-4xl font-extrabold text-white">
            Ready to scale your business?
          </h2>
          <p className="mt-4 text-lg text-emerald-100 max-w-xl mx-auto">
            Join thousands of forward‑thinking companies that trust Biz44.
          </p>
          <div className="mt-8 flex flex-col sm:flex-row justify-center gap-4">
            <Link
              href="/auth/register"
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-white px-8 py-4 text-base font-bold text-brand shadow-lg hover:scale-105 transition-all"
            >
              Start Free
              <ArrowRight size={18} />
            </Link>
            <Link
              href="/contact"
              className="inline-flex items-center justify-center gap-2 rounded-xl border-2 border-white/50 bg-transparent px-8 py-4 text-base font-bold text-white hover:bg-white/10 transition-all"
            >
              Talk to sales
            </Link>
          </div>
          <div className="absolute -top-20 -right-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
          <div className="absolute -bottom-20 -left-20 w-80 h-80 bg-white/10 rounded-full blur-3xl" />
        </motion.div>
      </div>
    </section>
  );
}