import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSessionOrRedirect } from "@/lib/auth";
import { PedidoFlow } from "@/components/pos/pedido-flow";
import { PosClock } from "@/components/pos/pos-clock";
import { Button } from "@/components/ui/button";
import { todayIso } from "@/lib/date";

export default async function PedidoPage() {
  await requireSessionOrRedirect("/pedido");

  const vendorsRaw = await prisma.vendor.findMany({
    where: { active: true },
    orderBy: [{ isFavorite: "desc" }, { name: "asc" }],
  });

  const today = todayIso();
  const ticketsWithOrders = await prisma.ticket.findMany({
    where: {
      date: today,
      lines: { some: { orderQty: { gt: 0 } } },
    },
    select: { vendorId: true },
  });
  const vendorsWithOrders = new Set(ticketsWithOrders.map((ticket) => ticket.vendorId));
  const vendors = vendorsRaw.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    code: vendor.code,
    isFavorite: vendor.isFavorite,
    hasOrder: vendorsWithOrders.has(vendor.id),
  }));

  return (
    <main className="h-screen overflow-hidden px-3 py-2">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-2">
        <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
              Flujo de mañana
            </p>
            <h1 className="font-display text-3xl">Pedido</h1>
          </div>
          <div className="justify-self-center">
            <PosClock />
          </div>
          <div className="justify-self-end">
            <Button asChild variant="ghost">
              <Link href="/">Volver</Link>
            </Button>
          </div>
        </div>
        <div className="min-h-0 flex-1">
          <PedidoFlow vendors={vendors} />
        </div>
      </div>
    </main>
  );
}
