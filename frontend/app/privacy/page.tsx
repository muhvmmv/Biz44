"use client";

import Link from "next/link";
import LegalPage, { Bullets, ContactLine } from "@/components/legal/LegalPage";
import { LEGAL } from "@/lib/legal";

const strong = (t: string) => <strong className="font-semibold text-ink">{t}</strong>;

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={<>What Biz44 stores, why, who can see it, and how to delete it. We wrote it to match what the app actually does.</>}
      sections={[
        {
          id: "who",
          title: "Who we are",
          body: (
            <>
              <p>Biz44 is business management software run by {LEGAL.operator} (&quot;we&quot;). This policy covers the Biz44 website and app.</p>
              <p>A company that signs up controls its own records. For information about its customers, suppliers and employees that a company enters into Biz44, the company decides what is entered and why, and we process it on the company&apos;s behalf.</p>
            </>
          ),
        },
        {
          id: "collect",
          title: "What we store",
          body: (
            <Bullets items={[
              <>{strong("Your account:")} first and last name, email address, your role, and your password. Passwords are stored only as a one-way hash (bcrypt), so nobody, including us, can read them.</>,
              <>{strong("Your company:")} its name, contact details, country, currency, VAT rate and VAT number, branches, and settings.</>,
              <>{strong("Business records you enter:")} products and stock, purchases, production, invoices, payments, expenses, cash and bank account balances, journal entries, and details of your customers and suppliers.</>,
              <>{strong("Staff records you enter:")} employee names, contact details, salaries, payroll, attendance and leave.</>,
              <>{strong("Server logs:")} when your browser talks to our servers, each request is logged with the time, the address requested and the response, for security and to fix problems.</>,
            ]} />
          ),
        },
        {
          id: "device",
          title: "What is kept on your device",
          body: (
            <>
              <p>Biz44 keeps a few items in your browser&apos;s local storage: your sign-in token, your light or dark mode choice, the branch you last selected, and whether the sidebar is open.</p>
              <p>We do not use advertising cookies, analytics trackers or social media pixels. Signing out removes the sign-in token.</p>
            </>
          ),
        },
        {
          id: "use",
          title: "How we use it",
          body: (
            <Bullets items={[
              "To run the service: show your records, calculate stock, costs and accounts, and keep you signed in.",
              "To keep it secure: check who is signing in, enforce each person's role, and investigate misuse.",
              "To fix problems and improve Biz44.",
              <>We do {strong("not")} sell your information, show you adverts, or use your business records for anything other than providing Biz44 to you.</>,
            ]} />
          ),
        },
        {
          id: "access",
          title: "Who can see it",
          body: (
            <>
              <p>Each company&apos;s records are kept separate. People in your company see what their role and branches allow, as set by your administrator. Other companies using Biz44 cannot see your records.</p>
              <p>We share information only with the providers that host and run Biz44 for us, under obligations to protect it, or when the law requires us to.</p>
            </>
          ),
        },
        {
          id: "security",
          title: "Security",
          body: (
            <Bullets items={[
              "Passwords are hashed, never stored in plain text.",
              "Sign-ins expire after 7 days. A deactivated or deleted account stops working straight away.",
              "Every request is checked against the person's company, role and branches.",
              "No system is perfectly secure. Use a strong password, and remove team members who leave.",
            ]} />
          ),
        },
        {
          id: "retention",
          title: "How long we keep it, and deleting it",
          body: (
            <>
              <p>We keep your information while your account or company is active.</p>
              <Bullets items={[
                <>{strong("Delete your account")} (Your profile → Delete account): your name, email and password are erased and you can no longer sign in. Invoices, payments and other records you made stay with your company, because its accounts must stay complete.</>,
                <>{strong("Delete your company")} (administrators only, same page): the company and all of its records, branches and team accounts are removed from Biz44 permanently.</>,
                "Deleted information may remain in server logs or backups for a limited time until they are overwritten.",
                "The law may require your company to keep accounting and tax records for several years. Export what you need before deleting the company.",
              ]} />
            </>
          ),
        },
        {
          id: "rights",
          title: "Your rights",
          body: (
            <>
              <p>Under the Nigeria Data Protection Act 2023 and similar laws, you can ask to see the personal information we hold about you, correct it, delete it, or object to how it is used. You can also complain to {LEGAL.regulator}.</p>
              <p>If your information was entered by a company you work with or buy from, ask that company first: it controls those records.</p>
            </>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: <p>Biz44 is for businesses and is not meant for anyone under 18.</p>,
        },
        {
          id: "changes",
          title: "Changes to this policy",
          body: <p>If we change this policy, we will update the date at the top. If a change affects how we use your information in an important way, we will tell account holders before it takes effect.</p>,
        },
        {
          id: "contact",
          title: "Contact",
          body: (
            <>
              <ContactLine />
              <p>See also our <Link href="/terms" className="font-semibold text-ink underline underline-offset-2">Terms of Service</Link>.</p>
            </>
          ),
        },
      ]}
    />
  );
}
