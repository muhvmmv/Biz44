"use client";

import { useParams } from "next/navigation";
import Statement from "@/components/statements/Statement";

export default function CustomerStatementPage() {
  const { id } = useParams<{ id: string }>();
  return <Statement kind="customer" id={id} />;
}
