"use client";

import { useState } from "react";
import Link from "next/link";
import { Menu, X } from "lucide-react";
import { motion } from "framer-motion";

const navLinks = [
  { label: "Why Biz44", href: "/why-biz44" },
  { label: "Features", href: "/features" },
  { label: "Pricing", href: "/pricing" },
  { label: "Help", href: "/help" },
];

export default function Navbar() {
  const [mobileOpen, setMobileOpen] = useState(false);

  return (
    <motion.nav
      initial={{ y: -20, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.4 }}
      className="sticky top-0 z-50 bg-yellow-50/95 backdrop-blur-md border-b border-yellow-200/50"
    >
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between h-16">
        <Link href="/" className="flex items-center gap-2 font-bold text-2xl text-neutral-900">
          <span className="w-8 h-8 bg-gradient-to-br from-yellow-400 to-amber-500 rounded-xl flex items-center justify-center text-white text-sm font-extrabold shadow-md shadow-yellow-200">
            B
          </span>
          Biz44
        </Link>

        <div className="hidden md:flex items-center gap-8">
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="text-sm font-medium text-neutral-700 hover:text-yellow-600 transition-colors"
            >
              {link.label}
            </Link>
          ))}
        </div>

        <div className="hidden md:flex items-center gap-4">
          <Link
            href="/auth/login"
            className="text-sm font-medium text-neutral-700 hover:text-yellow-600 transition-colors"
          >
            Login
          </Link>
          <Link
            href="/auth/register"
            className="inline-flex items-center justify-center rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 px-5 py-2.5 text-sm font-semibold text-white shadow-lg shadow-yellow-200 hover:shadow-xl hover:scale-105 transition-all duration-300"
          >
            Start Free
          </Link>
        </div>

        <button
          className="md:hidden p-2 text-neutral-700"
          onClick={() => setMobileOpen(!mobileOpen)}
        >
          {mobileOpen ? <X size={24} /> : <Menu size={24} />}
        </button>
      </div>

      {mobileOpen && (
        <motion.div
          initial={{ opacity: 0, height: 0 }}
          animate={{ opacity: 1, height: "auto" }}
          exit={{ opacity: 0, height: 0 }}
          className="md:hidden bg-yellow-50 border-t border-yellow-200/50 px-4 pb-4 pt-2 space-y-2"
        >
          {navLinks.map((link) => (
            <Link
              key={link.label}
              href={link.href}
              className="block py-2 text-base font-medium text-neutral-700 hover:text-yellow-600"
              onClick={() => setMobileOpen(false)}
            >
              {link.label}
            </Link>
          ))}
          <Link
            href="/auth/login"
            className="block py-2 text-base font-medium text-neutral-700 hover:text-yellow-600"
            onClick={() => setMobileOpen(false)}
          >
            Login
          </Link>
          <Link
            href="/auth/register"
            className="block py-2.5 text-center rounded-xl bg-gradient-to-r from-yellow-400 to-amber-500 text-white font-semibold"
            onClick={() => setMobileOpen(false)}
          >
            Start Free
          </Link>
        </motion.div>
      )}
    </motion.nav>
  );
}