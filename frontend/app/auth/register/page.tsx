"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, Check } from "lucide-react";
import AuthLayout, { authPrimary } from "@/components/auth/AuthLayout";
import PasswordInput from "@/components/auth/PasswordInput";
import { Field, Input } from "@/components/ui/Input";
import { useAuth } from "@/hooks/useAuth";
import { cn } from "@/lib/utils";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const rules = [
    { ok: password.length >= 8, label: "At least 8 characters" },
    { ok: /[A-Za-z]/.test(password) && /\d/.test(password), label: "Letters and numbers" },
  ];
  const strength = rules.filter((r) => r.ok).length + (password.length >= 12 ? 1 : 0);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!firstName.trim() || !lastName.trim()) return setError("Enter your first and last name");
    if (password.length < 8) return setError("The password must be at least 8 characters");
    if (password !== confirm) return setError("The passwords don't match");
    setSubmitting(true);
    try {
      await register({ firstName: firstName.trim(), lastName: lastName.trim(), email: email.trim(), password, company: company.trim() || undefined });
      router.push("/onboarding");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not create the account");
      setSubmitting(false);
    }
  };

  return (
    <AuthLayout
      title="Create your company"
      subtitle="You'll be the administrator. You can add your team, branches and products afterwards."
      shot="production"
      points={[
        "Bills of materials and production runs costed from real batches",
        "Invoices with VAT, deposits and credit notes",
        "Double-entry accounts that update as you work",
      ]}
      footer={<>Already have an account? <Link href="/auth/login" className="font-semibold text-ink underline-offset-2 hover:underline">Sign in</Link></>}
    >
      <form onSubmit={handleSubmit} className="space-y-4" noValidate>
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name"><Input autoComplete="given-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} autoFocus /></Field>
          <Field label="Last name"><Input autoComplete="family-name" required value={lastName} onChange={(e) => setLastName(e.target.value)} /></Field>
        </div>
        <Field label="Email" hint="You'll sign in with this.">
          <Input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@company.com" />
        </Field>
        <Field label="Company name" hint="Shown on invoices. You can change it later in Settings.">
          <Input autoComplete="organization" value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g. Northstar Foods Ltd" />
        </Field>
        <Field label="Password">
          <PasswordInput autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
        </Field>
        {password && (
          <div className="-mt-1 space-y-2">
            <div className="flex gap-1.5" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className={cn("h-1.5 flex-1 rounded-full transition-colors duration-300", i < strength ? (strength >= 3 ? "bg-success" : strength === 2 ? "bg-charcoal" : "bg-warning") : "bg-border-soft")} />
              ))}
            </div>
            <ul className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
              {rules.map((r) => (
                <li key={r.label} className={cn("flex items-center gap-1", r.ok ? "text-success" : "text-ink-faint")}><Check size={12} />{r.label}</li>
              ))}
            </ul>
          </div>
        )}
        <Field label="Confirm password" error={confirm && confirm !== password ? "The passwords don't match" : undefined}>
          <PasswordInput autoComplete="new-password" required value={confirm} onChange={(e) => setConfirm(e.target.value)} />
        </Field>
        {error && <p className="rounded-xl bg-danger-soft px-3.5 py-2.5 text-sm text-danger" role="alert">{error}</p>}
        <button type="submit" disabled={submitting} className={authPrimary}>
          {submitting ? "Creating your company…" : <>Create company <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" /></>}
        </button>
        <p className="text-center text-xs leading-relaxed text-ink-soft">
          By creating a company you agree to the{" "}
          <Link href="/terms" className="font-semibold text-ink hover:underline">Terms of Service</Link> and{" "}
          <Link href="/privacy" className="font-semibold text-ink hover:underline">Privacy Policy</Link>.
        </p>
      </form>
    </AuthLayout>
  );
}
