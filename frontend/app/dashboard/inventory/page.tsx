"use client";

import { useEffect, useState } from "react";
import { apiFetch } from "@/lib/api";
import PageHeader from "@/components/ui/PageHeader";
import { Card, CardContent } from "@/components/ui/Card";
import Skeleton from "@/components/ui/Skeleton";
import { Package, AlertTriangle, XCircle, DollarSign } from "lucide-react";

interface Product {
  id: string;
  quantity: number;
  price: number;
  reorderPoint: number;
}

export default function InventoryPage() {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    apiFetch<{ success: boolean; data: Product[] }>("/products")
      .then((res) => { if (active) setProducts(res.data); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, []);

  const totalProducts = products.length;
  const totalUnits = products.reduce((s, p) => s + p.quantity, 0);
  const totalValue = products.reduce((s, p) => s + p.quantity * p.price, 0);
  const lowStock = products.filter((p) => p.quantity > 0 && p.quantity <= p.reorderPoint).length;
  const outOfStock = products.filter((p) => p.quantity === 0).length;

  const stats = [
    { label: "Total Products", value: totalProducts, icon: Package, color: "text-brand-600 bg-brand-50" },
    { label: "Total Units", value: totalUnits.toLocaleString(), icon: Package, color: "text-sky-600 bg-sky-50" },
    { label: "Inventory Value", value: `$${totalValue.toLocaleString()}`, icon: DollarSign, color: "text-violet-600 bg-violet-50" },
    { label: "Low Stock", value: lowStock, icon: AlertTriangle, color: "text-amber-600 bg-amber-50" },
    { label: "Out of Stock", value: outOfStock, icon: XCircle, color: "text-red-600 bg-red-50" },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        title="Inventory"
        description="Overview of your stock levels and value."
      />

      {loading ? (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-28" />)}
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {stats.map(({ label, value, icon: Icon, color }) => (
            <Card key={label}>
              <CardContent className="p-5">
                <div className={`w-10 h-10 rounded-lg ${color} flex items-center justify-center mb-3`}>
                  <Icon size={20} />
                </div>
                <p className="text-sm text-neutral-500">{label}</p>
                <p className="text-2xl font-bold mt-1">{value}</p>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}