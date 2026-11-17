"use client";

import { ReactNode } from "react";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, Moon, Sun } from "lucide-react";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";
import { LEGAL } from "@/lib/legal";

export interface LegalSection {
  id: string;
  title: string;
  body: ReactNode;
}

/** Privacy policy / terms: a contents list beside readable sections. */
export default function LegalPage(props: { title: string; intro: ReactNode; sections: LegalSection[] }) {
  return (
    <ThemeProvider>
      <Shell {...props} />
    </ThemeProvider>
  );
}

function Shell({ title, intro, sections }: { title: string; intro: ReactNode; sections: LegalSection[] }) {
  const { toggle } = useTheme();
  return (
    <div className="ambient-bg min-h-screen text-ink">
      <header className="glass-strong sticky top-3 z-30 mx-auto mt-3 flex w-[calc(100%-24px)] max-w-6xl items-center justify-between rounded-full px-4 py-2.5 sm:px-5">
        <Link href="/" className="flex items-center gap-2.5" aria-label="Biz44 home">
          <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br from-orange-400 via-orange-500 to-orange-700 text-[11px] font-extrabold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]">B44</span>
          <span className="text-[17px] font-bold tracking-tight">Biz44</span>
        </Link>
        <div className="flex items-center gap-1">
          <Link href="/" className="hidden items-center gap-1 rounded-full px-3 py-2 text-sm text-ink-soft hover:bg-surface hover:text-ink sm:flex">
            <ArrowLeft size={15} /> Home
          </Link>
          <button type="button" onClick={toggle} aria-label="Switch between light and dark mode" className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft hover:bg-surface hover:text-ink">
            <Moon size={18} className="dark:hidden" />
            <Sun size={18} className="hidden dark:block" />
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 pb-16 pt-12 sm:px-6 sm:pt-16">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ type: "spring", stiffness: 140, damping: 20 }}>
          <p className="text-sm font-semibold uppercase tracking-wider text-ink-soft">Last updated {LEGAL.lastUpdated}</p>
          <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">{title}</h1>
          <div className="mt-4 max-w-2xl text-lg leading-relaxed text-ink-soft">{intro}</div>
        </motion.div>

        <div className="mt-10 grid gap-8 lg:grid-cols-[240px_1fr]">
          <nav aria-label="On this page" className="lg:sticky lg:top-24 lg:self-start">
            <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-ink-faint">On this page</p>
            <ol className="space-y-1 text-sm">
              {sections.map((s, i) => (
                <li key={s.id}>
                  <a href={`#${s.id}`} className="flex gap-2 rounded-lg px-2 py-1.5 text-ink-soft hover:bg-surface hover:text-ink">
                    <span className="w-5 shrink-0 tabular-nums text-ink-faint">{i + 1}.</span>{s.title}
                  </a>
                </li>
              ))}
            </ol>
          </nav>

          <div className="glass rounded-[28px] p-6 sm:p-10">
            <div className="space-y-10">
              {sections.map((s, i) => (
                <section key={s.id} id={s.id} className="scroll-mt-24">
                  <h2 className="text-xl font-bold tracking-tight"><span className="mr-2 text-ink-faint">{i + 1}.</span>{s.title}</h2>
                  <div className="legal-prose mt-3 space-y-3 text-[15px] leading-relaxed text-ink-soft">{s.body}</div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </main>

      <footer className="border-t border-border-soft px-4 py-8">
        <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-3 text-sm text-ink-soft sm:flex-row">
          <p>© {new Date().getFullYear()} {LEGAL.operator}</p>
          <nav className="flex gap-5">
            <Link href="/privacy" className="hover:text-ink">Privacy</Link>
            <Link href="/terms" className="hover:text-ink">Terms</Link>
            <Link href="/auth/login" className="hover:text-ink">Sign in</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}

/** A bulleted list styled for the legal pages. */
export function Bullets({ items }: { items: ReactNode[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item, i) => (
        <li key={i} className="flex gap-2.5"><span className="mt-[9px] h-1.5 w-1.5 shrink-0 rounded-full bg-ink-faint" aria-hidden="true" /><span>{item}</span></li>
      ))}
    </ul>
  );
}

/** How to reach the operator, or nothing while no address is set. */
export function ContactLine() {
  if (!LEGAL.contactEmail) {
    return <p>Most requests can be handled inside Biz44: you can correct your details or delete your account under Your profile, and your company&apos;s administrator can change or delete company information under Settings. Team members should ask their company&apos;s administrator first.</p>;
  }
  return <p>Email <a className="font-semibold text-ink underline underline-offset-2" href={`mailto:${LEGAL.contactEmail}`}>{LEGAL.contactEmail}</a>. We aim to answer within 30 days.</p>;
}
