"use client";

import Link from "next/link";
import AuthLayout from "@/components/auth/AuthLayout";
import { ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we’ll send you a reset link."
      footer={
        <Link href="/auth/login" className="inline-flex items-center gap-1 text-emerald-600 font-medium hover:underline">
          <ArrowLeft size={16} />
          Back to sign in
        </Link>
      }
    >
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-neutral-700 mb-1">
            Email address
          </label>
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm placeholder-neutral-400
                       focus:outline-none focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500 transition"
            placeholder="you@example.com"
          />
        </div>

        <button
          type="submit"
          className="w-full rounded-lg bg-emerald-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-emerald-700 transition-all"
        >
          Send reset link
        </button>
      </form>
    </AuthLayout>
  );
}