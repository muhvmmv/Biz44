import Link from "next/link";

interface AuthLayoutProps {
  children: React.ReactNode;
  title: string;
  subtitle?: string;
  footer?: React.ReactNode;
}

export default function AuthLayout({ children, title, subtitle, footer }: AuthLayoutProps) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-neutral-50">
      <div className="mb-8 text-center">
        <Link href="/" className="inline-flex items-center gap-2 font-bold text-xl text-neutral-900">
          <span className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-white text-sm font-extrabold">
            B
          </span>
          Biz44
        </Link>
      </div>

      <div className="w-full max-w-md bg-white rounded-2xl shadow-xl border border-neutral-200 p-8 sm:p-10">
        <h1 className="text-2xl font-bold text-neutral-900 mb-1">{title}</h1>
        {subtitle && <p className="text-neutral-500 mb-6">{subtitle}</p>}
        {children}
      </div>

      {footer && <div className="mt-6 text-sm text-neutral-500">{footer}</div>}

      <p className="mt-10 text-xs text-neutral-400">
        &copy; {new Date().getFullYear()} Biz44. All rights reserved.
      </p>
    </div>
  );
}