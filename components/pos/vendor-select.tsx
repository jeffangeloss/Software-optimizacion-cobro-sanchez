"use client";

import { useMemo, useState } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";

type Vendor = {
  id: string;
  name: string;
  code: string;
  isFavorite: boolean;
  hasOrder?: boolean;
  orderSavedAt?: string;
};

type VendorSelectProps = {
  vendors: Vendor[];
  onSelect: (vendor: Vendor) => void;
};

export function VendorSelect({ vendors, onSelect }: VendorSelectProps) {
  const [query, setQuery] = useState("");

  const favorites = useMemo(
    () => vendors.filter((vendor) => vendor.isFavorite).slice(0, 8),
    [vendors]
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return vendors;
    return vendors.filter(
      (vendor) =>
        vendor.name.toLowerCase().includes(q) ||
        vendor.code.toLowerCase().includes(q)
    );
  }, [vendors, query]);

  const getStatusClasses = (vendor: Vendor) => {
    if (vendor.hasOrder === undefined) return "";
    return vendor.hasOrder
      ? "border border-emerald-300 bg-emerald-100 text-emerald-950 hover:bg-emerald-200"
      : "border border-red-300 bg-red-100 text-red-900 hover:bg-red-200";
  };

  const getPillClasses = (vendor: Vendor, base: string) => {
    if (vendor.hasOrder === undefined) return base;
    return vendor.hasOrder ? `${base} bg-emerald-700` : `${base} bg-red-700`;
  };

  const formatOrderSavedAt = (value?: string) => {
    if (!value) return null;
    const parsed = new Date(value);
    if (Number.isNaN(parsed.getTime())) return null;
    const time = new Intl.DateTimeFormat("es-PE", {
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hour12: false,
    }).format(parsed);
    const date = new Intl.DateTimeFormat("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(parsed);
    return `${date} ${time}`;
  };

  const renderVendorMeta = (vendor: Vendor) => {
    const savedAt =
      vendor.hasOrder && vendor.orderSavedAt ? formatOrderSavedAt(vendor.orderSavedAt) : null;
    if (!savedAt) return null;
    return <span className="text-xs text-emerald-800/70">{savedAt}</span>;
  };

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <h2 className="font-display text-2xl">Selecciona vendedor</h2>
        <Input
          className="h-12 text-base"
          placeholder="Buscar por nombre o codigo..."
          value={query}
          onChange={(event) => setQuery(event.target.value)}
        />
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
            Favoritos
          </h3>
          <Button variant="ghost" size="sm" type="button">
            Escanear QR (pronto)
          </Button>
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          {favorites.length === 0 ? (
            <Card className="p-4 text-sm text-muted-foreground">
              Marca favoritos en Admin para verlos aqui.
            </Card>
          ) : (
            favorites.map((vendor) => (
              <Button
                key={vendor.id}
                type="button"
                className={[
                  "min-h-[56px] items-start justify-start py-2 text-left text-base",
                  getStatusClasses(vendor),
                ].join(" ")}
                variant="secondary"
                onClick={() => onSelect(vendor)}
              >
                <span
                  className={getPillClasses(
                    vendor,
                    "mr-3 rounded-full bg-slate-900 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white"
                  )}
                >
                  {vendor.code}
                </span>
                <span className="flex flex-col">
                  <span className="leading-tight">{vendor.name}</span>
                  {renderVendorMeta(vendor)}
                </span>
              </Button>
            ))
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
          Todos
        </h3>
        <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
          {filtered.map((vendor) => (
            <Button
              key={vendor.id}
              type="button"
              className={[
                "min-h-[56px] items-start justify-start py-2 text-left text-base",
                getStatusClasses(vendor),
              ].join(" ")}
              variant="outline"
              onClick={() => onSelect(vendor)}
            >
              <span
                className={getPillClasses(
                  vendor,
                  "mr-3 rounded-full bg-slate-900/80 px-3 py-1 text-xs uppercase tracking-[0.2em] text-white"
                )}
              >
                {vendor.code}
              </span>
              <span className="flex flex-col">
                <span className="leading-tight">{vendor.name}</span>
                {renderVendorMeta(vendor)}
              </span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
