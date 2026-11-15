"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight } from "lucide-react";
import AuthLayout, { authPrimary } from "@/components/auth/AuthLayout";
import PasswordInput from "@/components/auth/PasswordInput";
import { Field, Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { apiFetch } from "@/lib/api";

export default function LoginPage() {
  const { login } = useAuth();
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setSubmitting(true);
    try {
      await login(email.trim(), password);
      const res = await apiFetch<{ success: boolean; data: { completed: boolean } }>("/settings/onboarding");
      router.push(res.data.completed ? "/dashboard" : "/onboarding");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not sign in");
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Welcome back"
      subtitle="Sign in to your company's Biz44."
      shot="dashboard"
      points={[
        "Cash and bank balances, sales and profit on one screen",
        "Stock, production and invoices always in step",
        "Light or dark, whichever you prefer",
      ]}
      footer={<>New to Biz44? <Link href="/auth/register" className="font-semibold text-ink underline-offset-2 hover:underline">Create your company</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <Field label="Email">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" autoFocus />
        </Field>
        <Field label="Password">
          <PasswordInput autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        <div className="flex justify-end">
          <Link href="/auth/forgot-password" className="text-sm font-medium text-ink-soft hover:text-ink hover:underline">Forgot password?</Link>
        </div>
        {error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger" role="alert">{error}</p>}
        <button type="submit" disabled={submitting || !email || !password} className={authPrimary}>
          {submitting ? "Signing in…" : <>Sign in <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" /></>}
        </button>
        <p className="text-center text-xs text-ink-faint">You stay signed in on this device for up to 7 days, or until you sign out.</p>
      </form>
    </AuthLayout>
  );
}
