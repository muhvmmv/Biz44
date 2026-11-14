"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email, password);
      const res = await apiFetch<{ success: boolean; data: { completed: boolean } }>("/settings/onboarding");
      router.push(res.data.completed ? "/dashboard" : "/onboarding");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Invalid credentials");
    } finally { setSubmitting(false); }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Enter your credentials to access your account."
      footer={
        <p>
          Don&apos;t have an account?{" "}
          <Link href="/auth/register" className="text-brand-dark font-medium hover:underline">
            Sign up for free
          </Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-[#F4E2E1] border border-danger text-danger px-4 py-3 rounded-lg text-sm">{error}</div>
        )}
        <div>
          <label htmlFor="email" className="block text-sm font-medium text-charcoal mb-1">Email address</label>
          <input id="email" type="email" required value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border-soft bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
            placeholder="you@example.com" />
        </div>

        <div>
          <label htmlFor="password" className="block text-sm font-medium text-charcoal mb-1">Password</label>
          <div className="relative">
            <input id="password" type={showPassword ? "text" : "password"} required
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border-soft bg-white pl-4 pr-10 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand"
              placeholder="••••••••" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div className="flex items-center justify-between text-sm">
          <label className="flex items-center gap-2 text-ink-soft">
            <input type="checkbox" className="rounded border-border-soft text-brand-dark focus:ring-brand" />
            Remember me
          </label>
          <Link href="/auth/forgot-password" className="text-brand-dark font-medium hover:underline">
            Forgot password?
          </Link>
        </div>

        <button type="submit" disabled={submitting}
          className="w-full rounded-lg bg-charcoal px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-charcoal-dark transition-all disabled:opacity-50">
          {submitting ? "Signing in..." : "Sign in"}
        </button>
      </form>
    </AuthLayout>
  );
}