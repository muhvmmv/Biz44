"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Eye, EyeOff } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";
import { useAuth } from "@/hooks/useAuth";

export default function RegisterPage() {
  const { register } = useAuth();
  const router = useRouter();
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [company, setCompany] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (password !== confirmPassword) { setError("Passwords do not match"); return; }
    setSubmitting(true);
    try {
      await register({ firstName, lastName, email, password, company: company || undefined });
      router.push("/onboarding");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Registration failed");
    } finally { setSubmitting(false); }
  };

  return (
    <AuthLayout
      title="Create your free account"
      subtitle="Start building your business in minutes."
      footer={
        <p>
          Already have an account?{" "}
          <Link href="/auth/login" className="text-brand-dark font-medium hover:underline">Sign in</Link>
        </p>
      }
    >
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && (
          <div className="bg-[#F4E2E1] border border-danger text-danger px-4 py-3 rounded-lg text-sm">{error}</div>
        )}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">First name</label>
            <input required value={firstName} onChange={(e) => setFirstName(e.target.value)}
              className="w-full rounded-lg border border-border-soft bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="John" />
          </div>
          <div>
            <label className="block text-sm font-medium text-charcoal mb-1">Last name</label>
            <input required value={lastName} onChange={(e) => setLastName(e.target.value)}
              className="w-full rounded-lg border border-border-soft bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Doe" />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-charcoal mb-1">Email address</label>
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)}
            className="w-full rounded-lg border border-border-soft bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="you@example.com" />
        </div>

        <div>
          <label className="block text-sm font-medium text-charcoal mb-1">
            Company name <span className="text-ink-soft">(optional)</span>
          </label>
          <input value={company} onChange={(e) => setCompany(e.target.value)}
            className="w-full rounded-lg border border-border-soft bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand"
            placeholder="Your company" />
        </div>

        <div>
          <label className="block text-sm font-medium text-charcoal mb-1">Password</label>
          <div className="relative">
            <input type={showPassword ? "text" : "password"} required minLength={8}
              value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full rounded-lg border border-border-soft bg-white pl-4 pr-10 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="At least 8 characters" />
            <button type="button" onClick={() => setShowPassword(!showPassword)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink">
              {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium text-charcoal mb-1">Confirm password</label>
          <div className="relative">
            <input type={showConfirm ? "text" : "password"} required minLength={8}
              value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full rounded-lg border border-border-soft bg-white pl-4 pr-10 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-brand"
              placeholder="Re-enter your password" />
            <button type="button" onClick={() => setShowConfirm(!showConfirm)}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-ink-soft hover:text-ink">
              {showConfirm ? <EyeOff size={18} /> : <Eye size={18} />}
            </button>
          </div>
        </div>

        <p className="text-xs text-ink-soft">
          By creating an account, you agree to our{" "}
          <Link href="#" className="text-brand-dark hover:underline">Terms of Service</Link>{" "}and{" "}
          <Link href="#" className="text-brand-dark hover:underline">Privacy Policy</Link>.
        </p>

        <button type="submit" disabled={submitting}
          className="w-full rounded-lg bg-charcoal px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-charcoal-dark transition-all disabled:opacity-50">
          {submitting ? "Creating account..." : "Create account"}
        </button>
      </form>
    </AuthLayout>
  );
}