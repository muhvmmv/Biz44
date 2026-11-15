"use client";

import { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import { motion } from "framer-motion";
import { ArrowLeft, BadgeCheck, Moon, Sun } from "lucide-react";
import { ThemeProvider, useTheme } from "@/hooks/useTheme";

interface AuthLayoutProps {
  children: ReactNode;
  title: string;
  subtitle?: ReactNode;
  footer?: ReactNode;
  /** Screenshot shown beside the form (from /public/landing). */
  shot?: string;
  points?: string[];
}

/**
 * Sign in / sign up / reset: the form on the left, a real screen of the app
 * on the right, in the same design and light/dark theme as the app.
 */
export default function AuthLayout(props: AuthLayoutProps) {
  return (
    <ThemeProvider>
      <Shell {...props} />
    </ThemeProvider>
  );
}

function Shell({ children, title, subtitle, footer, shot = "dashboard", points }: AuthLayoutProps) {
  const { toggle } = useTheme();
  return (
    <div className="ambient-bg flex min-h-screen text-ink">
      {/* Form */}
      <div className="relative flex w-full flex-col px-5 py-6 sm:px-10 lg:w-[48%] xl:w-[44%]">
        <div className="flex items-center justify-between">
          <Link href="/" className="flex items-center gap-2.5" aria-label="Biz44 home">
            <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br from-orange-400 via-orange-500 to-orange-700 text-[11px] font-extrabold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]">B44</span>
            <span className="text-[17px] font-bold tracking-tight">Biz44</span>
          </Link>
          <div className="flex items-center gap-1">
            <Link href="/" className="hidden items-center gap-1 rounded-full px-3 py-2 text-sm text-ink-soft hover:bg-surface hover:text-ink sm:flex">
              <ArrowLeft size={15} /> Home
            </Link>
            <button
              type="button"
              onClick={toggle}
              aria-label="Switch between light and dark mode"
              className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface hover:text-ink"
            >
              <Moon size={18} className="dark:hidden" />
              <Sun size={18} className="hidden dark:block" />
            </button>
          </div>
        </div>

        <div className="flex flex-1 items-center justify-center py-10">
          <motion.div
            initial={{ opacity: 0, y: 16 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ type: "spring", stiffness: 140, damping: 20 }}
            className="w-full max-w-[420px]"
          >
            <h1 className="text-3xl font-bold tracking-tight sm:text-[34px]">{title}</h1>
            {subtitle && <p className="mt-2 text-ink-soft">{subtitle}</p>}
            <div className="glass mt-7 rounded-[26px] p-6 sm:p-7">{children}</div>
            {footer && <div className="mt-6 text-center text-sm text-ink-soft">{footer}</div>}
          </motion.div>
        </div>

        <p className="text-center text-xs text-ink-faint">© {new Date().getFullYear()} Biz44</p>
      </div>

      {/* Showcase */}
      <div className="relative hidden flex-1 p-3 lg:block">
        <div className="relative flex h-full flex-col overflow-hidden rounded-[32px] bg-charcoal text-ivory">
          <motion.span aria-hidden="true" className="pointer-events-none absolute -right-28 -top-28 h-80 w-80 rounded-full border-[44px] border-ivory/5" animate={{ rotate: 360 }} transition={{ duration: 90, repeat: Infinity, ease: "linear" }} />
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-40 -left-24 h-96 w-96 rounded-full bg-ivory/5 blur-3xl" />
          <div className="relative px-10 pt-12 xl:px-14 xl:pt-16">
            <p className="text-sm font-semibold uppercase tracking-wider opacity-60">Biz44</p>
            <h2 className="mt-3 max-w-md text-3xl font-bold leading-tight tracking-tight xl:text-4xl">From raw materials to profit, in one place.</h2>
            {points && (
              <ul className="mt-6 space-y-2.5 text-[15px] opacity-80">
                {points.map((p, i) => (
                  <motion.li key={p} initial={{ opacity: 0, x: -10 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: 0.3 + i * 0.08 }} className="flex items-start gap-2.5">
                    <BadgeCheck size={17} className="mt-0.5 shrink-0" />{p}
                  </motion.li>
                ))}
              </ul>
            )}
          </div>
          <motion.div
            initial={{ opacity: 0, y: 40, rotate: -2 }}
            animate={{ opacity: 1, y: 0, rotate: -2 }}
            transition={{ delay: 0.25, type: "spring", stiffness: 80, damping: 18 }}
            className="relative mt-auto translate-x-10 translate-y-6 pl-10 xl:pl-14"
          >
            <div className="overflow-hidden rounded-tl-[20px] border-l border-t border-ivory/15 shadow-[0_-20px_60px_-10px_rgb(0_0_0/0.5)]">
              <Image src={`/landing/${shot}-light.jpg`} alt="A screen from Biz44" width={2160} height={1350} sizes="55vw" className="block h-auto w-[130%] max-w-none dark:hidden" priority />
              <Image src={`/landing/${shot}-dark.jpg`} alt="A screen from Biz44" width={2160} height={1350} sizes="55vw" className="hidden h-auto w-[130%] max-w-none dark:block" priority />
            </div>
          </motion.div>
        </div>
      </div>
    </div>
  );
}

/** Orange primary button used on the auth forms. */
export const authPrimary =
  "group relative flex w-full items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 px-5 py-3 text-sm font-bold text-white shadow-[0_10px_24px_-8px_rgb(240_90_40/0.7)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-8px_rgb(240_90_40/0.8)] disabled:pointer-events-none disabled:opacity-60";
