import Link from "next/link";

const footerLinks = {
  Company: ["About", "Careers", "Blog", "Press"],
  Product: ["Features", "Pricing", "Integrations", "Changelog"],
  Resources: ["Help Center", "API Docs", "Community", "Status"],
  Support: ["Contact", "Privacy", "Terms", "Security"],
};

export default function Footer() {
  return (
    <footer className="bg-neutral-900 text-neutral-300 py-16">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-8">
          <div className="col-span-2 md:col-span-1">
            <Link href="/" className="text-white font-bold text-xl flex items-center gap-2">
              <span className="w-8 h-8 bg-emerald-600 rounded-lg flex items-center justify-center text-sm font-extrabold text-white">
                B
              </span>
              Biz44
            </Link>
            <p className="mt-3 text-sm text-neutral-400">
              Run your entire business from one platform.
            </p>
          </div>
          {Object.entries(footerLinks).map(([title, links]) => (
            <div key={title}>
              <h4 className="font-semibold text-white text-sm mb-4">{title}</h4>
              <ul className="space-y-2">
                {links.map((item) => (
                  <li key={item}>
                    <Link
                      href="#"
                      className="text-sm text-neutral-400 hover:text-white transition-colors"
                    >
                      {item}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
        <div className="mt-12 pt-8 border-t border-neutral-800 flex flex-col sm:flex-row justify-between items-center">
          <p className="text-sm text-neutral-500">
            © {new Date().getFullYear()} Biz44. All rights reserved.
          </p>
          <div className="flex gap-6 mt-4 sm:mt-0">
            <Link href="#" className="text-sm text-neutral-500 hover:text-white">
              Privacy Policy
            </Link>
            <Link href="#" className="text-sm text-neutral-500 hover:text-white">
              Terms of Service
            </Link>
          </div>
        </div>
      </div>
    </footer>
  );
}