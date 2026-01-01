"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { VendorSelect } from "@/components/pos/vendor-select";
import { CloseForm } from "@/components/pos/close-form";
import { getOrCreateOpenTicket, getVendorHistory } from "@/app/actions/tickets";

type Vendor = {
  id: string;
  name: string;
  code: string;
  isFavorite: boolean;
};

type TicketLine = {
  productId: string;
  product: { name: string };
  leftoversPrev: number;
  orderQty: number;
  leftoversNow: number;
  unitPriceUsed: number;
};

type Ticket = {
  id: string;
  vendor: { name: string; code: string };
  date: string;
  isCarryOver: boolean;
  status: "OPEN" | "CLOSED";
  batteryUnitPrice: number;
  batteryQty: number;
  total: number;
  balance: number;
  paymentStatus: "PAID" | "CREDIT" | "PARTIAL";
  lines: TicketLine[];
};

type CierreFlowProps = {
  vendors: Vendor[];
  isAdmin: boolean;
};

export function CierreFlow({ vendors, isAdmin }: CierreFlowProps) {
  const router = useRouter();
  const [selectedVendor, setSelectedVendor] = useState<Vendor | null>(null);
  const [ticket, setTicket] = useState<Ticket | null>(null);
  const [history, setHistory] = useState<
    Array<{ id: string; date: string; total: number; paymentStatus: string }>
  >([]);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleSelect = (vendor: Vendor) => {
    setSelectedVendor(vendor);
    setError(null);
    startTransition(async () => {
      try {
        const openTicket = await getOrCreateOpenTicket(vendor.id);
        const historyData = await getVendorHistory(vendor.id);
        setTicket(openTicket as Ticket);
        setHistory(historyData.map((item) => ({
          ...item,
          total: Number(item.total),
        })));
      } catch (err) {
        const message = err instanceof Error ? err.message : "";
        if (message.includes("NO_SESSION")) {
          router.replace(`/login?next=${encodeURIComponent("/cierre")}`);
          return;
        }
        setSelectedVendor(null);
        setTicket(null);
        setHistory([]);
        setError("No se pudo abrir el cierre. Intenta nuevamente.");
      }
    });
  };

  if (!selectedVendor || !ticket) {
    return (
      <div className="h-full min-h-0 overflow-auto pr-2">
        <div className="space-y-6">
          <VendorSelect vendors={vendors} onSelect={handleSelect} />
          {error ? (
            <div className="rounded-xl bg-red-100 px-3 py-2 text-sm text-red-700">
              {error}
            </div>
          ) : null}
          {isPending ? <p className="text-sm text-muted-foreground">Cargando...</p> : null}
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <CloseForm
        ticketId={ticket.id}
        vendor={{ name: ticket.vendor.name, code: ticket.vendor.code }}
        history={history}
        isAdmin={isAdmin}
        ticketDate={ticket.date}
        isCarryOver={ticket.isCarryOver}
        onChangeVendor={() => {
          setTicket(null);
          setSelectedVendor(null);
          setHistory([]);
        }}
        initialClosed={
          ticket.status === "CLOSED"
            ? { total: ticket.total, balance: ticket.balance, paymentStatus: ticket.paymentStatus }
            : null
        }
        batteryUnitPrice={Number(ticket.batteryUnitPrice)}
        batteryQty={ticket.batteryQty}
        lines={ticket.lines.map((line) => ({
          productId: line.productId,
          productName: line.product.name,
          leftoversPrev: line.leftoversPrev,
          orderQty: line.orderQty,
          leftoversNow: line.leftoversNow,
          unitPriceUsed: Number(line.unitPriceUsed),
        }))}
      />
    </div>
  );
}
