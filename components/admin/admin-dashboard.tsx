"use client";

import { useMemo, useState, useTransition } from "react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { createProduct, updateProduct } from "@/app/actions/products";
import { createVendor, toggleVendorFavorite, updateVendor } from "@/app/actions/vendors";
import { setProductPrice } from "@/app/actions/prices";
import { getDailyReport, exportTicketsCsv } from "@/app/actions/reports";
import { updateSettings } from "@/app/actions/settings";
import { formatCurrency, todayIso } from "@/lib/date";

type Product = {
  id: string;
  name: string;
  active: boolean;
  currentPrice: number | null;
};

type Vendor = {
  id: string;
  name: string;
  code: string;
  active: boolean;
  isFavorite: boolean;
};

type Settings = {
  batteryMode: "PER_DAY" | "PER_UNIT";
  batteryUnitPrice: number;
  batteryQty: number;
};

type ReportData = {
  totals: {
    totalProducts: number;
    totalBattery: number;
    totalGeneral: number;
    ticketsPaid: number;
    ticketsCredit: number;
    ticketsPartial: number;
  };
  topProducts: Array<{ name: string; units: number; amount: number }>;
  topVendors: Array<{ name: string; amount: number }>;
};

type AdminDashboardProps = {
  products: Product[];
  vendors: Vendor[];
  settings: Settings;
};

export function AdminDashboard({ products, vendors, settings }: AdminDashboardProps) {
  const [productList, setProductList] = useState(products);
  const [vendorList, setVendorList] = useState(vendors);
  const [settingsState, setSettingsState] = useState(settings);
  const [newProduct, setNewProduct] = useState("");
  const [newVendor, setNewVendor] = useState({ name: "", code: "" });
  const [priceInputs, setPriceInputs] = useState<Record<string, string>>({});
  const [priceDate, setPriceDate] = useState(todayIso());
  const [reportDate, setReportDate] = useState(todayIso());
  const [reportData, setReportData] = useState<ReportData | null>(null);
  const [exportRange, setExportRange] = useState({ start: todayIso(), end: todayIso() });
  const [isPending, startTransition] = useTransition();

  const favoritesCount = useMemo(
    () => vendorList.filter((vendor) => vendor.isFavorite).length,
    [vendorList]
  );

  const saveProduct = () => {
    if (!newProduct.trim()) return;
    startTransition(async () => {
      const created = await createProduct({ name: newProduct.trim() });
      setProductList((prev) => [...prev, { ...created, currentPrice: null }]);
      setNewProduct("");
    });
  };

  const saveVendor = () => {
    if (!newVendor.name.trim()) return;
    startTransition(async () => {
      const name = newVendor.name.trim();
      const code = newVendor.code.trim();
      const created = await createVendor({
        name,
        ...(code ? { code } : {}),
      });
      setVendorList((prev) => [...prev, created]);
      setNewVendor({ name: "", code: "" });
    });
  };

  const updatePrice = (productId: string) => {
    const value = Number(priceInputs[productId] ?? 0);
    if (!value) return;
    startTransition(async () => {
      await setProductPrice({ productId, price: value, validFrom: priceDate });
      setProductList((prev) =>
        prev.map((product) =>
          product.id === productId ? { ...product, currentPrice: value } : product
        )
      );
    });
  };

  const loadReport = () => {
    startTransition(async () => {
      const report = await getDailyReport(reportDate);
      setReportData(report);
    });
  };

  const downloadCsv = async () => {
    const csv = await exportTicketsCsv(exportRange.start, exportRange.end);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `reporte-${exportRange.start}-${exportRange.end}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Tabs defaultValue="products" className="space-y-6">
      <TabsList>
        <TabsTrigger value="products">Productos</TabsTrigger>
        <TabsTrigger value="vendors">Vendedores</TabsTrigger>
        <TabsTrigger value="settings">Bateria</TabsTrigger>
        <TabsTrigger value="reports">Reportes</TabsTrigger>
      </TabsList>

      <TabsContent value="products" className="space-y-4">
        <Card className="p-4 space-y-3">
          <h3 className="font-display text-xl">Nuevo producto</h3>
          <div className="flex gap-2">
            <Input
              placeholder="Nombre del producto"
              value={newProduct}
              onChange={(event) => setNewProduct(event.target.value)}
            />
            <Button onClick={saveProduct} disabled={isPending}>
              Crear
            </Button>
          </div>
        </Card>
        <div className="grid gap-3">
          {productList.map((product) => (
            <Card key={product.id} className="p-4 space-y-2">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">{product.name}</p>
                  <p className="text-xs text-muted-foreground">
                    Precio actual:{" "}
                    {product.currentPrice ? formatCurrency(product.currentPrice) : "Sin precio"}
                  </p>
                </div>
                <Button
                  variant={product.active ? "secondary" : "outline"}
                  onClick={() =>
                    startTransition(async () => {
                      const updated = await updateProduct(product.id, {
                        active: !product.active,
                      });
                      setProductList((prev) =>
                        prev.map((item) =>
                          item.id === product.id ? { ...item, ...updated } : item
                        )
                      );
                    })
                  }
                >
                  {product.active ? "Activo" : "Inactivo"}
                </Button>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  className="w-32"
                  placeholder="Nuevo precio"
                  value={priceInputs[product.id] ?? ""}
                  onChange={(event) =>
                    setPriceInputs((prev) => ({
                      ...prev,
                      [product.id]: event.target.value,
                    }))
                  }
                />
                <Input
                  className="w-40"
                  type="date"
                  value={priceDate}
                  onChange={(event) => setPriceDate(event.target.value)}
                />
                <Button onClick={() => updatePrice(product.id)} disabled={isPending}>
                  Guardar precio
                </Button>
              </div>
            </Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="vendors" className="space-y-4">
        <Card className="p-4 space-y-3">
          <h3 className="font-display text-xl">Nuevo vendedor</h3>
          <div className="flex flex-wrap gap-2">
            <Input
              placeholder="Nombre"
              value={newVendor.name}
              onChange={(event) =>
                setNewVendor((prev) => ({ ...prev, name: event.target.value }))
              }
            />
            <Input
              className="w-32"
              placeholder="Codigo (auto)"
              value={newVendor.code}
              onChange={(event) =>
                setNewVendor((prev) => ({ ...prev, code: event.target.value }))
              }
            />
            <Button onClick={saveVendor} disabled={isPending}>
              Crear
            </Button>
          </div>
          <p className="text-xs text-muted-foreground">
            Si dejas el codigo vacio, se genera automaticamente.
          </p>
          <p className="text-xs text-muted-foreground">
            Favoritos activos: {favoritesCount}/8
          </p>
        </Card>
        <div className="grid gap-3">
          {vendorList.map((vendor) => (
            <Card key={vendor.id} className="p-4 space-y-2">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div>
                  <p className="font-semibold">
                    {vendor.name} <span className="text-xs text-muted-foreground">({vendor.code})</span>
                  </p>
                </div>
                <div className="flex gap-2">
                  <Button
                    variant={vendor.isFavorite ? "default" : "outline"}
                    onClick={() =>
                      startTransition(async () => {
                        const updated = await toggleVendorFavorite(
                          vendor.id,
                          !vendor.isFavorite
                        );
                        setVendorList((prev) =>
                          prev.map((item) =>
                            item.id === vendor.id ? { ...item, ...updated } : item
                          )
                        );
                      })
                    }
                  >
                    {vendor.isFavorite ? "Favorito" : "No favorito"}
                  </Button>
                  <Button
                    variant={vendor.active ? "secondary" : "outline"}
                    onClick={() =>
                      startTransition(async () => {
                        const updated = await updateVendor(vendor.id, {
                          active: !vendor.active,
                        });
                        setVendorList((prev) =>
                          prev.map((item) =>
                            item.id === vendor.id ? { ...item, ...updated } : item
                          )
                        );
                      })
                    }
                  >
                    {vendor.active ? "Activo" : "Inactivo"}
                  </Button>
                </div>
              </div>
            </Card>
          ))}
        </div>
      </TabsContent>

      <TabsContent value="settings" className="space-y-4">
        <Card className="p-4 space-y-3">
          <h3 className="font-display text-xl">Cargo de bateria</h3>
          <div className="grid gap-3 md:grid-cols-3">
            <Select
              value={settingsState.batteryMode}
              onValueChange={(value) =>
                setSettingsState((prev) => ({
                  ...prev,
                  batteryMode: value as Settings["batteryMode"],
                }))
              }
            >
              <SelectTrigger>
                <SelectValue placeholder="Modo" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="PER_DAY">Por dia</SelectItem>
                <SelectItem value="PER_UNIT">Por bateria</SelectItem>
              </SelectContent>
            </Select>
            <Input
              type="number"
              min={0}
              value={settingsState.batteryUnitPrice}
              onChange={(event) =>
                setSettingsState((prev) => ({
                  ...prev,
                  batteryUnitPrice: Number(event.target.value),
                }))
              }
              placeholder="Precio"
            />
            <Input
              type="number"
              min={1}
              value={settingsState.batteryQty}
              onChange={(event) =>
                setSettingsState((prev) => ({
                  ...prev,
                  batteryQty: Number(event.target.value),
                }))
              }
              placeholder="Cantidad"
            />
          </div>
          <Button
            onClick={() =>
              startTransition(async () => {
                const updated = await updateSettings(settingsState);
                setSettingsState({
                  batteryMode: updated.batteryMode,
                  batteryUnitPrice: updated.batteryUnitPrice,
                  batteryQty: updated.batteryQty,
                });
              })
            }
            disabled={isPending}
          >
            Guardar cambios
          </Button>
        </Card>
      </TabsContent>

      <TabsContent value="reports" className="space-y-4">
        <Card className="p-4 space-y-3">
          <h3 className="font-display text-xl">Reporte del dia</h3>
          <div className="flex flex-wrap gap-2">
            <Input type="date" value={reportDate} onChange={(event) => setReportDate(event.target.value)} />
            <Button onClick={loadReport} disabled={isPending}>
              Cargar reporte
            </Button>
          </div>
          {reportData ? (
            <div className="grid gap-2 text-sm text-muted-foreground">
              <p>Total productos: {formatCurrency(reportData.totals.totalProducts)}</p>
              <p>Total bateria: {formatCurrency(reportData.totals.totalBattery)}</p>
              <p>Total general: {formatCurrency(reportData.totals.totalGeneral)}</p>
              <p>Pagadas: {reportData.totals.ticketsPaid}</p>
              <p>Credito: {reportData.totals.ticketsCredit}</p>
              <p>Parciales: {reportData.totals.ticketsPartial}</p>
              <div>
                <p className="text-xs uppercase tracking-[0.2em]">Top productos</p>
                <ul className="list-disc pl-5">
                  {reportData.topProducts.map((item) => (
                    <li key={item.name}>
                      {item.name} - {item.units} u - {formatCurrency(item.amount)}
                    </li>
                  ))}
                </ul>
              </div>
              <div>
                <p className="text-xs uppercase tracking-[0.2em]">Top vendedores</p>
                <ul className="list-disc pl-5">
                  {reportData.topVendors.map((item) => (
                    <li key={item.name}>
                      {item.name} - {formatCurrency(item.amount)}
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          ) : (
            <p className="text-sm text-muted-foreground">Sin datos cargados.</p>
          )}
        </Card>
        <Card className="p-4 space-y-3">
          <h3 className="font-display text-xl">Exportar CSV</h3>
          <div className="flex flex-wrap gap-2">
            <Input
              type="date"
              value={exportRange.start}
              onChange={(event) =>
                setExportRange((prev) => ({ ...prev, start: event.target.value }))
              }
            />
            <Input
              type="date"
              value={exportRange.end}
              onChange={(event) =>
                setExportRange((prev) => ({ ...prev, end: event.target.value }))
              }
            />
            <Button onClick={downloadCsv} disabled={isPending}>
              Descargar CSV
            </Button>
          </div>
        </Card>
      </TabsContent>
    </Tabs>
  );
}
