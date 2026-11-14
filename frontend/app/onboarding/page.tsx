"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Button from "@/components/ui/Button";
import { useAuth } from "@/hooks/useAuth";
import { motion } from "framer-motion";
import {
  Store, Briefcase, Factory, Stethoscope, Truck, Utensils, GraduationCap, Building2,
} from "lucide-react";
import { CURRENCY_CODES } from "@/lib/currency";

const businessTypes = [
  { value: "retail", label: "Retail", icon: Store },
  { value: "services", label: "Services", icon: Briefcase },
  { value: "manufacturing", label: "Manufacturing", icon: Factory },
  { value: "healthcare", label: "Healthcare", icon: Stethoscope },
  { value: "logistics", label: "Logistics", icon: Truck },
  { value: "restaurant", label: "Restaurant", icon: Utensils },
  { value: "education", label: "Education", icon: GraduationCap },
  { value: "other", label: "Other", icon: Building2 },
];

export default function OnboardingPage() {
  const router = useRouter();
  const { refreshUser } = useAuth();
  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  const finish = async () => {
    setSubmitting(true);
    setError("");
    try {
      await apiFetch("/settings/onboarding", {
        method: "POST",
        body: JSON.stringify({ businessType, industry, country, currency }),
      });

      // CRITICAL: refresh the user so the new currency is picked up everywhere
      await refreshUser();

      router.push("/dashboard");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-rose-light via-ivory to-navy-light flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-white rounded-3xl shadow-xl p-8 sm:p-12 border border-border-soft"
      >
        <div className="flex items-center gap-2 mb-8">
          {[1, 2].map((n) => (
            <div
              key={n}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                n <= step ? "bg-rose-vale" : "bg-navy-light"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h1 className="text-2xl font-bold text-ink">What kind of business do you run?</h1>
            <p className="text-ink-soft mt-2">
              This helps us tailor Biz44 to your needs. You can change it later in Settings.
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-8">
              {businessTypes.map(({ value, label, icon: Icon }) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setBusinessType(value)}
                  className={`p-4 rounded-xl border-2 transition-all ${
                    businessType === value
                      ? "border-rose-vale bg-rose-light"
                      : "border-border-soft hover:border-rose-vale"
                  }`}
                >
                  <Icon className={`w-6 h-6 mx-auto mb-2 ${businessType === value ? "text-rose-vale" : "text-ink-soft"}`} />
                  <span className="text-sm font-medium text-ink">{label}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-8">
              <Button onClick={() => setStep(2)} disabled={!businessType}>Continue</Button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h1 className="text-2xl font-bold text-ink">Business details</h1>
            <p className="text-ink-soft mt-2">Almost there — just a few final details.</p>

            <div className="space-y-5 mt-8">
              <div>
                <label className="block text-sm font-medium mb-1 text-navy">
                  Industry / niche <span className="text-ink-soft">(optional)</span>
                </label>
                <input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g. Fashion, Electronics, Consulting"
                  className="w-full rounded-lg border border-border-soft bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-rose-vale"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-navy">Country</label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g. Nigeria, United States"
                  className="w-full rounded-lg border border-border-soft bg-white px-4 py-2.5 text-sm text-ink placeholder:text-ink-soft focus:outline-none focus:ring-2 focus:ring-rose-vale"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1 text-navy">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-border-soft bg-white px-4 py-2.5 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-rose-vale"
                >
                  {CURRENCY_CODES.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

            {error && <p className="text-danger text-sm mt-4">{error}</p>}

            <div className="flex justify-between mt-8">
              <Button variant="outline" onClick={() => setStep(1)}>Back</Button>
              <Button onClick={finish} isLoading={submitting}>Finish setup</Button>
            </div>
          </motion.div>
        )}
      </motion.div>
    </div>
  );
}