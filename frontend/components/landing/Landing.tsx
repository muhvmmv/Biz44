"use client";

import { ReactNode, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { AnimatePresence, motion, useReducedMotion, useScroll, useTransform } from "framer-motion";
import {
  ArrowRight, BadgeCheck, Boxes, Building2, Calculator, Factory, FileText, Layers, LayoutGrid, LockKeyhole, Moon,
  PackageCheck, Receipt, Scale, ShieldCheck, ShoppingCart, Sun, Truck, Users, Wallet,
} from "lucide-react";
import { useTheme } from "@/hooks/useTheme";
import { cn } from "@/lib/utils";

/* =====================================================================
   Biz44 landing page. Every screenshot is the real app (sample company),
   in the theme the visitor is using; every claim describes what the
   product actually does.
   ===================================================================== */

const reveal = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0, transition: { type: "spring" as const, stiffness: 120, damping: 20 } },
};

function Reveal({ children, className, delay = 0 }: { children: ReactNode; className?: string; delay?: number }) {
  return (
    <motion.div
      className={className}
      initial="hidden"
      whileInView="show"
      viewport={{ once: true, margin: "-80px" }}
      variants={reveal}
      transition={{ delay }}
    >
      {children}
    </motion.div>
  );
}

/** A screenshot in the visitor's theme (both are rendered; CSS shows one). */
function Shot({ name, alt, className, priority }: { name: string; alt: string; className?: string; priority?: boolean }) {
  return (
    <>
      <Image src={`/landing/${name}-light.jpg`} alt={alt} width={2160} height={1350} priority={priority} sizes="(min-width: 1280px) 1200px, 100vw" className={cn("block h-auto w-full dark:hidden", className)} />
      <Image src={`/landing/${name}-dark.jpg`} alt={alt} width={2160} height={1350} priority={priority} sizes="(min-width: 1280px) 1200px, 100vw" className={cn("hidden h-auto w-full dark:block", className)} />
    </>
  );
}

/** Browser-style frame around a screenshot. */
function Frame({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cn("overflow-hidden rounded-[22px] border border-border-soft bg-surface shadow-[0_40px_80px_-30px_rgb(16_16_20/0.35)] dark:shadow-[0_40px_80px_-30px_rgb(0_0_0/0.9)]", className)}>
      <div className="flex items-center gap-1.5 border-b border-border-soft bg-surface-muted px-4 py-2.5">
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="h-2.5 w-2.5 rounded-full bg-border-strong" />
        <span className="ml-3 rounded-md bg-surface px-3 py-0.5 text-[11px] text-ink-faint">biz44 · dashboard</span>
      </div>
      {children}
    </div>
  );
}

function Logo() {
  return (
    <span className="flex h-9 w-9 items-center justify-center rounded-[11px] bg-gradient-to-br from-orange-400 via-orange-500 to-orange-700 text-[11px] font-extrabold text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.35)]">
      B44
    </span>
  );
}

const primaryBtn =
  "group relative inline-flex items-center justify-center gap-2 overflow-hidden rounded-full bg-gradient-to-br from-orange-400 via-orange-500 to-orange-600 px-6 py-3.5 text-sm font-bold text-white shadow-[0_10px_24px_-8px_rgb(240_90_40/0.7)] transition-all hover:-translate-y-0.5 hover:shadow-[0_14px_30px_-8px_rgb(240_90_40/0.8)]";
const secondaryBtn =
  "inline-flex items-center justify-center gap-2 rounded-full border border-border-soft bg-surface/80 px-6 py-3.5 text-sm font-bold text-ink shadow-card transition-all hover:-translate-y-0.5 hover:shadow-raised";

// =====================================================================
export default function Landing() {
  return (
    <div className="ambient-bg min-h-screen text-ink">
      <Nav />
      <main>
        <Hero />
        <Modules />
        <Features />
        <Showcase />
        <Workflow />
        <Trust />
        <ThemeCompare />
        <FinalCta />
      </main>
      <Footer />
    </div>
  );
}

// ---------------------------------------------------------------- nav
function Nav() {
  const { toggle } = useTheme();
  const links = [
    ["Features", "#features"],
    ["Screens", "#screens"],
    ["How it works", "#how"],
    ["Why Biz44", "#trust"],
  ];
  return (
    <motion.header
      initial={{ y: -30, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ type: "spring", stiffness: 140, damping: 20 }}
      className="fixed inset-x-0 top-4 z-50 px-4"
    >
      <nav className="glass-strong mx-auto flex max-w-5xl items-center gap-2 rounded-full py-2 pl-3 pr-2">
        <Link href="/" className="flex items-center gap-2.5 pr-2" aria-label="Biz44 home">
          <Logo />
          <span className="text-[17px] font-bold tracking-tight">Biz44</span>
        </Link>
        <div className="hidden flex-1 items-center justify-center gap-1 md:flex">
          {links.map(([label, href]) => (
            <a key={href} href={href} className="rounded-full px-3.5 py-2 text-sm font-medium text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink">{label}</a>
          ))}
        </div>
        <div className="ml-auto flex items-center gap-1.5 md:ml-0">
          <button
            type="button"
            onClick={toggle}
            aria-label="Switch between light and dark mode"
            className="flex h-10 w-10 items-center justify-center rounded-full text-ink-soft transition-colors hover:bg-surface-muted hover:text-ink"
          >
            {/* Both icons are rendered and CSS shows one, so server and browser markup match. */}
            <Moon size={18} className="transition-transform duration-300 hover:-rotate-12 dark:hidden" />
            <Sun size={18} className="hidden transition-transform duration-300 hover:rotate-45 dark:block" />
          </button>
          <Link href="/auth/login" className="hidden rounded-full px-4 py-2 text-sm font-semibold text-ink hover:bg-surface-muted sm:block">Sign in</Link>
          <Link href="/auth/register" className="rounded-full bg-charcoal px-4 py-2.5 text-sm font-semibold text-ivory transition-colors hover:bg-charcoal-dark">Get started</Link>
        </div>
      </nav>
    </motion.header>
  );
}

// ---------------------------------------------------------------- hero
function Hero() {
  const ref = useRef<HTMLDivElement>(null);
  const reduce = useReducedMotion();
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const rotateX = useTransform(scrollYProgress, [0, 0.5], reduce ? [0, 0] : [16, 0]);
  const scale = useTransform(scrollYProgress, [0, 0.5], reduce ? [1, 1] : [0.94, 1]);
  const y = useTransform(scrollYProgress, [0, 0.5], reduce ? [0, 0] : [30, 0]);

  return (
    <section ref={ref} className="relative overflow-hidden px-4 pb-16 pt-36 sm:pt-44">
      <div className="mx-auto max-w-4xl text-center">
        <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.1 }}>
          <span className="inline-flex items-center gap-2 rounded-full border border-border-soft bg-surface/80 px-3.5 py-1.5 text-xs font-semibold text-ink-soft shadow-card">
            <LayoutGrid size={14} /> The ultimate business management tool
          </span>
        </motion.div>
        <motion.h1
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.18, type: "spring", stiffness: 110, damping: 18 }}
          className="mt-6 text-[40px] font-bold leading-[1.05] tracking-tight sm:text-6xl lg:text-7xl"
        >
          Run your entire business<br className="hidden sm:block" /> from one place.
        </motion.h1>
        <motion.p
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.28 }}
          className="mx-auto mt-6 max-w-2xl text-lg leading-relaxed text-ink-soft"
        >
          Biz44 records what you buy, sell and make, tracks stock and money across every branch,
          and keeps your books balanced as you go. Every number on the dashboard comes from the transactions you enter.
        </motion.p>
        <motion.div
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.38 }}
          className="mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row"
        >
          <Link href="/auth/register" className={primaryBtn}>
            <span className="pointer-events-none absolute inset-0 -translate-x-full bg-gradient-to-r from-transparent via-white/30 to-transparent transition-transform duration-700 group-hover:translate-x-full" aria-hidden="true" />
            Create your company <ArrowRight size={16} className="transition-transform group-hover:translate-x-0.5" />
          </Link>
          <Link href="/auth/login" className={secondaryBtn}>Sign in</Link>
        </motion.div>
        <motion.ul
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.55 }}
          className="mt-8 flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-soft"
        >
          {["Double-entry accounting", "Stock costed batch by batch", "Several branches", "Light & dark mode"].map((t) => (
            <li key={t} className="flex items-center gap-1.5"><BadgeCheck size={15} className="text-ink" />{t}</li>
          ))}
        </motion.ul>
      </div>

      <div className="relative mx-auto mt-16 max-w-6xl [perspective:1600px]">
        <motion.div style={{ rotateX, scale, y }} initial={{ opacity: 0, y: 60 }} animate={{ opacity: 1 }} transition={{ delay: 0.45, duration: 0.8 }} className="origin-top">
          <Frame><Shot name="dashboard" alt="The Biz44 dashboard: cash and bank balances, sales, profit and what needs attention" priority /></Frame>
        </motion.div>
        <FloatingNote className="-left-2 top-[22%] hidden lg:flex" delay={1.1} icon={<Layers size={15} />} title="Cost per unit" text="from the batches actually used" />
        <FloatingNote className="-right-4 top-[48%] hidden lg:flex" delay={1.3} icon={<Wallet size={15} />} title="Deposits" text="applied when you invoice" />
        <FloatingNote className="bottom-[10%] left-[18%] hidden lg:flex" delay={1.5} icon={<Scale size={15} />} title="Books balance" text="on every transaction" />
      </div>
    </section>
  );
}

function FloatingNote({ className, delay, icon, title, text }: { className?: string; delay: number; icon: ReactNode; title: string; text: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.9, y: 10 }}
      animate={{ opacity: 1, scale: 1, y: [0, -6, 0] }}
      transition={{ opacity: { delay }, scale: { delay, type: "spring" }, y: { delay: delay + 0.4, duration: 5, repeat: Infinity, ease: "easeInOut" } }}
      className={cn("glass-strong absolute z-10 items-center gap-3 rounded-2xl px-4 py-3", className)}
    >
      <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-charcoal text-ivory">{icon}</span>
      <span className="text-left leading-tight">
        <span className="block text-sm font-bold">{title}</span>
        <span className="block text-xs text-ink-soft">{text}</span>
      </span>
    </motion.div>
  );
}

// ---------------------------------------------------------------- modules strip
function Modules() {
  const items: [ReactNode, string][] = [
    [<Receipt key="r" size={16} />, "Sales"], [<Boxes key="b" size={16} />, "Inventory"], [<ShoppingCart key="s" size={16} />, "Purchasing"],
    [<Wallet key="w" size={16} />, "Cash & Banks"], [<Calculator key="c" size={16} />, "Accounting & VAT"], [<Factory key="f" size={16} />, "Production"],
    [<FileText key="fi" size={16} />, "Reports"], [<Users key="u" size={16} />, "Team & roles"],
  ];
  return (
    <section className="border-y border-border-soft bg-surface/50 py-6 backdrop-blur">
      <div className="mx-auto flex max-w-6xl flex-wrap items-center justify-center gap-x-8 gap-y-3 px-4 text-sm font-semibold text-ink-soft">
        {items.map(([icon, label]) => (
          <span key={label} className="flex items-center gap-2">{icon}{label}</span>
        ))}
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- features (bento)
function Features() {
  return (
    <section id="features" className="scroll-mt-24 px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Features" title="Everything a business runs on" text="One system from buying to selling, so stock, costs and money always agree with each other." />
        <div className="mt-14 grid gap-5 md:grid-cols-6">
          <Bento className="md:col-span-4" icon={<Receipt size={18} />} title="Sales" image="invoice"
            points={["Invoices with discounts and VAT", "Deposits on customer orders, applied automatically", "Returns and credit notes, back into the right batches", "Customer statements with ageing"]} />
          <Bento className="md:col-span-2" icon={<Boxes size={18} />} title="Inventory"
            points={["Goods for sale, plus materials and packaging if you make things", "Decimal quantities: kg, bags, litres", "Stock per branch, with transfers between them", "Stock counts, write-offs and a stock check"]} />
          <Bento className="md:col-span-2" icon={<ShoppingCart size={18} />} title="Purchasing"
            points={["Suppliers, deliveries and what you owe", "Pay now, part or on credit with a due date", "VAT on deliveries recorded as recoverable", "Returns to supplier, refunded or deducted"]} />
          <Bento className="md:col-span-4" icon={<Factory size={18} />} title="Production, if you make what you sell" image="production"
            points={["A bill of materials (recipe) for each product", "Materials leave stock oldest batch first and move into work in progress", "Finished goods enter stock at their actual cost per unit", "Turn it off for shops: a store branch only receives and sells"]} />
          <Bento className="md:col-span-3" icon={<Calculator size={18} />} title="Accounting"
            points={["Double-entry ledger behind every transaction", "Profit & loss, balance sheet, trial balance, cash flow", "Several bank accounts and cash, with transfers", "VAT owed, VAT recoverable, set-off and payment"]} />
          <Bento className="md:col-span-3" icon={<Users size={18} />} title="Your team"
            points={["Admin, manager, accountant, storekeeper and sales roles", "Each person sees only what their role allows", "Access per branch", "Deactivate someone and it applies at once"]} />
        </div>
      </div>
    </section>
  );
}

function SectionHead({ eyebrow, title, text }: { eyebrow: string; title: string; text: string }) {
  return (
    <Reveal className="mx-auto max-w-2xl text-center">
      <p className="text-sm font-semibold uppercase tracking-wider text-ink-faint">{eyebrow}</p>
      <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">{title}</h2>
      <p className="mt-4 text-lg text-ink-soft">{text}</p>
    </Reveal>
  );
}

function Bento({ className, icon, title, points, image }: { className?: string; icon: ReactNode; title: string; points: string[]; image?: string }) {
  return (
    <Reveal className={cn("group relative overflow-hidden rounded-[28px] border border-border-soft bg-surface p-7 shadow-card transition-all hover:-translate-y-1 hover:shadow-raised", className)}>
      <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-charcoal text-ivory">{icon}</span>
      <h3 className="mt-5 text-xl font-bold tracking-tight">{title}</h3>
      <ul className="mt-3 space-y-2 text-[15px] text-ink-soft">
        {points.map((p) => <li key={p} className="flex gap-2"><span className="mt-2 h-1.5 w-1.5 shrink-0 rounded-full bg-ink" />{p}</li>)}
      </ul>
      {image && (
        <div className="-mb-7 -mr-7 mt-6 overflow-hidden rounded-tl-2xl border-l border-t border-border-soft transition-transform duration-500 group-hover:-translate-y-1">
          <Shot name={image} alt={`${title} screen in Biz44`} className="object-cover object-left-top" />
        </div>
      )}
    </Reveal>
  );
}

// ---------------------------------------------------------------- screens
const SCREENS = [
  { key: "dashboard", label: "Dashboard", title: "Your business at a glance", text: "Cash in every account, sales, profit, what is owed, and what needs attention today." },
  { key: "production", label: "Production", title: "A production run, costed", text: "Materials used, cost per unit, the customer's deposit and the invoice, on one page." },
  { key: "invoice", label: "Invoice", title: "Invoices that print well", text: "Discounts, VAT, payments and balance due, with your company details." },
  { key: "vat", label: "VAT", title: "VAT, worked out for you", text: "Output VAT on sales, input VAT on purchases, set-off and what you owe the tax office." },
  { key: "statement", label: "Statements", title: "Customer statements", text: "Every invoice, payment, deposit and credit with a running balance and ageing." },
  { key: "margins", label: "Margins", title: "Profit by product", text: "Sales after discounts against the actual cost of the batches each sale used." },
  { key: "products", label: "Products", title: "Stock by type", text: "Every product with its quantity and value at cost, by type and by branch." },
];

function Showcase() {
  const [active, setActive] = useState(0);
  const s = SCREENS[active];
  return (
    <section id="screens" className="scroll-mt-24 px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Screens" title="See it before you start" text="These are real screens from Biz44, recorded with a sample company." />
        <Reveal className="mt-10 flex justify-center">
          <div className="no-scrollbar flex max-w-full gap-1 overflow-x-auto rounded-full border border-border-soft bg-surface/80 p-1 shadow-card" role="tablist" aria-label="Screens">
            {SCREENS.map((x, i) => (
              <button
                key={x.key}
                role="tab"
                aria-selected={active === i}
                onClick={() => setActive(i)}
                className={cn("relative shrink-0 rounded-full px-4 py-2 text-sm font-semibold transition-colors", active === i ? "text-ivory" : "text-ink-soft hover:text-ink")}
              >
                {active === i && <motion.span layoutId="screen-pill" className="absolute inset-0 rounded-full bg-charcoal" transition={{ type: "spring", stiffness: 420, damping: 34 }} />}
                <span className="relative">{x.label}</span>
              </button>
            ))}
          </div>
        </Reveal>
        <div className="mt-10">
          <AnimatePresence mode="wait">
            <motion.div key={s.key} initial={{ opacity: 0, y: 16, scale: 0.985 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.99 }} transition={{ duration: 0.3 }}>
              <div className="mb-6 text-center">
                <h3 className="text-2xl font-bold tracking-tight">{s.title}</h3>
                <p className="mt-1 text-ink-soft">{s.text}</p>
              </div>
              <Frame><Shot name={s.key} alt={`${s.title} in Biz44`} /></Frame>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- workflow
function Workflow() {
  const steps = [
    { icon: <Truck size={18} />, title: "Buy stock", text: "Record a delivery from a supplier: paid, part-paid or on credit. Stock, the supplier balance and your bank update together." },
    { icon: <Factory size={18} />, title: "Make or move it", text: "Factories produce from a bill of materials at real cost. Stores receive goods by transfer, at the cost they were made or bought for." },
    { icon: <Receipt size={18} />, title: "Sell", text: "Invoice with discounts and VAT. Take deposits on customer orders and they apply automatically." },
    { icon: <Wallet size={18} />, title: "Get paid, see profit", text: "Payments land in the right account, and profit, VAT and stock are up to date on the dashboard." },
  ];
  return (
    <section id="how" className="scroll-mt-24 px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="How it works" title="One flow, from purchase to profit" text="You record the day as it happens. Biz44 keeps stock, costs and accounts in step." />
        <div className="relative mt-16 grid gap-5 md:grid-cols-4">
          <div className="absolute left-0 right-0 top-[38px] hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent md:block" aria-hidden="true" />
          {steps.map((st, i) => (
            <Reveal key={st.title} delay={i * 0.08} className="relative rounded-[24px] border border-border-soft bg-surface p-6 shadow-card">
              <div className="flex items-center gap-3">
                <span className="relative z-10 flex h-12 w-12 items-center justify-center rounded-2xl bg-charcoal text-ivory ring-8 ring-ivory">{st.icon}</span>
                <span className="text-sm font-bold text-ink-faint">0{i + 1}</span>
              </div>
              <h3 className="mt-5 text-lg font-bold">{st.title}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-ink-soft">{st.text}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- trust
function Trust() {
  const points = [
    { icon: <Scale size={18} />, title: "Books that balance", text: "Every sale, payment, delivery and production run posts a balanced double-entry. A trial balance check is built in." },
    { icon: <Layers size={18} />, title: "Real costs", text: "Stock is costed batch by batch, oldest first, so cost of sales and cost per unit reflect what you actually paid." },
    { icon: <PackageCheck size={18} />, title: "History is never rewritten", text: "Cancellations, returns and credit notes add reversing entries. Nothing is quietly edited or deleted." },
    { icon: <LockKeyhole size={18} />, title: "Your data is yours", text: "Each company's records are kept separate, and staff only see what their role and branches allow." },
    { icon: <Building2 size={18} />, title: "Several branches", text: "Factories, warehouses and shops each keep their own stock, with transfers that keep the cost of every batch." },
    { icon: <ShieldCheck size={18} />, title: "Checked on every change", text: "An automated test suite runs the money and stock rules on every update to Biz44." },
  ];
  return (
    <section id="trust" className="scroll-mt-24 px-4 py-24 sm:py-32">
      <div className="mx-auto grid max-w-6xl items-center gap-12 lg:grid-cols-2">
        <div>
          <Reveal>
            <p className="text-sm font-semibold uppercase tracking-wider text-ink-faint">Why Biz44</p>
            <h2 className="mt-3 text-3xl font-bold tracking-tight sm:text-5xl">Numbers you can rely on</h2>
            <p className="mt-4 text-lg text-ink-soft">Built around proper accounting, so the dashboard is never an estimate.</p>
          </Reveal>
          <div className="mt-10 grid gap-6 sm:grid-cols-2">
            {points.map((p, i) => (
              <Reveal key={p.title} delay={i * 0.05}>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border-soft bg-surface text-ink shadow-card">{p.icon}</span>
                <h3 className="mt-3 font-bold">{p.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-ink-soft">{p.text}</p>
              </Reveal>
            ))}
          </div>
        </div>
        <Reveal className="relative">
          <motion.div whileHover={{ rotate: 0, scale: 1.01 }} initial={{ rotate: 2 }} className="origin-center">
            <Frame><Shot name="dashboard-lower" alt="Inventory by stage, production, top customers and recent invoices in Biz44" /></Frame>
          </motion.div>
          <div className="absolute -bottom-8 -left-6 w-2/3 -rotate-3 sm:-left-10">
            <Frame><Shot name="statement" alt="A customer statement in Biz44" /></Frame>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- light / dark
function ThemeCompare() {
  const [pos, setPos] = useState(55);
  const box = useRef<HTMLDivElement>(null);
  const move = (clientX: number) => {
    const r = box.current?.getBoundingClientRect();
    if (r) setPos(Math.min(100, Math.max(0, ((clientX - r.left) / r.width) * 100)));
  };
  return (
    <section className="px-4 py-24 sm:py-32">
      <div className="mx-auto max-w-6xl">
        <SectionHead eyebrow="Light & dark" title="Easy on the eyes, day or night" text="Switch between light and dark mode any time. Drag to compare." />
        <Reveal className="mt-12">
          <div
            ref={box}
            className="relative cursor-ew-resize select-none overflow-hidden rounded-[22px] border border-border-soft shadow-[0_40px_80px_-30px_rgb(16_16_20/0.35)]"
            onPointerDown={(e) => { (e.target as HTMLElement).setPointerCapture?.(e.pointerId); move(e.clientX); }}
            onPointerMove={(e) => { if (e.buttons) move(e.clientX); }}
            role="slider"
            aria-label="Compare light and dark mode"
            aria-valuemin={0}
            aria-valuemax={100}
            aria-valuenow={Math.round(pos)}
            tabIndex={0}
            onKeyDown={(e) => { if (e.key === "ArrowLeft") setPos((p) => Math.max(0, p - 5)); if (e.key === "ArrowRight") setPos((p) => Math.min(100, p + 5)); }}
          >
            <Image src="/landing/panel-light.jpg" alt="Biz44 in light mode" width={2160} height={1350} sizes="(min-width: 1280px) 1200px, 100vw" className="block h-auto w-full" draggable={false} />
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
              <Image src="/landing/panel-dark.jpg" alt="Biz44 in dark mode" width={2160} height={1350} sizes="(min-width: 1280px) 1200px, 100vw" className="block h-auto w-full" draggable={false} />
            </div>
            <div className="pointer-events-none absolute inset-y-0" style={{ left: `${pos}%` }}>
              <div className="absolute inset-y-0 -translate-x-1/2 border-l-2 border-white/90 shadow-[0_0_20px_rgb(0_0_0/0.4)]" />
              <div className="absolute top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-zinc-900 shadow-lg">
                <Sun size={14} /><Moon size={14} />
              </div>
            </div>
            <span className="glass-strong pointer-events-none absolute left-4 top-4 rounded-full px-3 py-1 text-xs font-semibold">Light</span>
            <span className="pointer-events-none absolute right-4 top-4 rounded-full bg-black/60 px-3 py-1 text-xs font-semibold text-white backdrop-blur">Dark</span>
          </div>
        </Reveal>
      </div>
    </section>
  );
}

// ---------------------------------------------------------------- CTA + footer
function FinalCta() {
  return (
    <section className="px-4 pb-24">
      <Reveal className="mx-auto max-w-5xl">
        <div className="relative overflow-hidden rounded-[36px] bg-charcoal px-6 py-16 text-center text-ivory sm:px-12 sm:py-20">
          <motion.span aria-hidden="true" className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full border-[40px] border-ivory/5" animate={{ rotate: 360 }} transition={{ duration: 80, repeat: Infinity, ease: "linear" }} />
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-32 -left-20 h-72 w-72 rounded-full bg-ivory/5 blur-3xl" />
          <h2 className="relative text-3xl font-bold tracking-tight sm:text-5xl">Set up your company</h2>
          <p className="relative mx-auto mt-4 max-w-xl text-lg opacity-75">
            Create an account, add your branches and products, and start recording purchases, sales and payments.
          </p>
          <div className="relative mt-9 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link href="/auth/register" className={primaryBtn}>Create your company <ArrowRight size={16} /></Link>
            <Link href="/auth/login" className="inline-flex items-center justify-center rounded-full border border-ivory/20 px-6 py-3.5 text-sm font-bold transition-colors hover:bg-ivory/10">Sign in</Link>
          </div>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border-soft px-4 py-10">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-6 sm:flex-row">
        <div className="flex items-center gap-3">
          <Logo />
          <div>
            <p className="font-bold">Biz44</p>
            <p className="text-sm text-ink-soft">Sales, stock, purchasing and accounting in one place.</p>
          </div>
        </div>
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-ink-soft">
          <a href="#features" className="hover:text-ink">Features</a>
          <a href="#screens" className="hover:text-ink">Screens</a>
          <a href="#how" className="hover:text-ink">How it works</a>
          <Link href="/auth/login" className="hover:text-ink">Sign in</Link>
          <Link href="/auth/register" className="hover:text-ink">Create account</Link>
          <Link href="/privacy" className="hover:text-ink">Privacy</Link>
          <Link href="/terms" className="hover:text-ink">Terms</Link>
        </nav>
      </div>
      <p className="mx-auto mt-8 max-w-6xl text-center text-xs text-ink-faint sm:text-left">© {new Date().getFullYear()} Biz44</p>
    </footer>
  );
}
