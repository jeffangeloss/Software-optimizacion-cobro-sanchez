import { prisma } from "@/lib/prisma";
import { InitialLeftoversForm } from "./initial-leftovers-form";

const SOURCE_DATE = "2025-12-31";
const TARGET_DATE = "2026-01-01";

export default async function InitialLeftoversPage() {
  const vendorsRaw = await prisma.vendor.findMany({
    where: { active: true },
    orderBy: [{ isFavorite: "desc" }, { name: "asc" }],
  });
  const productsRaw = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });

  const vendors = vendorsRaw.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    code: vendor.code,
  }));
  const products = productsRaw.map((product) => ({
    id: product.id,
    name: product.name,
  }));

  const initialValues: Record<string, Record<string, number>> = {};
  vendors.forEach((vendor) => {
    initialValues[vendor.id] = {};
    products.forEach((product) => {
      initialValues[vendor.id][product.id] = 0;
    });
  });

  if (vendors.length && products.length) {
    const tickets = await prisma.ticket.findMany({
      where: {
        date: TARGET_DATE,
        vendorId: { in: vendors.map((vendor) => vendor.id) },
      },
      include: { lines: true },
    });
    const ticketByVendorId = new Map(tickets.map((ticket) => [ticket.vendorId, ticket]));

    vendors.forEach((vendor) => {
      const ticket = ticketByVendorId.get(vendor.id);
      if (!ticket) return;
      const lineByProductId = new Map(
        ticket.lines.map((line) => [line.productId, Number(line.leftoversPrev)])
      );
      products.forEach((product) => {
        initialValues[vendor.id][product.id] =
          lineByProductId.get(product.id) ?? 0;
      });
    });
  }

  return (
    <main className="min-h-screen px-4 py-6">
      <div className="mx-auto max-w-6xl space-y-6">
        <header className="space-y-2">
          <p className="text-sm uppercase tracking-[0.2em] text-muted-foreground">
            Ajuste inicial
          </p>
          <h1 className="font-display text-3xl">
            Sobras del 31/12/2025
          </h1>
        </header>

        <InitialLeftoversForm
          vendors={vendors}
          products={products}
          initialValues={initialValues}
          sourceDate={SOURCE_DATE}
          targetDate={TARGET_DATE}
        />
      </div>
    </main>
  );
}
