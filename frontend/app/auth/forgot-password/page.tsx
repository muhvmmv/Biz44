"use client";

import Link from "next/link";
import AuthLayout from "@/components/auth/AuthLayout";
import { ArrowLeft } from "lucide-react";

export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Reset your password"
      subtitle="Enter your email and we'll send you a reset link."
      footer={
        <Link href="/auth/login" className="inline-flex items-center gap-1 text-rose-vale font-medium hover:underline">
          <ArrowLeft size={16} />
          Back to sign in
        </Link>
      }
    >
      <form className="space-y-5" onSubmit={(e) => e.preventDefault()}>
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-navy mb-1">Email address</label>
          <input id="email" type="email" required
            className="w-full rounded-lg border border-border-soft bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-rose-vale"
            placeholder="you@example.com" />
        </div>

        <button type="submit"
          className="w-full rounded-lg bg-rose-vale px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-rose-dark transition-all">
          Send reset link
        </button>
      </form>
    </AuthLayout>
  );
}