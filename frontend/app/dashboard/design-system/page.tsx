"use client";

import { useState } from "react";
import { Plus, Download, Pencil, Package, MoreHorizontal, Trash2 } from "lucide-react";
import PageHeader from "@/components/ui/PageHeader";
import Button, { ButtonLink } from "@/components/ui/Button";
import Badge, { StatusBadge } from "@/components/ui/Badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import StatCard from "@/components/ui/StatCard";
import { Field, Input, Select, Textarea } from "@/components/ui/Input";
import NumericInput from "@/components/ui/NumericInput";
import Tabs from "@/components/ui/Tabs";
import DropdownMenu, { MenuButton, MenuDivider, MenuLabel } from "@/components/ui/DropdownMenu";
import DataTable, { Column } from "@/components/ui/DataTable";
import EmptyState from "@/components/ui/EmptyState";
import Dialog from "@/components/ui/Dialog";
import Skeleton from "@/components/ui/Skeleton";

/**
 * Living reference for the Biz44 design system. Not linked in the sidebar;
 * open /dashboard/design-system. Everything here is built from the shared
 * components, so it always shows exactly what the app uses.
 */

const COLORS: { name: string; token: string; use: string }[] = [
  { name: "brand", token: "bg-brand", use: "Accents: active marker, focus ring, charts, logo" },
  { name: "brand-dark", token: "bg-brand-dark", use: "Orange text and links (AA on white)" },
  { name: "brand-light", token: "bg-brand-light", use: "Selected and active backgrounds" },
  { name: "charcoal", token: "bg-charcoal", use: "Primary buttons, active pills" },
  { name: "ink", token: "bg-ink", use: "Main text" },
  { name: "ink-soft", token: "bg-ink-soft", use: "Secondary text" },
  { name: "ivory", token: "bg-ivory", use: "Page background" },
  { name: "surface", token: "bg-surface", use: "Cards, sidebar, header, inputs" },
  { name: "surface-muted", token: "bg-surface-muted", use: "Table headers, inset panels" },
  { name: "border-soft", token: "bg-border-soft", use: "Borders and dividers" },
  { name: "success", token: "bg-success", use: "Paid, profit, money in" },
  { name: "warning", token: "bg-warning", use: "Due soon, low stock" },
  { name: "danger", token: "bg-danger", use: "Overdue, loss, destructive" },
  { name: "info", token: "bg-info", use: "Partly paid, for information" },
];

interface Example { id: string; item: string; sku: string; qty: number; value: number; status: string }
const EXAMPLE_ROWS: Example[] = [
  { id: "1", item: "Maize Flour 1kg", sku: "MF-1", qty: 280, value: 252000, status: "in_stock" },
  { id: "2", item: "Packaging bag", sku: "PB-50", qty: 40, value: 1600, status: "low_stock" },
  { id: "3", item: "Labels (roll)", sku: "LB-R", qty: 0, value: 0, status: "out_of_stock" },
];

export default function DesignSystemPage() {
  const [tab, setTab] = useState<"all" | "unpaid" | "paid">("all");
  const [dialog, setDialog] = useState(false);
  const [num, setNum] = useState(0);
  const naira = (n: number) => `₦${n.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  const columns: Column<Example>[] = [
    { key: "item", header: "Item", sortValue: (r) => r.item, cell: (r) => <span className="font-medium">{r.item}</span> },
    { key: "sku", header: "SKU", hideBelow: "sm", cell: (r) => <span className="text-ink-soft">{r.sku}</span> },
    { key: "qty", header: "On hand", align: "right", sortValue: (r) => r.qty, cell: (r) => r.qty },
    { key: "value", header: "Value", align: "right", sortValue: (r) => r.value, cell: (r) => naira(r.value) },
    { key: "status", header: "Status", cell: (r) => <StatusBadge status={r.status} /> },
    {
      key: "actions", header: <span className="sr-only">Actions</span>, align: "right",
      cell: () => <Button variant="ghost" size="icon-sm" aria-label="Edit"><Pencil size={15} /></Button>,
    },
  ];

  return (
    <div className="space-y-10">
      <PageHeader
        title="Design system"
        description="The building blocks every Biz44 screen uses. Build new screens from these components instead of styling elements by hand."
      />

      <Section title="Colour" note="Use the token names below; never hard-code hex values.">
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-7">
          {COLORS.map((c) => (
            <div key={c.name} className="overflow-hidden rounded-2xl border border-border-soft bg-surface">
              <div className={`h-16 ${c.token} border-b border-border-soft`} />
              <div className="p-3">
                <p className="text-sm font-semibold">{c.name}</p>
                <p className="mt-0.5 text-xs text-ink-soft">{c.use}</p>
              </div>
            </div>
          ))}
        </div>
      </Section>

      <Section title="Type" note="Inter. One page title per screen; numbers use tabular figures so columns line up.">
        <Card>
          <CardContent className="space-y-3 pt-5">
            <p className="text-2xl font-semibold tracking-tight">Page title — text-2xl semibold</p>
            <p className="text-base font-semibold tracking-tight">Section / card title — text-base semibold</p>
            <p className="text-sm">Body text — text-sm. Most of the interface uses this size.</p>
            <p className="text-sm text-ink-soft">Secondary text — text-sm ink-soft</p>
            <p className="text-xs font-semibold uppercase tracking-wider text-ink-soft">Group label — text-xs uppercase</p>
            <p className="text-3xl font-bold tabular-nums">₦4,894,000.00 <span className="text-sm font-normal text-ink-soft">key figure — bold, tabular</span></p>
          </CardContent>
        </Card>
      </Section>

      <Section title="Buttons" note="One primary (charcoal) action per area. Links that look like buttons use ButtonLink.">
        <div className="flex flex-wrap items-center gap-3">
          <Button><Plus size={16} /> Primary</Button>
          <Button variant="secondary">Secondary</Button>
          <Button variant="outline"><Download size={16} /> Outline</Button>
          <Button variant="ghost">Ghost</Button>
          <Button variant="danger">Delete</Button>
          <Button isLoading>Saving</Button>
          <Button disabled>Disabled</Button>
          <Button size="sm">Small</Button>
          <Button variant="outline" size="icon" aria-label="More"><MoreHorizontal size={18} /></Button>
          <ButtonLink href="/dashboard" variant="outline">ButtonLink</ButtonLink>
        </div>
      </Section>

      <Section title="Forms" note="Field gives every control a label, hint and error, wired up for screen readers. Numbers use NumericInput (no stuck zero).">
        <Card>
          <CardContent className="grid gap-4 pt-5 sm:grid-cols-2 lg:grid-cols-3">
            <Field label="Customer name" required hint="As it should appear on invoices">
              <Input placeholder="e.g. Ayesha Stores" />
            </Field>
            <Field label="Payment account">
              <Select defaultValue="bank">
                <option value="cash">Cash</option>
                <option value="bank">GTBank Current</option>
              </Select>
            </Field>
            <Field label="Amount" hint={`Value: ${naira(num)}`}>
              <NumericInput value={num} onChange={setNum} />
            </Field>
            <Field label="Email" error="Enter a valid email address">
              <Input defaultValue="ayesha@" />
            </Field>
            <Field label="Disabled">
              <Input disabled defaultValue="Can't be changed" />
            </Field>
            <Field label="Notes" className="sm:col-span-2 lg:col-span-1">
              <Textarea placeholder="Optional" />
            </Field>
          </CardContent>
        </Card>
      </Section>

      <Section title="Status" note="StatusBadge gives every document status the same label and colour everywhere.">
        <div className="flex flex-wrap gap-2">
          {["draft", "unpaid", "partially_paid", "paid", "overdue", "cancelled", "pending", "low_stock", "out_of_stock"].map((s) => (
            <StatusBadge key={s} status={s} />
          ))}
          <Badge variant="brand">Brand badge</Badge>
        </div>
      </Section>

      <Section title="Cards and figures">
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard label="Revenue" value={naira(750000)} hint="This month" />
          <StatCard label="Money in" value={naira(600000)} tone="positive" />
          <StatCard label="Money out" value={naira(595000)} tone="negative" />
          <StatCard label="Low stock items" value="3" tone="warning" icon={<Package size={18} />} />
        </div>
        <div className="mt-4 rounded-2xl bg-gradient-to-br from-brand to-brand-dark p-6 text-white shadow-card">
          <p className="text-sm text-white/80">Hero card — one per page at most</p>
          <p className="mt-1 text-3xl font-bold tabular-nums">{naira(4894000)}</p>
        </div>
      </Section>

      <Section title="Tabs and menus">
        <div className="flex flex-wrap items-center gap-4">
          <Tabs
            value={tab}
            onChange={setTab}
            options={[{ value: "all", label: "All", count: 54 }, { value: "unpaid", label: "Unpaid", count: 12 }, { value: "paid", label: "Paid" }]}
          />
          <DropdownMenu triggerLabel="Actions" trigger={<><MoreHorizontal size={16} /> Actions</>} triggerClassName="inline-flex h-10 items-center gap-1.5 rounded-xl border border-border-soft bg-surface px-3 text-sm font-semibold" align="left">
            {(close) => (
              <>
                <MenuLabel>Invoice</MenuLabel>
                <MenuButton onClick={close}><Pencil size={15} /> Edit</MenuButton>
                <MenuButton onClick={close}><Download size={15} /> Download PDF</MenuButton>
                <MenuDivider />
                <MenuButton onClick={close} danger><Trash2 size={15} /> Delete</MenuButton>
              </>
            )}
          </DropdownMenu>
          <Button variant="outline" onClick={() => setDialog(true)}>Open dialog</Button>
        </div>
      </Section>

      <Section title="Data table" note="Search, sort (click a header), pagination, right-aligned numbers, responsive columns. Example rows below are for this guide only.">
        <DataTable rows={EXAMPLE_ROWS} columns={columns} rowKey={(r) => r.id} searchText={(r) => `${r.item} ${r.sku}`} searchPlaceholder="Search items" pageSize={2} />
      </Section>

      <Section title="States">
        <div className="grid gap-4 lg:grid-cols-3">
          <Card><EmptyState title="No invoices yet" description="Invoices you create appear here." action={<Button size="sm"><Plus size={14} /> New invoice</Button>} /></Card>
          <Card><EmptyState tone="error" title="Couldn't load this list" description="Check your connection and try again." action={<Button size="sm" variant="outline">Try again</Button>} /></Card>
          <Card><CardHeader><CardTitle>Loading</CardTitle></CardHeader><CardContent className="space-y-2"><Skeleton className="h-10" /><Skeleton className="h-10" /><Skeleton className="h-10 w-2/3" /></CardContent></Card>
        </div>
      </Section>

      <Dialog
        open={dialog}
        onClose={() => setDialog(false)}
        title="Dialog title"
        description="Short forms and confirmations. Escape or clicking outside closes it; on phones it slides up from the bottom."
        footer={<><Button variant="outline" onClick={() => setDialog(false)}>Cancel</Button><Button onClick={() => setDialog(false)}>Confirm</Button></>}
      >
        <Field label="Example field"><Input /></Field>
      </Dialog>
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-semibold tracking-tight">{title}</h2>
      {note && <p className="mb-4 mt-0.5 text-sm text-ink-soft">{note}</p>}
      {!note && <div className="mb-4" />}
      {children}
    </section>
  );
}
