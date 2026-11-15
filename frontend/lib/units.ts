/** Units of measure a product can be counted in (must match the backend list). */
export const UNITS: { value: string; label: string }[] = [
  { value: "pcs", label: "Pieces (pcs)" },
  { value: "kg", label: "Kilograms (kg)" },
  { value: "g", label: "Grams (g)" },
  { value: "t", label: "Tonnes (t)" },
  { value: "l", label: "Litres (l)" },
  { value: "ml", label: "Millilitres (ml)" },
  { value: "m", label: "Metres (m)" },
  { value: "bag", label: "Bags" },
  { value: "roll", label: "Rolls" },
  { value: "carton", label: "Cartons" },
  { value: "pack", label: "Packs" },
  { value: "box", label: "Boxes" },
];

export type ItemType = "raw_material" | "packaging" | "finished_good";

export const ITEM_TYPES: { value: ItemType; label: string; short: string }[] = [
  { value: "raw_material", label: "Raw material", short: "Raw" },
  { value: "packaging", label: "Packaging", short: "Packaging" },
  { value: "finished_good", label: "Finished good", short: "Finished" },
];

export const itemTypeLabel = (t: string | null | undefined) =>
  ITEM_TYPES.find((x) => x.value === t)?.label ?? "Finished good";

/** "2.5 kg", "1,200 pcs" — up to 4 decimal places, no trailing zeros. */
export function formatQty(n: number | null | undefined, unit?: string | null) {
  const v = typeof n === "number" && Number.isFinite(n) ? n : 0;
  const s = v.toLocaleString(undefined, { maximumFractionDigits: 4 });
  return unit ? `${s} ${unit}` : s;
}
