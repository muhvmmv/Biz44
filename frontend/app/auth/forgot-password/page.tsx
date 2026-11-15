"use client";

import Link from "next/link";
import { ArrowLeft, KeyRound, UserCog } from "lucide-react";
import AuthLayout from "@/components/auth/AuthLayout";

/**
 * Biz44 does not send emails, so there is no reset link: an administrator
 * sets a new password from Settings → Team.
 */
export default function ForgotPasswordPage() {
  return (
    <AuthLayout
      title="Forgot your password?"
      subtitle="Your company's administrator can set a new one for you."
      shot="dashboard"
      footer={<Link href="/auth/login" className="inline-flex items-center gap-1 font-semibold text-ink hover:underline"><ArrowLeft size={15} /> Back to sign in</Link>}
    >
      <ol className="space-y-5 text-sm">
        <li className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-charcoal text-ivory"><UserCog size={16} /></span>
          <span>
            <span className="block font-semibold text-ink">Ask your administrator</span>
            <span className="text-ink-soft">They open <span className="font-medium text-ink">Settings → Team</span>, choose your name and select <span className="font-medium text-ink">Password</span> to give you a new one.</span>
          </span>
        </li>
        <li className="flex gap-3">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-border-soft bg-surface text-ink"><KeyRound size={16} /></span>
          <span>
            <span className="block font-semibold text-ink">Sign in and change it</span>
            <span className="text-ink-soft">After signing in, go to <span className="font-medium text-ink">Your profile</span> to choose a password only you know.</span>
          </span>
        </li>
      </ol>
      <p className="mt-6 rounded-xl bg-surface-muted px-3.5 py-3 text-xs text-ink-soft">
        If you are the only administrator and can&apos;t sign in, contact the person who set up Biz44 for your company.
      </p>
    </AuthLayout>
  );
}
