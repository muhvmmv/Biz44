"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { CheckCircle2, AlertTriangle, Wrench, RefreshCw, ClipboardCheck } from "lucide-react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import Button from "@/components/ui/Button";
import Badge from "@/components/ui/Badge";
import Skeleton from "@/components/ui/Skeleton";
import Dialog from "@/components/ui/Dialog";
import NumericInput from "@/components/ui/NumericInput";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { useCurrency } from "@/hooks/useCurrency";
import { useLocation } from "@/hooks/useLocation";

type IssueType =
  | "batch_without_location"
  | "stock_without_batches"
  | "value_out_of_date"
  | "quantity_mismatch"
  | "negative_batch";

interface Issue {
  type: IssueType;
  fixable: boolean;
  productId: string;
  productName: string;
  message: string;
  recordedQuantity?: number;
  batchQuantity?: number;
}

interface Report {
  checkedAt: string;
  defaultLocation: { id: string; name: string } | null;
  summary: {
    products: number;
    issues: number;
    fixable: number;
    needsCount: number;
    batchValueTotal: number;
    inventoryAccountBalance: number;
    inventoryAccountDifference: number;
  };
  issues: Issue[];
}

const ISSUE_LABELS: Record<IssueType, string> = {
  batch_without_location: "Stock has no location",
  stock_without_batches: "Stock without batches",
  value_out_of_date: "Stock value out of date",
  quantity_mismatch: "Quantities disagree",
  negative_batch: "Negative batch",
};

export default function StockCheckPage() {
  const { format } = useCurrency();
  const { locations, activeLocationId, activeLocation } = useLocation();
  const [report, setReport] = useState<Report | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  const [confirmFix, setConfirmFix] = useState(false);
  const [fixing, setFixing] = useState(false);
  const [fixResult, setFixResult] = useState("");

  const [countFor, setCountFor] = useState<Issue | null>(null);
  const [counted, setCounted] = useState(0);
  const [saving, setSaving] = useState(false);
  const [countError, setCountError] = useState("");

  const canCount = activeLocationId !== "all" || locations.length === 1;
  const countLocationName = activeLocation?.name || locations[0]?.name || "";

  const fetchReport = useCallback(
    () => apiFetch<{ success: boolean; data: Report }>("/stock/check").then((r) => r.data),
    []
  );

  useEffect(() => {
    let active = true;
    fetchReport()
      .then((r) => { if (active) setReport(r); })
      .catch((e: unknown) => { if (active) setError(e instanceof Error ? e.message : "Could not run the stock check"); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchReport]);

  const rerun = async () => {
    setError("");
    setLoading(true);
    try {
      setReport(await fetchReport());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not run the stock check");
    } finally {
      setLoading(false);
    }
  };

  const applyFixes = async () => {
    setFixing(true);
    try {
      const r = await apiFetch<{
        success: boolean;
        data: { batchesAssigned: number; openingBatchesCreated: number; productsResynced: number };
      }>("/stock/check/fix", { method: "POST" });
      setFixResult(
        `Fixed: ${r.data.batchesAssigned} batch(es) given a location, ` +
          `${r.data.openingBatchesCreated} opening batch(es) created, ${r.data.productsResynced} product(s) updated.`
      );
      setConfirmFix(false);
      setReport(await fetchReport());
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Could not apply fixes");
      setConfirmFix(false);
    } finally {
      setFixing(false);
    }
  };

  const openCount = (issue: Issue) => {
    setCountError("");
    setCounted(issue.batchQuantity ?? 0);
    setCountFor(issue);
  };

  const saveCount = async () => {
    if (!countFor) return;
    setCountError("");
    setSaving(true);
    try {
      await apiFetch("/stock/count", {
        method: "POST",
        body: JSON.stringify({
          productId: countFor.productId,
          countedQuantity: counted,
          notes: "Stock check count",
        }),
      });
      setCountFor(null);
      setReport(await fetchReport());
    } catch (e: unknown) {
      setCountError(e instanceof Error ? e.message : "Could not save the count");
    } finally {
      setSaving(false);
    }
  };

  const fixable = report?.issues.filter((i) => i.fixable) ?? [];
  const needsAttention = report?.issues.filter((i) => !i.fixable) ?? [];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Stock Check"
        description="Compares each product's recorded stock with its stock batches, which every sale and receipt now uses. Running the check never changes anything."
        actions={
          <Button variant="outline" onClick={rerun} disabled={loading} className="whitespace-nowrap">
            <RefreshCw size={16} className="mr-1.5" /> Run again
          </Button>
        }
      />

      {error && (
        <Card><CardContent className="p-5 text-sm text-danger">{error}</CardContent></Card>
      )}

      {loading && !report ? (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {[...Array(4)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : report ? (
        <>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-5">
              <p className="text-sm text-ink-soft">Products checked</p>
              <p className="text-2xl font-bold mt-1 text-ink tabular-nums">{report.summary.products}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-ink-soft">Can be fixed automatically</p>
              <p className="text-2xl font-bold mt-1 text-ink tabular-nums">{report.summary.fixable}</p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-ink-soft">Need a stock count</p>
              <p className={`text-2xl font-bold mt-1 tabular-nums ${report.summary.needsCount > 0 ? "text-warning" : "text-ink"}`}>
                {report.summary.needsCount}
              </p>
            </CardContent></Card>
            <Card><CardContent className="p-5">
              <p className="text-sm text-ink-soft">Stock value (batches)</p>
              <p className="text-lg sm:text-2xl font-bold mt-1 text-ink tabular-nums break-all">{format(report.summary.batchValueTotal)}</p>
              {Math.abs(report.summary.inventoryAccountDifference) > 0.01 && (
                <p className="text-xs text-ink-soft mt-1">
                  Inventory account: {format(report.summary.inventoryAccountBalance)}
                </p>
              )}
            </CardContent></Card>
          </div>

          {fixResult && (
            <div className="rounded-xl border border-green-200 bg-green-50 px-4 py-3 text-sm text-success">{fixResult}</div>
          )}

          {report.summary.issues === 0 ? (
            <Card>
              <CardContent className="py-14 text-center">
                <CheckCircle2 className="w-12 h-12 text-success mx-auto mb-3" />
                <p className="font-semibold text-ink">Everything matches</p>
                <p className="text-sm text-ink-soft mt-1">
                  Every product&apos;s recorded stock agrees with its batches.
                </p>
              </CardContent>
            </Card>
          ) : (
            <>
              {fixable.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Wrench size={18} className="text-brand" /> Safe automatic fixes
                    </CardTitle>
                    <Button onClick={() => setConfirmFix(true)}>Apply {fixable.length} fix{fixable.length === 1 ? "" : "es"}</Button>
                  </CardHeader>
                  <CardContent className="p-0">
                    <IssueTable issues={fixable} />
                  </CardContent>
                </Card>
              )}

              {needsAttention.length > 0 && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertTriangle size={18} className="text-warning" /> Count these products
                    </CardTitle>
                  </CardHeader>
                  <CardContent className="p-0">
                    <p className="px-5 pb-3 text-sm text-ink-soft">
                      The two records disagree and there is no way to know which is right without counting.
                      Count the units on the shelf and enter the number.
                      {!canCount && " Choose a location in the top bar first."}
                    </p>
                    <IssueTable
                      issues={needsAttention}
                      action={(issue) =>
                        issue.type === "quantity_mismatch" || issue.type === "negative_batch" ? (
                          <Button size="sm" variant="outline" disabled={!canCount} onClick={() => openCount(issue)}>
                            <ClipboardCheck size={14} className="mr-1" /> Count
                          </Button>
                        ) : null
                      }
                    />
                  </CardContent>
                </Card>
              )}
            </>
          )}

          <p className="text-xs text-ink-soft">Last checked {new Date(report.checkedAt).toLocaleString()}.</p>
        </>
      ) : null}

      <Dialog
        open={confirmFix}
        onClose={() => setConfirmFix(false)}
        title="Apply safe fixes?"
        description="These fixes only fill in missing information. They never guess or change quantities that disagree."
        footer={
          <>
            <Button variant="outline" onClick={() => setConfirmFix(false)}>Cancel</Button>
            <Button onClick={applyFixes} isLoading={fixing}>Apply fixes</Button>
          </>
        }
      >
        <ul className="text-sm text-ink space-y-2 list-disc pl-5">
          <li>Stock batches with no location are assigned to <strong>{report?.defaultLocation?.name || "the default location"}</strong>.</li>
          <li>Products that show stock but have no batches get an opening batch for that quantity, at the product&apos;s cost price.</li>
          <li>Stored stock values are recalculated from the batches.</li>
        </ul>
      </Dialog>

      <Dialog
        open={countFor !== null}
        onClose={() => setCountFor(null)}
        title={`Count ${countFor?.productName ?? ""}`}
        description={`Enter the quantity physically on hand at ${countLocationName}. The difference is booked as a stock gain or loss.`}
        footer={
          <>
            <Button variant="outline" onClick={() => setCountFor(null)}>Cancel</Button>
            <Button onClick={saveCount} isLoading={saving}>Save count</Button>
          </>
        }
      >
        {countFor && (
          <div className="rounded-xl bg-ivory p-4 text-sm grid grid-cols-2 gap-2">
            <span className="text-ink-soft">Product record says</span>
            <span className="text-right font-medium tabular-nums">{countFor.recordedQuantity ?? "—"}</span>
            <span className="text-ink-soft">Batches add up to</span>
            <span className="text-right font-medium tabular-nums">{countFor.batchQuantity ?? "—"}</span>
          </div>
        )}
        <div>
          <label className="block text-sm font-medium mb-1">Counted quantity at {countLocationName}</label>
          <NumericInput allowDecimals={false} min={0} value={counted} onChange={setCounted} />
        </div>
        {countError && <p className="text-sm text-danger">{countError}</p>}
      </Dialog>
    </div>
  );
}

function IssueTable({ issues, action }: { issues: Issue[]; action?: (i: Issue) => React.ReactNode }) {
  return (
    <>
    {/* Phones: one card per issue */}
    <ul className="sm:hidden divide-y divide-border-soft">
      {issues.map((i, idx) => (
        <li key={`m-${i.type}-${i.productId}-${idx}`} className="px-5 py-4 space-y-2">
          <div className="flex items-start justify-between gap-3">
            <Link href={`/dashboard/inventory/products/${i.productId}`} className="font-medium text-ink">
              {i.productName}
            </Link>
            <Badge variant={i.fixable ? "info" : "warning"}>{ISSUE_LABELS[i.type]}</Badge>
          </div>
          <p className="text-sm text-ink-soft">{i.message}</p>
          {(i.recordedQuantity !== undefined || i.batchQuantity !== undefined) && (
            <p className="text-sm tabular-nums">
              Recorded <span className="font-medium">{i.recordedQuantity ?? "—"}</span> · Batches{" "}
              <span className="font-medium">{i.batchQuantity ?? "—"}</span>
            </p>
          )}
          {action && action(i)}
        </li>
      ))}
    </ul>
    <div className="hidden sm:block overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-ivory text-ink-soft text-left">
          <tr>
            <th className="px-5 py-3 font-medium">Product</th>
            <th className="px-5 py-3 font-medium">Problem</th>
            <th className="px-5 py-3 font-medium text-right">Recorded</th>
            <th className="px-5 py-3 font-medium text-right">Batches</th>
            {action && <th className="px-5 py-3" />}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-soft">
          {issues.map((i, idx) => (
            <tr key={`${i.type}-${i.productId}-${idx}`} className="align-top">
              <td className="px-5 py-3 font-medium">
                <Link href={`/dashboard/inventory/products/${i.productId}`} className="text-ink hover:text-brand-dark">
                  {i.productName}
                </Link>
              </td>
              <td className="px-5 py-3">
                <Badge variant={i.fixable ? "info" : "warning"}>{ISSUE_LABELS[i.type]}</Badge>
                <p className="text-ink-soft mt-1 max-w-md">{i.message}</p>
              </td>
              <td className="px-5 py-3 text-right tabular-nums">{i.recordedQuantity ?? "—"}</td>
              <td className="px-5 py-3 text-right tabular-nums">{i.batchQuantity ?? "—"}</td>
              {action && <td className="px-5 py-3 text-right">{action(i)}</td>}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
    </>
  );
}
