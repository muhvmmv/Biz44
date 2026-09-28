"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Skeleton from "@/components/ui/Skeleton";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";

interface Company {
  id: string;
  name: string;
  email: string | null;
  phone: string | null;
  address: string | null;
  businessType: string | null;
  industry: string | null;
  country: string | null;
  currency: string;
  teamSize: string | null;
}

const TABS = [
  { key: "business", label: "Business" },
  { key: "localization", label: "Currency & Localization" },
  { key: "notifications", label: "Notifications" },
  { key: "security", label: "Security" },
];

export default function SettingsPage() {
  const [company, setCompany] = useState<Company | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [tab, setTab] = useState("business");

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Company }>("/settings/company")
      .then((res) => { if (active) setCompany(res.data); })
      .catch(console.error)
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const save = async () => {
    if (!company) return;
    setSaving(true);
    setSaved(false);
    try {
      await apiFetch("/settings/company", {
        method: "PUT",
        body: JSON.stringify(company),
      });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (err) { console.error(err); }
    finally { setSaving(false); }
  };

  if (loading) return <div className="p-6"><Skeleton className="h-64" /></div>;
  if (!company) return null;

  return (
    <div className="space-y-6 max-w-4xl">
      <PageHeader title="Settings" description="Manage your business configuration." />

      {/* Tabs */}
      <div className="flex gap-1 border-b border-neutral-200 overflow-x-auto">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setTab(t.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 -mb-px whitespace-nowrap transition ${
              tab === t.key
                ? "border-brand-600 text-brand-700"
                : "border-transparent text-neutral-500 hover:text-neutral-800"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "business" && (
        <Card>
          <CardHeader><CardTitle>Business Information</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1">Business name</label>
              <input value={company.name}
                onChange={(e) => setCompany({ ...company, name: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Business type</label>
                <select value={company.businessType || "other"}
                  onChange={(e) => setCompany({ ...company, businessType: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white">
                  <option value="retail">Retail</option>
                  <option value="services">Services</option>
                  <option value="manufacturing">Manufacturing</option>
                  <option value="healthcare">Healthcare</option>
                  <option value="logistics">Logistics</option>
                  <option value="restaurant">Restaurant</option>
                  <option value="education">Education</option>
                  <option value="other">Other</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Industry</label>
                <input value={company.industry || ""}
                  onChange={(e) => setCompany({ ...company, industry: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Email</label>
                <input type="email" value={company.email || ""}
                  onChange={(e) => setCompany({ ...company, email: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Phone</label>
                <input value={company.phone || ""}
                  onChange={(e) => setCompany({ ...company, phone: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Address</label>
              <textarea rows={3} value={company.address || ""}
                onChange={(e) => setCompany({ ...company, address: e.target.value })}
                className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
            </div>

            <div className="flex items-center gap-3 pt-2">
              <Button onClick={save} isLoading={saving}>Save Changes</Button>
              {saved && <span className="text-sm text-emerald-600">Saved!</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "localization" && (
        <Card>
          <CardHeader><CardTitle>Currency & Localization</CardTitle></CardHeader>
          <CardContent className="space-y-4">
            <div className="grid sm:grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium mb-1">Country</label>
                <input value={company.country || ""}
                  onChange={(e) => setCompany({ ...company, country: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Currency</label>
                <select value={company.currency || "USD"}
                  onChange={(e) => setCompany({ ...company, currency: e.target.value })}
                  className="w-full rounded-lg border border-neutral-300 px-3 py-2 text-sm bg-white">
                  {["USD", "EUR", "GBP", "NGN", "KES", "GHS", "ZAR", "INR"].map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex items-center gap-3 pt-2">
              <Button onClick={save} isLoading={saving}>Save Changes</Button>
              {saved && <span className="text-sm text-emerald-600">Saved!</span>}
            </div>
          </CardContent>
        </Card>
      )}

      {tab === "notifications" && (
        <Card>
          <CardHeader><CardTitle>Notifications</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-500">
              Notification preferences will appear here as new features roll out.
            </p>
          </CardContent>
        </Card>
      )}

      {tab === "security" && (
        <Card>
          <CardHeader><CardTitle>Security</CardTitle></CardHeader>
          <CardContent>
            <p className="text-sm text-neutral-500">
              Your account is secured with JWT authentication and bcrypt password hashing.
            </p>
          </CardContent>
        </Card>
      )}
    </div>
  );
}