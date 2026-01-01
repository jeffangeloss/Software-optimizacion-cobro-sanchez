import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { requireSessionOrRedirect } from "@/lib/auth";
import { CierreFlow } from "@/components/pos/cierre-flow";
import { PosClock } from "@/components/pos/pos-clock";
import { Button } from "@/components/ui/button";

export default async function CierrePage() {
  const session = await requireSessionOrRedirect("/cierre");
  const vendorsRaw = await prisma.vendor.findMany({
    where: { active: true },
    orderBy: [{ isFavorite: "desc" }, { name: "asc" }],
  });
  const vendors = vendorsRaw.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    code: vendor.code,
    isFavorite: vendor.isFavorite,
  }));

  return (
    <main className="h-screen overflow-hidden px-3 py-2">
      <div className="mx-auto flex h-full max-w-[1600px] flex-col gap-2">
        <div className="grid gap-2 md:grid-cols-[1fr_auto_1fr] md:items-center">
          <div>
            <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
              Flujo de tarde
            </p>
            <h1 className="font-display text-3xl">Cierre y Cobro</h1>
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
          <CierreFlow vendors={vendors} isAdmin={session.role === "ADMIN"} />
        </div>
      </div>
    </main>
  );
}
