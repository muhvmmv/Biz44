"use client";

import { createContext, ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, CheckCircle2, X } from "lucide-react";
import Dialog from "@/components/ui/Dialog";
import Button from "@/components/ui/Button";
import { cn } from "@/lib/utils";

/**
 * App-wide confirmations and notices, replacing the browser's confirm() and
 * alert() and silent console.error()s:
 *
 *   const { confirm, notify } = useFeedback();
 *   if (!(await confirm({ title: "Delete this supplier?", danger: true }))) return;
 *   notify.error(err);   // shows the API's message
 */
interface ConfirmOptions {
  title: string;
  description?: ReactNode;
  confirmLabel?: string;
  danger?: boolean;
}
interface Notice { id: number; tone: "error" | "success"; text: string }

interface FeedbackApi {
  confirm: (options: ConfirmOptions | string) => Promise<boolean>;
  notify: {
    error: (error: unknown, fallback?: string) => void;
    success: (text: string) => void;
  };
}

const FeedbackContext = createContext<FeedbackApi | null>(null);

// The mounted provider, for code outside React render (effects, handlers).
let active: FeedbackApi | null = null;

/** Ask the user to confirm (the app's dialog, not the browser's). */
export function confirmAction(options: ConfirmOptions | string): Promise<boolean> {
  if (active) return active.confirm(options);
  return Promise.resolve(typeof window !== "undefined" && window.confirm(typeof options === "string" ? options : options.title));
}

/** Show an error to the user (the API's message, or `fallback`). */
export function reportError(error: unknown, fallback?: string) {
  if (active) active.notify.error(error, fallback);
  else console.error(error);
}

/** Show a short success notice. */
export function notifySuccess(text: string) {
  active?.notify.success(text);
}

/** Message for an error thrown by apiFetch (or anything else). */
export function errorMessage(error: unknown, fallback = "Something went wrong") {
  if (error instanceof Error && error.message) return error.message;
  if (typeof error === "string" && error) return error;
  return fallback;
}

export function FeedbackProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<(ConfirmOptions & { resolve: (ok: boolean) => void }) | null>(null);
  const [notices, setNotices] = useState<Notice[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setNotices((n) => n.filter((x) => x.id !== id)), []);
  const push = useCallback((tone: Notice["tone"], text: string) => {
    const id = nextId.current++;
    setNotices((n) => [...n.slice(-3), { id, tone, text }]);
    setTimeout(() => dismiss(id), tone === "error" ? 8000 : 4000);
  }, [dismiss]);

  const api = useMemo<FeedbackApi>(() => ({
    confirm: (options) =>
      new Promise<boolean>((resolve) => {
        const o = typeof options === "string" ? { title: options } : options;
        setPending({ ...o, resolve });
      }),
    notify: {
      error: (error, fallback) => push("error", errorMessage(error, fallback)),
      success: (text) => push("success", text),
    },
  }), [push]);

  useEffect(() => {
    active = api;
    return () => { if (active === api) active = null; };
  }, [api]);

  const close = (ok: boolean) => {
    pending?.resolve(ok);
    setPending(null);
  };

  return (
    <FeedbackContext.Provider value={api}>
      {children}
      <Dialog
        open={!!pending}
        onClose={() => close(false)}
        title={pending?.title ?? ""}
        description={pending?.description}
        footer={
          <>
            <Button variant="outline" onClick={() => close(false)}>Cancel</Button>
            <Button variant={pending?.danger ? "danger" : "primary"} onClick={() => close(true)} autoFocus>
              {pending?.confirmLabel ?? (pending?.danger ? "Delete" : "Confirm")}
            </Button>
          </>
        }
      >
        {pending?.danger ? <p className="text-sm text-ink-soft">This can&apos;t be undone.</p> : null}
      </Dialog>
      <div className="no-print pointer-events-none fixed bottom-4 right-4 z-[60] flex w-[min(24rem,calc(100vw-2rem))] flex-col gap-2" aria-live="polite" role="status">
        {notices.map((n) => (
          <div
            key={n.id}
            className={cn(
              "pointer-events-auto flex items-start gap-3 rounded-xl border bg-surface px-4 py-3 text-sm shadow-pop",
              n.tone === "error" ? "border-danger/30" : "border-success/30"
            )}
            role={n.tone === "error" ? "alert" : undefined}
          >
            {n.tone === "error" ? <AlertTriangle size={18} className="mt-0.5 shrink-0 text-danger" /> : <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" />}
            <p className="flex-1 text-ink">{n.text}</p>
            <button type="button" onClick={() => dismiss(n.id)} className="text-ink-soft hover:text-ink" aria-label="Dismiss">
              <X size={16} />
            </button>
          </div>
        ))}
      </div>
    </FeedbackContext.Provider>
  );
}

export function useFeedback(): FeedbackApi {
  const ctx = useContext(FeedbackContext);
  if (!ctx) throw new Error("useFeedback must be used inside FeedbackProvider");
  return ctx;
}
