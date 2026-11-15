"use client";

import { useParams } from "next/navigation";
import Statement from "@/components/statements/Statement";

export default function SupplierStatementPage() {
  const { id } = useParams<{ id: string }>();
  return <Statement kind="supplier" id={id} />;
}
