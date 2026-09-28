"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { apiFetch } from "@/lib/api";
import Button from "@/components/ui/Button";
import { motion } from "framer-motion";
import {
  Store, Briefcase, Factory, Stethoscope, Truck, Utensils, GraduationCap, Building2,
} from "lucide-react";

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

const currencies = ["USD", "EUR", "GBP", "NGN", "KES", "GHS", "ZAR", "INR"];

export default function OnboardingPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [businessType, setBusinessType] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [submitting, setSubmitting] = useState(false);

  const finish = async () => {
    setSubmitting(true);
    try {
      await apiFetch("/settings/onboarding", {
        method: "POST",
        body: JSON.stringify({
          businessType,
          industry: industry || undefined,
          country,
          currency,
        }),
      });
      router.push("/dashboard");
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-50 via-white to-purple-50 flex items-center justify-center p-4">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        className="w-full max-w-2xl bg-white rounded-3xl shadow-xl p-8 sm:p-12"
      >
        {/* 2-step progress indicator */}
        <div className="flex items-center gap-2 mb-8">
          {[1, 2].map((n) => (
            <div
              key={n}
              className={`flex-1 h-1.5 rounded-full transition-colors ${
                n <= step ? "bg-brand-500" : "bg-neutral-200"
              }`}
            />
          ))}
        </div>

        {step === 1 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h1 className="text-2xl font-bold">What kind of business do you run?</h1>
            <p className="text-neutral-500 mt-2">
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
                      ? "border-brand-500 bg-brand-50"
                      : "border-neutral-200 hover:border-brand-300"
                  }`}
                >
                  <Icon
                    className={`w-6 h-6 mx-auto mb-2 ${
                      businessType === value ? "text-brand-600" : "text-neutral-500"
                    }`}
                  />
                  <span className="text-sm font-medium">{label}</span>
                </button>
              ))}
            </div>
            <div className="flex justify-end mt-8">
              <Button onClick={() => setStep(2)} disabled={!businessType}>
                Continue
              </Button>
            </div>
          </motion.div>
        )}

        {step === 2 && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <h1 className="text-2xl font-bold">Business details</h1>
            <p className="text-neutral-500 mt-2">
              Almost there — just a few final details.
            </p>

            <div className="space-y-5 mt-8">
              <div>
                <label className="block text-sm font-medium mb-1">
                  Industry / niche <span className="text-neutral-400">(optional)</span>
                </label>
                <input
                  value={industry}
                  onChange={(e) => setIndustry(e.target.value)}
                  placeholder="e.g. Fashion, Electronics, Consulting"
                  className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Country</label>
                <input
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                  placeholder="e.g. Nigeria, United States"
                  className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm focus:outline-none focus:ring-2 focus:ring-brand-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Currency</label>
                <select
                  value={currency}
                  onChange={(e) => setCurrency(e.target.value)}
                  className="w-full rounded-lg border border-neutral-300 px-4 py-2.5 text-sm bg-white"
                >
                  {currencies.map((c) => (
                    <option key={c} value={c}>{c}</option>
                  ))}
                </select>
              </div>
            </div>

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