"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { closeTicket, reopenTicket, updateLeftoversNow } from "@/app/actions/tickets";
import { VendorBadge } from "@/components/pos/vendor-badge";
import { VendorHistory } from "@/components/pos/vendor-history";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Textarea } from "@/components/ui/textarea";
import { formatCurrency } from "@/lib/date";

type Line = {
  productId: string;
  productName: string;
  leftoversPrev: number;
  orderQty: number;
  leftoversNow: number;
  unitPriceUsed: number;
};

type CloseFormProps = {
  ticketId: string;
  vendor: { name: string; code?: string };
  history: Array<{ id: string; date: string; total: number; paymentStatus: string }>;
  isAdmin: boolean;
  ticketDate: string;
  isCarryOver: boolean;
  onChangeVendor: () => void;
  initialClosed?: { total: number; balance: number; paymentStatus: string } | null;
  batteryUnitPrice: number;
  batteryQty: number;
  lines: Line[];
};

export function CloseForm({
  ticketId,
  vendor,
  history,
  isAdmin,
  ticketDate,
  isCarryOver,
  onChangeVendor,
  initialClosed = null,
  batteryUnitPrice,
  batteryQty,
  lines,
}: CloseFormProps) {
  const initial = useMemo(
    () =>
      lines.reduce<Record<string, number>>((acc, line) => {
        acc[line.productId] = line.leftoversNow;
        return acc;
      }, {}),
    [lines]
  );

  const [values, setValues] = useState(initial);
  const [dirty, setDirty] = useState<Record<string, true>>({});
  const [activeProductId, setActiveProductId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [batteryDraft, setBatteryDraft] = useState(String(batteryQty));
  const [paidDraft, setPaidDraft] = useState("");
  const [confirmLine, setConfirmLine] = useState<Line | null>(null);
  const [confirmValue, setConfirmValue] = useState(0);
  const [confirmReason, setConfirmReason] = useState("");
  const [closeConfirmOpen, setCloseConfirmOpen] = useState(false);
  const [closeConfirmPaidAmount, setCloseConfirmPaidAmount] = useState(0);
  const [closeConfirmMode, setCloseConfirmMode] = useState<"A CUENTA" | "COBRADO" | null>(
    null
  );
  const [closed, setClosed] = useState<{
    total: number;
    balance: number;
    paymentStatus: string;
  } | null>(initialClosed);
  const [message, setMessage] = useState<{ text: string; kind: "success" | "error" } | null>(
    null
  );
  const [historyOpen, setHistoryOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  const inputRefs = useRef<Record<string, HTMLInputElement | null>>({});
  const skipBlurCommitForProductId = useRef<string | null>(null);

  const filteredLines = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return lines;
    return lines.filter((line) => line.productName.toLowerCase().includes(normalized));
  }, [lines, query]);

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
        <span>D.D.</span>
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

  const totals = useMemo(() => {
    const subtotal = lines.reduce((acc, line) => {
      const now = values[line.productId] ?? 0;
      const sold = line.orderQty + line.leftoversPrev - now;
      const lineTotal = sold > 0 ? sold * line.unitPriceUsed : 0;
      return acc + lineTotal;
    }, 0);
    const battery = Number(batteryUnitPrice) * Number(batteryDraft || 0);
    return { subtotal, battery, total: subtotal + battery };
  }, [lines, values, batteryDraft, batteryUnitPrice]);

  const saldo = Math.max(0, totals.total - Number(paidDraft || 0));

  const setLeftoversNow = (productId: string, raw: string) => {
    const numeric = Number.parseInt(raw.replace(/[^\d]/g, ""), 10);
    const next = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
    setValues((prev) => ({ ...prev, [productId]: next }));
    setDirty((prev) => ({ ...prev, [productId]: true }));
  };

  const setBatteryQty = (raw: string) => {
    const numeric = Number.parseInt(raw.replace(/[^\d]/g, ""), 10);
    const next = Number.isFinite(numeric) ? Math.max(0, numeric) : 0;
    setBatteryDraft(String(next));
  };

  const setPaidAmount = (raw: string) => {
    const normalized = raw.replace(/[^\d.]/g, "");
    setPaidDraft(normalized);
  };

  const requestCloseConfirm = (paidAmount: number, mode: "A CUENTA" | "COBRADO") => {
    if (confirmLine) return;
    setCloseConfirmPaidAmount(paidAmount);
    setCloseConfirmMode(mode);
    setCloseConfirmOpen(true);
  };

  const confirmClose = () => {
    if (!closeConfirmMode) return;
    setCloseConfirmOpen(false);
    setCloseConfirmMode(null);
    handleClose(closeConfirmPaidAmount);
  };

  const handleReopen = () => {
    startTransition(async () => {
      try {
        await reopenTicket(ticketId);
        setClosed(null);
        setPaidDraft("");
        setMessage({ text: "Boleta reabierta.", kind: "success" });
      } catch {
        setMessage({ text: "No se pudo reabrir.", kind: "error" });
      }
    });
  };

  const focusRow = (index: number) => {
    const next = filteredLines[index];
    if (!next) return;
    const el = inputRefs.current[next.productId];
    if (!el) return;
    el.focus();
    el.select();
  };

  const commitLine = async (line: Line, qty: number) => {
    try {
      const result = await updateLeftoversNow({
        ticketId,
        productId: line.productId,
        qty,
      });
      if (result?.needsConfirm) {
        setConfirmLine(line);
        setConfirmValue(qty);
        setConfirmReason("");
        return false;
      }
      setDirty((prev) => {
        if (!prev[line.productId]) return prev;
        const next = { ...prev };
        delete next[line.productId];
        return next;
      });
      return true;
    } catch {
      setMessage({ text: "Revisa los valores ingresados.", kind: "error" });
      return false;
    }
  };

  const flushDirty = async () => {
    for (const line of lines) {
      if (!dirty[line.productId]) continue;
      const qty = values[line.productId] ?? 0;
      const ok = await commitLine(line, qty);
      if (!ok) return false;
    }
    return true;
  };

  const confirmAdjustment = async () => {
    if (!confirmLine) return;
    try {
      await updateLeftoversNow({
        ticketId,
        productId: confirmLine.productId,
        qty: confirmValue,
        confirmed: true,
        reason: confirmReason || "ajuste",
      });
      setValues((prev) => ({ ...prev, [confirmLine.productId]: confirmValue }));
      setDirty((prev) => {
        if (!prev[confirmLine.productId]) return prev;
        const next = { ...prev };
        delete next[confirmLine.productId];
        return next;
      });
      setConfirmLine(null);
    } catch {
      setMessage({ text: "No se pudo confirmar el ajuste.", kind: "error" });
    }
  };

  const handleClose = (paidAmount: number) => {
    startTransition(async () => {
      setMessage(null);
      const ok = await flushDirty();
      if (!ok) return;
      try {
        const result = await closeTicket({
          ticketId,
          batteryQty: Number(batteryDraft || 0),
          paidAmount,
        });
        if (!result.ok) {
          let text = "No se pudo cerrar.";
          switch (result.reason) {
            case "INVALID_BATTERY_QTY":
              text = "Cantidad de batería inválida.";
              break;
            case "NOT_FOUND":
              text = "Boleta no encontrada.";
              break;
            case "LEFTOVERS_EXCEED":
              text = "Hay sobras hoy mayores al máximo. Revisa filas en rojo.";
              break;
            case "NEGATIVE_SOLD":
              text = "Hay unidades vendidas negativas. Revisa los datos.";
              break;
          }
          setMessage({ text, kind: "error" });
          return;
        }
        setClosed({
          total: result.total,
          balance: result.balance,
          paymentStatus: result.paymentStatus,
        });
        setMessage({
          text: result.alreadyClosed ? "Boleta ya estaba cerrada." : "Boleta cerrada.",
          kind: "success",
        });
      } catch {
        setMessage({ text: "No se pudo cerrar.", kind: "error" });
      }
    });
  };

  const renderColumn = (columnLines: Line[]) => (
    <Table
      containerClassName="overflow-x-hidden flex justify-center"
      className="w-max table-fixed text-sm"
    >
      <TableHeader>
        <TableRow>
          <TableHead className="h-9 w-[175px] bg-card text-center">Producto</TableHead>
          <TableHead className="h-9 w-[56px] bg-card text-center">D.A.</TableHead>
          <TableHead className="h-9 w-[56px] bg-card text-center">PED.</TableHead>
          <TableHead className="h-9 w-[72px] bg-card text-center">D.D.</TableHead>
          <TableHead className="h-9 w-[56px] bg-card text-center">Vnd</TableHead>
          <TableHead className="h-9 w-[82px] bg-card text-center">Importe</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {columnLines.map((line) => {
          const now = values[line.productId] ?? 0;
          const max = line.orderQty + line.leftoversPrev;
          const sold = line.orderQty + line.leftoversPrev - now;
          const importe = sold > 0 ? sold * line.unitPriceUsed : 0;
          const needsAttention = now > max;
          const isActive = activeProductId === line.productId;

          const rowClass = needsAttention
            ? "bg-red-50 hover:bg-red-50"
            : isActive
              ? "border-amber-200 bg-amber-100/60 hover:bg-amber-100/60"
              : undefined;

          return (
            <TableRow key={line.productId} className={rowClass}>
              <TableCell className="py-[3px] px-2 whitespace-normal text-center">
                <p className="text-sm font-semibold leading-tight text-center">
                  {line.productName}{" "}
                  <span className="text-xs font-normal text-muted-foreground">
                    {formatCurrency(line.unitPriceUsed)}
                  </span>
                </p>
              </TableCell>
              <TableCell className="py-[3px] px-2 text-center text-sm font-semibold">
                {line.leftoversPrev}
              </TableCell>
              <TableCell className="py-[3px] px-2 text-center text-sm font-semibold">
                {line.orderQty}
              </TableCell>
              <TableCell className="py-[3px] px-2 text-center">
                <Input
                  ref={(el) => {
                    inputRefs.current[line.productId] = el;
                  }}
                  value={String(now)}
                  inputMode="numeric"
                  pattern="[0-9]*"
                  data-pos-nav="close"
                  data-product-id={line.productId}
                  className="h-[29px] px-1 text-center text-base font-semibold"
                  disabled={!!closed}
                  onFocus={(event) => {
                    setActiveProductId(line.productId);
                    event.currentTarget.select();
                  }}
                  onBlur={() => {
                    if (skipBlurCommitForProductId.current === line.productId) {
                      skipBlurCommitForProductId.current = null;
                      return;
                    }
                    void commitLine(line, values[line.productId] ?? 0);
                  }}
                  onChange={(event) => setLeftoversNow(line.productId, event.target.value)}
                />
              </TableCell>
              <TableCell className="py-[3px] px-2 text-center text-sm font-semibold">
                {sold}
              </TableCell>
              <TableCell className="py-[3px] px-2 text-center text-sm font-semibold">
                {formatCurrency(importe)}
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
        if (event.key !== "Enter" && event.key !== "ArrowDown" && event.key !== "ArrowUp") return;

        const target = event.target as HTMLElement | null;
        if (!(target instanceof HTMLInputElement)) return;
        if (target.dataset.posNav !== "close") return;

        const productId = target.dataset.productId;
        if (!productId) return;
        const currentIndex = filteredLines.findIndex((line) => line.productId === productId);
        if (currentIndex === -1) return;
        const currentLine = filteredLines[currentIndex];
        if (!currentLine) return;

        event.preventDefault();
        const qty = values[productId] ?? 0;
        const delta = event.key === "ArrowUp" ? -1 : 1;
        void commitLine(currentLine, qty).then((ok) => {
          if (!ok) return;
          skipBlurCommitForProductId.current = productId;
          focusRow(currentIndex + delta);
        });
      }}
    >
      <Card className="flex h-full flex-col gap-3 p-3">
        <div className="space-y-3">
          <div className="flex flex-wrap items-start justify-between gap-2">
            <VendorBadge name={vendor.name} code={vendor.code} size="lg" />
            {closed ? (
              <Button
                type="button"
                variant="secondary"
                className="h-10"
                onClick={() => {
                  window.open(`/boleta/${ticketId}/imprimir`, "_blank", "noopener,noreferrer");
                }}
              >
                Imprimir boleta
              </Button>
            ) : null}
          </div>
          {isCarryOver ? (
            <div className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
              <p className="font-semibold">
                Boleta pendiente del {formatDateLabel(ticketDate)}.
              </p>
              <p className="text-xs text-amber-800">
                Hoy es {todayLabel}. Este cierre acumula saldos pendientes.
              </p>
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-2">
          <Button type="button" variant="outline" className="h-10" onClick={onChangeVendor}>
            Cambiar
          </Button>
          <Button
            type="button"
            variant="outline"
            className="h-10"
            onClick={() => setHistoryOpen(true)}
          >
            Historial
          </Button>
          </div>

          <div className="space-y-2">
          <Input
            className="h-10 text-base"
            placeholder="Buscar producto..."
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <p className="text-xs text-muted-foreground">Tip: Enter/↓/↑ para moverte.</p>
          </div>
        </div>

        <div className="mt-auto space-y-2 rounded-2xl bg-white/70 p-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm text-muted-foreground">Batería</p>
              <p className="text-lg font-semibold">{formatCurrency(batteryUnitPrice)}</p>
            </div>
            <div className="w-24">
              <Input
                value={batteryDraft}
                inputMode="numeric"
                pattern="[0-9]*"
                className="h-9 text-center text-base font-semibold"
                disabled={!!closed}
                onFocus={(event) => event.currentTarget.select()}
                onChange={(event) => setBatteryQty(event.target.value)}
              />
            </div>
          </div>

          <div className="rounded-2xl bg-slate-900 px-3 py-2 text-center text-xl text-white">
            Total: {formatCurrency(totals.total)}
          </div>

          <div className="space-y-2">
            <label className="text-sm text-muted-foreground">Monto recibido (A cuenta)</label>
            <Input
              value={paidDraft}
              inputMode="decimal"
              className="h-10 text-center text-base font-semibold"
              placeholder="0.00"
              disabled={!!closed}
              onFocus={(event) => event.currentTarget.select()}
              onChange={(event) => setPaidAmount(event.target.value)}
            />
            <p className="text-xs text-muted-foreground">Saldo: {formatCurrency(saldo)}</p>
          </div>

          <div className="grid grid-cols-2 gap-2">
            <Button
              className="h-10 text-base"
              onClick={() => requestCloseConfirm(Number(paidDraft || 0), "A CUENTA")}
              disabled={isPending || !!confirmLine || !!closed || closeConfirmOpen}
            >
              A CUENTA
            </Button>
            <Button
              className="h-10 text-base"
              onClick={() => requestCloseConfirm(totals.total, "COBRADO")}
              disabled={isPending || !!confirmLine || !!closed || closeConfirmOpen}
            >
              COBRADO
            </Button>
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

          {closed ? (
            <div className="rounded-2xl bg-slate-50 p-3 text-sm">
              <p className="font-semibold">
                {closed.paymentStatus} ? Total {formatCurrency(closed.total)} ? Saldo{" "}
                {formatCurrency(closed.balance)}
              </p>
              {isAdmin ? (
                <Button
                  type="button"
                  variant="outline"
                  className="mt-3 h-10 w-full"
                  onClick={handleReopen}
                  disabled={isPending}
                >
                  Reabrir boleta (Admin)
                </Button>
              ) : null}
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

      <Dialog
        open={closeConfirmOpen}
        onOpenChange={(open) => {
          setCloseConfirmOpen(open);
          if (!open) {
            setCloseConfirmMode(null);
            setCloseConfirmPaidAmount(0);
          }
        }}
      >
        <DialogContent
          className="max-w-3xl"
          onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (isPending) return;
            confirmClose();
          }}
        >
          <DialogHeader>
            <DialogTitle>Confirmar cobro</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Revisa todos los productos ingresados en D.D. antes de confirmar.
            </p>
            {renderConfirmTable()}
            {closeConfirmMode ? (
              <div className="rounded-xl bg-slate-50 px-3 py-2 text-sm">
                <p className="font-semibold">{closeConfirmMode}</p>
                <p className="text-muted-foreground">
                  Monto: {formatCurrency(closeConfirmPaidAmount)}
                </p>
              </div>
            ) : null}
            <div className="flex flex-wrap items-center justify-end gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCloseConfirmOpen(false)}
                disabled={isPending}
              >
                Cancelar
              </Button>
              <Button type="button" onClick={confirmClose} disabled={isPending}>
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

      <Dialog open={!!confirmLine} onOpenChange={() => setConfirmLine(null)}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Confirmar ajuste</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Las sobras hoy superan el máximo permitido. Ingresa un motivo.
            </p>
            <Textarea
              placeholder="Motivo (ajuste, error de conteo...)"
              value={confirmReason}
              onChange={(event) => setConfirmReason(event.target.value)}
            />
            <Button className="w-full" onClick={confirmAdjustment} disabled={isPending}>
              Confirmar ajuste
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
