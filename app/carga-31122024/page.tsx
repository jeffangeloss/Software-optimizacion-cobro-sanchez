import { prisma } from "@/lib/prisma";
import { requireAdminOrRedirect } from "@/lib/auth";
import { HistoricalEntryForm } from "./historical-entry-form";

const TARGET_DATE = "2024-12-31";

export default async function HistoricalEntryPage() {
  await requireAdminOrRedirect("/carga-31122024");

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
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
            Ajuste historico
          </p>
          <h1 className="font-display text-3xl">Carga historica de boleta</h1>
        </header>

        <HistoricalEntryForm vendors={vendors} targetDate={TARGET_DATE} />
      </div>
    </main>
  );
}
