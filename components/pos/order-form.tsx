"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { saveOrder } from "@/app/actions/tickets";
import { VendorBadge } from "@/components/pos/vendor-badge";
import { VendorHistory } from "@/components/pos/vendor-history";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { formatCurrency } from "@/lib/date";

type Line = {
  productId: string;
  productName: string;
  leftoversPrev: number;
  orderQty: number;
  unitPriceUsed?: number;
};

type OrderFormProps = {
  ticketId: string;
  vendor: { name: string; code?: string };
  history: Array<{ id: string; date: string; total: number; paymentStatus: string }>;
  ticketDate: string;
  isCarryOver: boolean;
  onChangeVendor: () => void;
  lines: Line[];
};

export function OrderForm({
  ticketId,
  vendor,
  history,
  ticketDate,
  isCarryOver,
  onChangeVendor,
  lines,
}: OrderFormProps) {
  const router = useRouter();
  const initial = useMemo(
    () =>
      lines.reduce<Record<string, number>>((acc, line) => {
        acc[line.productId] = line.orderQty;
        return acc;
      }, {}),
    [lines]
  );

  const [values, setValues] = useState(initial);
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [message, setMessage] = useState<{ text: string; kind: "success" | "error" } | null>(
    null
  );
  const [isPending, startTransition] = useTransition();

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});

  const filteredLines = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return lines;
    return lines.filter((line) => line.productName.toLowerCase().includes(normalized));
  }, [lines, query]);

  const setQty = (productId: string, raw: string) => {
    const numeric = Number.parseInt(raw.replace(/[^\d]/g, ""), 10);
    setValues((prev) => ({
      ...prev,
      [productId]: Number.isFinite(numeric) ? Math.max(0, numeric) : 0,
    }));
  };

  const focusRow = (index: number) => {
    const next = filteredLines[index];
    if (!next) return;
    const el = inputRefs.current[next.productId];
    if (!el) return;
    el.focus();
    el.select();
  };

  const requestSaveConfirm = () => {
    setConfirmOpen(true);
  };

  const handleSave = () => {
    setConfirmOpen(false);
    startTransition(async () => {
      const items = lines.map((line) => ({
        productId: line.productId,
        qty: values[line.productId] ?? 0,
      }));
      try {
        await saveOrder(ticketId, items);
        setMessage({ text: "Pedido guardado.", kind: "success" });
        router.refresh();
      } catch {
        setMessage({ text: "No se pudo guardar (¿boleta ya cerrada?).", kind: "error" });
      } finally {
        setTimeout(() => setMessage(null), 2500);
      }
    });
  };

  const splitIndex = Math.ceil(filteredLines.length / 2);
  const leftLines = filteredLines.slice(0, splitIndex);
  const rightLines = filteredLines.slice(splitIndex);

  const confirmRows = useMemo(
    () =>
      lines.map((line) => ({
        name: line.productName,
        qty: values[line.productId] ?? 0,
      })),
    [lines, values]
  );

  const renderConfirmTable = () => (
    <div className="max-h-[55vh] overflow-auto rounded-xl border bg-white/70">
      <div className="flex items-center justify-between border-b px-3 py-2 text-xs uppercase tracking-[0.2em] text-muted-foreground">
        <span>Producto</span>
        <span>PED.</span>
      </div>
      <div className="divide-y">
        {confirmRows.map((item) => (
          <div key={item.name} className="flex items-center justify-between px-3 py-2 text-sm">
            <span className="font-medium">{item.name}</span>
            <span className={item.qty ? "text-base font-semibold" : "text-sm text-muted-foreground"}>
              {item.qty}
            </span>
          </div>
        ))}
      </div>
    </div>
  );

  const formatDateLabel = (value: string) => {
    const parsed = new Date(`${value}T00:00:00`);
    if (Number.isNaN(parsed.getTime())) return value;
    return new Intl.DateTimeFormat("es-PE", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }).format(parsed);
  };

  const todayLabel = new Intl.DateTimeFormat("es-PE", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  }).format(new Date());

  const renderColumn = (columnLines: Line[]) => (
    <Table containerClassName="overflow-x-hidden flex justify-center" className="w-max table-fixed text-sm">
      <TableHeader>
        <TableRow>
          <TableHead className="h-9 w-[78px] bg-card text-center">PED.</TableHead>
          <TableHead className="h-9 w-[190px] bg-card text-center">Producto</TableHead>
          <TableHead className="h-9 w-[92px] bg-card text-center">Precio</TableHead>
          <TableHead className="h-9 w-[92px] bg-card text-center">D.A.</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {columnLines.map((line) => {
          const isActive = activeProductId === line.productId;
          return (
            <TableRow
              key={line.productId}
              className={
                isActive ? "border-amber-200 bg-amber-100/60 hover:bg-amber-100/60" : undefined
              }
            >
              <TableCell className="py-[3px] px-2 text-center">
                <Input
                  ref={(el) => {
                    inputRefs.current[line.productId] = el;
                  }}
                  value={String(values[line.productId] ?? 0)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  data-pos-nav="order"
                  data-product-id={line.productId}
                  className="h-[29px] text-center text-base font-semibold"
                  onFocus={(event) => {
                    setActiveProductId(line.productId);
                    event.currentTarget.select();
                  }}
                  onChange={(event) => setQty(line.productId, event.target.value)}
                />
              </TableCell>
              <TableCell className="py-[3px] px-2 whitespace-normal text-center">
                <p className="text-sm font-semibold leading-tight">{line.productName}</p>
              </TableCell>
              <TableCell className="py-[3px] px-2 text-center text-sm font-semibold">
                {typeof line.unitPriceUsed === "number" ? formatCurrency(line.unitPriceUsed) : "—"}
              </TableCell>
              <TableCell className="py-[3px] px-2 text-center text-sm font-semibold">
                {line.leftoversPrev}
              </TableCell>
            </TableRow>
          );
        })}
      </TableBody>
    </Table>
  );

  return (
    <div
      className="grid h-full min-h-0 gap-2 lg:grid-cols-[360px_1fr]"
      onKeyDown={(event) => {
        if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
          event.preventDefault();
          requestSaveConfirm();
        }

        if (event.key !== "Enter" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

        const target = event.target as HTMLElement | null;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.dataset.posNav !== "order") return;

        const productId = target.dataset.productId;
        if (!productId) return;
        const currentIndex = filteredLines.findIndex((line) => line.productId === productId);
        if (currentIndex === -1) return;

        event.preventDefault();
        const delta = event.key === "ArrowUp" ? -1 : 1;
        focusRow(currentIndex + delta);
      }}
    >
      <Card className="flex h-full flex-col gap-4 p-4">
        <div className="space-y-4">
          <VendorBadge name={vendor.name} code={vendor.code} size="xl" />
          {isCarryOver ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-semibold">
                Boleta pendiente del {formatDateLabel(ticketDate)}.
              </p>
              <p className="text-xs text-amber-800">
                Hoy es {todayLabel}. Este pedido se acumula en la boleta pendiente.
              </p>
            </div>
          ) : null}

          <div className="grid gap-2">
            <Button
              type="button"
              size="lg"
              className="h-12 text-base"
              onClick={requestSaveConfirm}
              disabled={isPending}
            >
              Guardar pedido (Ctrl+S)
            </Button>
            <div className="grid grid-cols-2 gap-2">
              <Button type="button" variant="outline" className="h-11" onClick={onChangeVendor}>
                Cambiar
              </Button>
              <Button
                type="button"
                variant="outline"
                className="h-11"
                onClick={() => setHistoryOpen(true)}
              >
                Historial
              </Button>
            </div>
          </div>
        </div>

        <div className="mt-auto space-y-2">
          <Input
            className="h-11 text-base"
            placeholder="Buscar producto..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">
            Tip: Enter/↓/↑ para moverte. Ctrl+S para guardar.
          </p>
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
      </Card>

      <Card className="h-full min-h-0 overflow-hidden p-1">
        <div className="grid h-full min-h-0 gap-2 lg:grid-cols-2">
          <div className="overflow-hidden rounded-xl border bg-white/50">
            {renderColumn(leftLines)}
          </div>
          {rightLines.length ? (
            <div className="overflow-hidden rounded-xl border bg-white/50">
              {renderColumn(rightLines)}
            </div>
          ) : null}
        </div>
      </Card>

      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent
          className="max-w-3xl"
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (isPending) return;
            handleSave();
          }}
        >
          <DialogHeader>
            <DialogTitle>Confirmar pedido</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Revisa todos los productos ingresados en PED. antes de guardar.
            </p>
            {renderConfirmTable()}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setConfirmOpen(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={handleSave} disabled={isPending}>
                Confirmar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={historyOpen} onOpenChange={setHistoryOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Historial reciente</DialogTitle>
          </DialogHeader>
          <VendorHistory history={history} />
        </DialogContent>
      </Dialog>
    </div>
  );
}
