import Link from "next/link";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
}

export default function AuthLayout({ children, title, subtitle, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-ivory">
      <div className="mb-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2 font-bold text-xl text-charcoal">
          <span className="w-8 h-8 bg-brand rounded-lg flex items-center justify-center text-white text-sm font-extrabold">
            B
          </span>
          Biz44
        </Link>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-border-soft p-8 sm:p-10">
        <h1 className="text-2xl font-bold text-ink mb-1">{title}</h1>
        {subtitle && <p className="text-ink-soft mb-6">{subtitle}</p>}
        {children}
      </div>

      {footer && <div className="mt-6 text-sm text-ink-soft">{footer}</div>}

      <p className="mt-10 text-xs text-ink-soft">
        &copy; {new Date().getFullYear()} Biz44. All rights reserved.
      </p>
    </div>
  );
}