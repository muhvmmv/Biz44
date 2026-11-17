"use client";

import { useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { Field, Input } from "@/components/ui/Input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useAuth } from "@/hooks/useAuth";
import DeleteAccount from "@/components/auth/DeleteAccount";

function DetailsForm({ firstName: initialFirst, lastName: initialLast, email, role }: { firstName: string; lastName: string; email: string; role: string }) {
  const { refreshUser } = useAuth();
  const [firstName, setFirstName] = useState(initialFirst);
  const [lastName, setLastName] = useState(initialLast);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setMessage(null);
    try {
      await apiFetch("/auth/me", { method: "PUT", body: JSON.stringify({ firstName, lastName }) });
      await refreshUser();
      setMessage({ ok: true, text: "Saved" });
    } catch (err: unknown) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not save" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Your details</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="First name" required><Input value={firstName} onChange={(e) => setFirstName(e.target.value)} autoComplete="given-name" /></Field>
            <Field label="Last name" required><Input value={lastName} onChange={(e) => setLastName(e.target.value)} autoComplete="family-name" /></Field>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="Email" hint="Used to sign in"><Input value={email} disabled /></Field>
            <Field label="Role"><Input value={role === "admin" ? "Administrator" : role} disabled /></Field>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" isLoading={saving}>Save</Button>
            {message && <span className={`text-sm ${message.ok ? "text-success" : "text-danger"}`} role={message.ok ? "status" : "alert"}>{message.text}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

function PasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setMessage(null);
    if (next.length < 8) return setMessage({ ok: false, text: "The new password must be at least 8 characters" });
    if (next !== confirm) return setMessage({ ok: false, text: "The new passwords don't match" });
    setSaving(true);
    try {
      await apiFetch("/auth/change-password", { method: "POST", body: JSON.stringify({ currentPassword: current, newPassword: next }) });
      setCurrent(""); setNext(""); setConfirm("");
      setMessage({ ok: true, text: "Password changed" });
    } catch (err: unknown) {
      setMessage({ ok: false, text: err instanceof Error ? err.message : "Could not change the password" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card>
      <CardHeader><CardTitle>Change password</CardTitle></CardHeader>
      <CardContent>
        <form onSubmit={save} className="space-y-4">
          <Field label="Current password" required><Input type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" /></Field>
          <div className="grid gap-4 sm:grid-cols-2">
            <Field label="New password" required hint="At least 8 characters"><Input type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" /></Field>
            <Field label="Confirm new password" required><Input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} autoComplete="new-password" /></Field>
          </div>
          <div className="flex items-center gap-3">
            <Button type="submit" isLoading={saving}>Change password</Button>
            {message && <span className={`text-sm ${message.ok ? "text-success" : "text-danger"}`} role={message.ok ? "status" : "alert"}>{message.text}</span>}
          </div>
        </form>
      </CardContent>
    </Card>
  );
}

export default function ProfilePage() {
  const { user } = useAuth();
  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader title="Your profile" description="Your name and sign-in details." />
      {!user ? (
        <Skeleton className="h-64" />
      ) : (
        <>
          <DetailsForm key={user.id} firstName={user.firstName} lastName={user.lastName} email={user.email} role={user.role} />
          <PasswordForm />
          <DeleteAccount />
        </>
      )}
    </div>
  );
}
