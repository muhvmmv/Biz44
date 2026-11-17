"use client";

import Link from "next/link";
import LegalPage, { Bullets, ContactLine } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={<>The agreement between you and {LEGAL.operator} when you use Biz44. Please read it before creating a company.</>}
      sections={[
        {
          id: "agreement",
          title: "Using Biz44",
          body: (
            <>
              <p>By creating an account or using Biz44 you agree to these terms and to our <Link href="/privacy" className="font-semibold text-ink underline underline-offset-2">Privacy Policy</Link>. If you create a company, you accept these terms on behalf of that business and confirm you are allowed to do so.</p>
              <p>You must be at least 18 years old to use Biz44.</p>
            </>
          ),
        },
        {
          id: "accounts",
          title: "Accounts and your team",
          body: (
            <Bullets items={[
              "Give accurate details and keep your password private.",
              "The person who creates a company is its first administrator. Administrators add team members, choose their roles and branches, and are responsible for who has access.",
              "Remove or deactivate people who should no longer have access.",
              "You are responsible for what is done through your company's accounts.",
            ]} />
          ),
        },
        {
          id: "data",
          title: "Your data",
          body: (
            <>
              <p>Your business records belong to you. You allow us to store and process them only to provide Biz44 to you.</p>
              <p>You are responsible for having the right to enter information about your customers, suppliers and employees, and for using it lawfully.</p>
            </>
          ),
        },
        {
          id: "use",
          title: "Acceptable use",
          body: (
            <>
              <p>Do not:</p>
              <Bullets items={[
                "use Biz44 for anything illegal, including fraud or false accounting;",
                "try to reach another company's records, or get around roles and permissions;",
                "attack, overload, copy or reverse-engineer the service;",
                "upload malicious code, or share your access with people outside your business.",
              ]} />
            </>
          ),
        },
        {
          id: "advice",
          title: "Accounting, tax and payroll",
          body: (
            <>
              <p>Biz44 calculates stock, costs, VAT, payroll and accounts from the information you enter. It is a tool, not professional advice.</p>
              <p>You are responsible for checking the figures, keeping the records the law requires, and filing returns and paying taxes on time. Ask a qualified accountant if you are unsure.</p>
            </>
          ),
        },
        {
          id: "service",
          title: "The service",
          body: (
            <>
              <p>We work to keep Biz44 available and accurate, but it is provided &quot;as is&quot; and may sometimes be unavailable, for example during maintenance. We may add, change or remove features.</p>
              <p>Keep your own copies of important reports, such as your statements and tax summaries.</p>
              <p>If we introduce paid plans, we will tell you in advance and you can decide before you are charged.</p>
            </>
          ),
        },
        {
          id: "ending",
          title: "Ending your use",
          body: (
            <>
              <p>You can stop at any time. You can delete your account, or as an administrator your whole company, under Your profile → Delete account. What is deleted is explained in the <Link href="/privacy#retention" className="font-semibold text-ink underline underline-offset-2">Privacy Policy</Link>.</p>
              <p>We may suspend or close an account that breaks these terms or puts other users or the service at risk. Where reasonable, we will warn you first and give you a chance to export your records.</p>
            </>
          ),
        },
        {
          id: "liability",
          title: "Liability",
          body: (
            <>
              <p>As far as the law allows, we are not liable for indirect losses such as lost profits, lost business or lost data, or for losses caused by information entered incorrectly or by events outside our reasonable control.</p>
              <p>Nothing in these terms limits liability that cannot be limited by law.</p>
            </>
          ),
        },
        {
          id: "law",
          title: "Governing law",
          body: <p>These terms are governed by the laws of {LEGAL.governingLaw}. We will first try to settle any disagreement with you directly and in good faith.</p>,
        },
        {
          id: "changes",
          title: "Changes to these terms",
          body: <p>If we change these terms, we will update the date at the top and tell account holders about important changes before they take effect. Continuing to use Biz44 after that means you accept the new terms.</p>,
        },
        {
          id: "contact",
          title: "Contact",
          body: <ContactLine />,
        },
      ]}
    />
  );
}
