"use client";

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { getHistoricalEntry, saveHistoricalEntry } from "@/app/actions/historical-entry";
import { VendorSelect } from "@/components/pos/vendor-select";
import { VendorBadge } from "@/components/pos/vendor-badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/date";

type Vendor = {
  id: string;
  name: string;
  code: string;
  isFavorite: boolean;
};

type Line = {
  productId: string;
  name: string;
  unitPriceUsed: number;
  leftoversPrev: number;
  orderQty: number;
  leftoversNow: number;
};

type Message = { kind: "success" | "error"; text: string };

type HistoricalEntryFormProps = {
  vendors: Vendor[];
  targetDate: string;
};

const parseQty = (raw: string) => {
  const numeric = Number.parseInt(raw.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
};

const formatDateLabel = (value: string) => {
  const parsed = new Date(`${value}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) return value;
  return new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(parsed);
};

export function HistoricalEntryForm({ vendors, targetDate }: HistoricalEntryFormProps) {
  const router = useRouter();
  const [selectedDate, setSelectedDate] = useState(targetDate);
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [lines, setLines] = useState<Line[]>([]);
  const [batteryQty, setBatteryQty] = useState(1);
  const [batteryUnitPrice, setBatteryUnitPrice] = useState(0);
  const [paidAmount, setPaidAmount] = useState("");
  const [status, setStatus] = useState<"OPEN" | "CLOSED">("OPEN");
  const [leftoversReported, setLeftoversReported] = useState(true);
  const [message, setMessage] = useState<Message | null>(null);
  const [isPending, startTransition] = useTransition();

  const totals = useMemo(() => {
    const subtotal = lines.reduce((acc, line) => {
      const effectiveNow = leftoversReported
        ? line.leftoversNow
        : line.leftoversPrev + line.orderQty;
      const sold = line.orderQty + line.leftoversPrev - effectiveNow;
      const lineTotal = sold > 0 ? sold * line.unitPriceUsed : 0;
      return acc + lineTotal;
    }, 0);
    const batteryTotal = batteryUnitPrice * batteryQty;
    return {
      subtotal,
      batteryTotal,
      total: subtotal + batteryTotal,
    };
  }, [lines, batteryUnitPrice, batteryQty, leftoversReported]);

  const paidValue = Number(paidAmount || 0);
  const balance = Math.max(0, totals.total - paidValue);

  const setLineValue = (productId: string, field: keyof Line, raw: string) => {
    const qty = parseQty(raw);
    setLines((prev) =>
      prev.map((line) =>
        line.productId === productId ? { ...line, [field]: qty } : line
      )
    );
  };

  const handleSelect = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setMessage(null);
    startTransition(async () => {
      try {
        const result = await getHistoricalEntry({ vendorId: vendor.id, date: selectedDate });
        if (!result.ok) {
          setMessage({ kind: "error", text: "No se pudo cargar la boleta." });
          return;
        }
        setLines(result.lines);
        setBatteryQty(result.batteryQty);
        setBatteryUnitPrice(result.batteryUnitPrice);
        setPaidAmount(result.paidAmount ? String(result.paidAmount) : "");
        setStatus(result.status === "CLOSED" ? "CLOSED" : "OPEN");
        setLeftoversReported(result.leftoversReported ?? true);
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("NO_SESSION") || message.includes("FORBIDDEN")) {
          router.replace(`/login?next=${encodeURIComponent("/carga-31122024")}`);
          return;
        }
        setMessage({ kind: "error", text: "No se pudo cargar la boleta." });
      }
    });
  };

  const handleSave = () => {
    if (!selectedVendor) return;
    startTransition(async () => {
      try {
        const result = await saveHistoricalEntry({
          date: selectedDate,
          vendorId: selectedVendor.id,
          batteryQty,
          paidAmount: paidValue,
          leftoversReported,
          entries: lines.map((line) => ({
            productId: line.productId,
            leftoversPrev: line.leftoversPrev,
            orderQty: line.orderQty,
            leftoversNow: leftoversReported
              ? line.leftoversNow
              : line.leftoversPrev + line.orderQty,
          })),
        });
        if (!result.ok) {
          setMessage({ kind: "error", text: result.message ?? "No se pudo guardar." });
          return;
        }
        setStatus("CLOSED");
        setMessage({
          kind: "success",
          text: leftoversReported
            ? `Guardado. Total ${formatCurrency(result.total)} - Saldo ${formatCurrency(
                result.balance
              )}.`
            : "Guardado. Se traslado D.A + PED. y el A cuenta queda como saldo a favor.",
        });
      } catch {
        setMessage({ kind: "error", text: "No se pudo guardar." });
      }
    });
  };

  if (!selectedVendor) {
    return (
      <div className="space-y-6">
        <Card className="p-4 space-y-2">
          <p className="text-sm text-muted-foreground">
            Completa PED., D.A. y D.D. de la fecha indicada para dejar el cierre correcto con
            A CUENTA.
          </p>
          <div className="max-w-[220px]">
            <Input
              type="date"
              value={selectedDate}
              onChange={(event) => setSelectedDate(event.target.value)}
            />
          </div>
        </Card>
        <VendorSelect vendors={vendors} onSelect={handleSelect} />
        {message ? (
          <div
            className={[
              "rounded-xl px-3 py-2 text-sm",
              message.kind === "success"
                ? "bg-emerald-100 text-emerald-700"
                : "bg-red-100 text-red-700",
            ].join(" ")}
          >
            {message.text}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid min-h-[60vh] gap-2 lg:grid-cols-[360px_1fr]">
        <Card className="flex h-full flex-col gap-4 p-4">
          <div className="space-y-3">
            <VendorBadge name={selectedVendor.name} code={selectedVendor.code} size="lg" />
            <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
              <p className="font-semibold">Fecha objetivo: {formatDateLabel(selectedDate)}</p>
              <p className="text-xs text-muted-foreground">
                Estado actual:{" "}
                {status === "CLOSED"
                  ? leftoversReported
                    ? "Cerrada"
                    : "Cerrada (D.D. pendiente)"
                  : "Abierta"}
              </p>
            </div>
          </div>

          <div className="rounded-2xl border border-amber-200 bg-amber-50/70 p-3 text-sm">
            <label className="flex items-center gap-2 font-medium text-amber-900">
              <input
                type="checkbox"
                checked={!leftoversReported}
                onChange={(event) => setLeftoversReported(!event.target.checked)}
              />
              D.D. pendiente (trasladar D.A + PED.)
            </label>
            <p className="mt-2 text-xs text-amber-800">
              Cuando esta activo, D.D. se calcula automaticamente y el A cuenta pasa como saldo a
              favor del siguiente dia.
            </p>
          </div>

          <div className="space-y-2 rounded-2xl bg-white/70 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-sm text-muted-foreground">Bateria</p>
                <p className="text-lg font-semibold">{formatCurrency(batteryUnitPrice)}</p>
              </div>
              <div className="w-24">
                <Input
                  value={String(batteryQty)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  className="h-9 text-center text-base font-semibold"
                  onFocus={(event) => event.currentTarget.select()}
                  onChange={(event) => setBatteryQty(parseQty(event.target.value))}
                />
              </div>
            </div>

            <div className="rounded-2xl bg-slate-900 px-3 py-2 text-center text-xl text-white">
              Total: {formatCurrency(totals.total)}
            </div>

            <div className="space-y-2">
              <label className="text-sm text-muted-foreground">Monto recibido (A cuenta)</label>
              <Input
                value={paidAmount}
                inputMode="decimal"
                className="h-10 text-center text-base font-semibold"
                placeholder="0.00"
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setPaidAmount(event.target.value)}
              />
              <p className="text-xs text-muted-foreground">
                Saldo: {formatCurrency(balance)}
              </p>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <Button
                type="button"
                variant="outline"
                className="h-10"
                onClick={() => {
                  setSelectedVendor(null);
                  setLines([]);
                  setMessage(null);
                }}
                disabled={isPending}
              >
                Cambiar
              </Button>
              <Button type="button" className="h-10" onClick={handleSave} disabled={isPending}>
                Guardar cierre
              </Button>
            </div>
          </div>

          {message ? (
            <div
              className={[
                "rounded-xl px-3 py-2 text-sm",
                message.kind === "success"
                  ? "bg-emerald-100 text-emerald-700"
                  : "bg-red-100 text-red-700",
              ].join(" ")}
            >
              {message.text}
            </div>
          ) : null}
        </Card>

        <Card className="h-full min-h-0 overflow-hidden p-1">
          <div className="overflow-auto rounded-xl border bg-white/50">
            <Table className="w-max table-fixed text-sm">
              <TableHeader>
                <TableRow>
                  <TableHead className="h-9 w-[200px] bg-card">Producto</TableHead>
                  <TableHead className="h-9 w-[96px] bg-card text-center">D.A.</TableHead>
                  <TableHead className="h-9 w-[96px] bg-card text-center">PED.</TableHead>
                  <TableHead className="h-9 w-[96px] bg-card text-center">D.D.</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {lines.map((line) => (
                  <TableRow key={line.productId}>
                    <TableCell className="whitespace-normal font-semibold">
                      {line.name}
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        value={String(line.leftoversPrev)}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="h-9 w-[90px] text-center"
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                          setLineValue(line.productId, "leftoversPrev", event.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        value={String(line.orderQty)}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="h-9 w-[90px] text-center"
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                          setLineValue(line.productId, "orderQty", event.target.value)
                        }
                      />
                    </TableCell>
                    <TableCell className="text-center">
                      <Input
                        value={String(
                          leftoversReported
                            ? line.leftoversNow
                            : line.leftoversPrev + line.orderQty
                        )}
                        inputMode="numeric"
                        pattern="[0-9]*"
                        className="h-9 w-[90px] text-center"
                        disabled={!leftoversReported}
                        readOnly={!leftoversReported}
                        aria-disabled={!leftoversReported}
                        onFocus={(event) => event.currentTarget.select()}
                        onChange={(event) =>
                          setLineValue(line.productId, "leftoversNow", event.target.value)
                        }
                      />
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </Card>
      </div>
    </div>
  );
}
