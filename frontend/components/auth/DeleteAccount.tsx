"use client";

import { useState } from "react";
import { AlertTriangle, Building2, UserX } from "lucide-react";
import { apiFetch } from "@/lib/api";
import { useAuth } from "@/hooks/useAuth";
import Button from "@/components/ui/Button";
import Dialog from "@/components/ui/Dialog";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Field, Input } from "@/components/ui/Input";
import PasswordInput from "@/components/auth/PasswordInput";

type Mode = "account" | "company";

/**
 * Delete your account (your name and email are erased; the company keeps its
 * records), or, for an administrator, delete the whole company.
 */
export default function DeleteAccount() {
  const { user, logout } = useAuth();
  const [mode, setMode] = useState<Mode | null>(null);
  const [password, setPassword] = useState("");
  const [companyName, setCompanyName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  if (!user) return null;
  const company = user.companyName || "your company";
  const isAdmin = user.role === "admin";

  const open = (m: Mode) => {
    setMode(m);
    setPassword("");
    setCompanyName("");
    setError("");
  };

  const confirm = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    if (!password) return setError("Enter your password to confirm");
    if (mode === "company" && companyName.trim().toLowerCase() !== company.trim().toLowerCase()) {
      return setError(`Type ${company} to confirm`);
    }
    setBusy(true);
    try {
      await apiFetch("/auth/delete-account", {
        method: "POST",
        body: JSON.stringify({ password, ...(mode === "company" ? { deleteCompany: true, companyName } : {}) }),
      });
      try { localStorage.removeItem("biz44_active_location"); } catch { /* storage unavailable */ }
      logout();
      window.location.href = `/auth/login?deleted=${mode}`;
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not delete");
      setBusy(false);
    }
  };

  return (
    <Card className="border-danger/25">
      <CardHeader><CardTitle>Delete account</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-col gap-3 rounded-2xl border border-border-soft p-4 sm:flex-row sm:items-center">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-surface-muted text-ink"><UserX size={18} /></span>
          <div className="min-w-0 flex-1 text-sm">
            <p className="font-semibold text-ink">Delete your account</p>
            <p className="mt-0.5 text-ink-soft">Your name, email and password are erased and you can no longer sign in. Invoices, payments and other records you made stay with {company}, because its books must stay complete.</p>
          </div>
          <Button variant="outline" className="shrink-0 text-danger hover:bg-danger-soft" onClick={() => open("account")}>Delete my account</Button>
        </div>
        {isAdmin && (
          <div className="flex flex-col gap-3 rounded-2xl border border-danger/30 bg-danger-soft/40 p-4 sm:flex-row sm:items-center">
            <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-soft text-danger"><Building2 size={18} /></span>
            <div className="min-w-0 flex-1 text-sm">
              <p className="font-semibold text-ink">Delete {company}</p>
              <p className="mt-0.5 text-ink-soft">Removes the company for good: every branch, product, invoice, payment, account, employee and team member. This cannot be undone, so download any reports you need first.</p>
            </div>
            <Button variant="danger" className="shrink-0" onClick={() => open("company")}>Delete company</Button>
          </div>
        )}
      </CardContent>

      <Dialog
        open={mode !== null}
        onClose={() => !busy && setMode(null)}
        title={mode === "company" ? `Delete ${company}?` : "Delete your account?"}
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setMode(null)} disabled={busy}>Cancel</Button>
            <Button type="submit" form="delete-account-form" variant="danger" isLoading={busy}>
              {mode === "company" ? "Delete company forever" : "Delete my account"}
            </Button>
          </>
        }
      >
        <form id="delete-account-form" onSubmit={confirm} className="space-y-4">
          <p className="flex gap-2.5 rounded-xl bg-danger-soft px-3.5 py-3 text-sm text-ink">
            <AlertTriangle size={17} className="mt-0.5 shrink-0 text-danger" />
            <span>
              {mode === "company"
                ? "All of the company's records and every team member's account will be deleted permanently."
                : "You will be signed out and cannot sign in again with this account. You can sign up again later with the same email."}
            </span>
          </p>
          {mode === "company" && (
            <Field label={`Type ${company} to confirm`}>
              <Input value={companyName} onChange={(e) => setCompanyName(e.target.value)} autoComplete="off" />
            </Field>
          )}
          <Field label="Your password">
            <PasswordInput value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
          </Field>
          {error && <p role="alert" className="text-sm text-danger">{error}</p>}
        </form>
      </Dialog>
    </Card>
  );
}
