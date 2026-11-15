"use client";

import { useParams } from "next/navigation";
import BomEditor from "@/components/production/BomEditor";

export default function EditBomPage() {
  const { id } = useParams<{ id: string }>();
  return <BomEditor bomId={id} />;
}
