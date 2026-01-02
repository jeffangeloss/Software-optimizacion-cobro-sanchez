"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin } from "@/lib/auth";
import { calcBatteryTotal, calcSoldQty, calcSubtotal, sumTotals } from "@/lib/ticket";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const dateSchema = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const entrySchema = z.object({
  productId: z.string().min(1),
  leftoversPrev: z.number().int().min(0),
  orderQty: z.number().int().min(0),
  leftoversNow: z.number().int().min(0),
});

const payloadSchema = z.object({
  date: dateSchema,
  vendorId: z.string().min(1),
  batteryQty: z.number().int().min(0),
  paidAmount: z.number().min(0),
  leftoversReported: z.boolean().optional(),
  entries: z.array(entrySchema),
});

const ensureSettings = async () => {
  const existing = await prisma.settings.findUnique({ where: { id: "global" } });
  if (existing) return existing;
  return prisma.settings.create({
    data: {
      id: "global",
      batteryMode: "PER_DAY",
      batteryUnitPrice: new Prisma.Decimal("3.00"),
      batteryQty: 1,
    },
  });
};

const getPriceForDate = async (productId: string, date: string) => {
  const price = await prisma.priceHistory.findFirst({
    where: { productId, validFrom: { lte: date } },
    orderBy: { validFrom: "desc" },
  });
  return price?.price ?? new Prisma.Decimal(0);
};

export const getHistoricalEntry = async (params: { vendorId: string; date: string }) => {
  await requireAdmin();
  const parsed = z
    .object({ vendorId: z.string().min(1), date: dateSchema })
    .safeParse(params);
  if (!parsed.success) {
    return { ok: false, message: "Fecha invalida." };
  }

  const { vendorId, date } = parsed.data;
  const [settings, products, ticket] = await Promise.all([
    ensureSettings(),
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }),
    prisma.ticket.findUnique({
      where: { vendorId_date: { vendorId, date } },
      include: { lines: true },
    }),
  ]);

  const priceByProductId = new Map<string, Prisma.Decimal>();
  await Promise.all(
    products.map(async (product) => {
      const price = await getPriceForDate(product.id, date);
      priceByProductId.set(product.id, price);
    })
  );

  const lineByProductId = new Map(
    ticket?.lines.map((line) => [line.productId, line]) ?? []
  );

  return {
    ok: true,
    targetDate: date,
    status: ticket?.status ?? "OPEN",
    batteryQty: ticket?.batteryQty ?? settings.batteryQty,
    batteryUnitPrice: Number(settings.batteryUnitPrice),
    paidAmount: ticket
      ? ticket.leftoversReported
        ? Number(ticket.paidAmount)
        : Number(ticket.carryoverCredit)
      : 0,
    leftoversReported: ticket?.leftoversReported ?? true,
    lines: products.map((product) => {
      const line = lineByProductId.get(product.id);
      const unitPriceUsed = line?.unitPriceUsed ?? priceByProductId.get(product.id);
      return {
        productId: product.id,
        name: product.name,
        unitPriceUsed: Number(unitPriceUsed ?? 0),
        leftoversPrev: line?.leftoversPrev ?? 0,
        orderQty: line?.orderQty ?? 0,
        leftoversNow: line?.leftoversNow ?? 0,
      };
    }),
  };
};

export const saveHistoricalEntry = async (payload: z.infer<typeof payloadSchema>) => {
  const session = await requireAdmin();
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "Datos invalidos." };
  }

  const { vendorId, entries, batteryQty, paidAmount, date } = parsed.data;
  const leftoversReported = parsed.data.leftoversReported ?? true;
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });

  const productById = new Map(products.map((product) => [product.id, product]));
  const missingProduct = entries.find((entry) => !productById.has(entry.productId));
  if (missingProduct) {
    return { ok: false, message: "Producto no encontrado." };
  }

  const settings = await ensureSettings();
  const priceByProductId = new Map<string, Prisma.Decimal>();
  await Promise.all(
    products.map(async (product) => {
      const price = await getPriceForDate(product.id, date);
      priceByProductId.set(product.id, price);
    })
  );

  const entryByProductId = new Map(entries.map((entry) => [entry.productId, entry]));

  const ticket = await prisma.ticket.findUnique({
    where: { vendorId_date: { vendorId, date } },
    include: { lines: true },
  });

  let ticketId = ticket?.id;
  if (!ticket) {
    const created = await prisma.ticket.create({
      data: {
        vendorId,
        date,
        status: "OPEN",
        batteryMode: settings.batteryMode,
        batteryUnitPrice: settings.batteryUnitPrice,
        batteryQty,
        total: new Prisma.Decimal(0),
        paidAmount: new Prisma.Decimal(0),
        balance: new Prisma.Decimal(0),
        paymentStatus: "CREDIT",
        createdByUserId: session.userId,
        lines: {
          create: products.map((product) => ({
            productId: product.id,
            leftoversPrev: 0,
            orderQty: 0,
            leftoversNow: 0,
            soldQty: 0,
            unitPriceUsed: priceByProductId.get(product.id) ?? new Prisma.Decimal(0),
            subtotal: new Prisma.Decimal(0),
          })),
        },
      },
      include: { lines: true },
    });
    ticketId = created.id;
  } else {
    const existingProductIds = new Set(ticket.lines.map((line) => line.productId));
    const missingLines = products.filter((product) => !existingProductIds.has(product.id));
    if (missingLines.length) {
      await prisma.$transaction(
        missingLines.map((product) =>
          prisma.ticketLine.create({
            data: {
              ticketId: ticket.id,
              productId: product.id,
              leftoversPrev: 0,
              orderQty: 0,
              leftoversNow: 0,
              soldQty: 0,
              unitPriceUsed: priceByProductId.get(product.id) ?? new Prisma.Decimal(0),
              subtotal: new Prisma.Decimal(0),
            },
          })
        )
      );
    }
  }

  if (!ticketId) {
    return { ok: false, message: "No se pudo crear la boleta." };
  }

  const lineUpdates: Array<{
    productId: string;
    leftoversPrev: number;
    orderQty: number;
    leftoversNow: number;
    soldQty: number;
    unitPriceUsed: Prisma.Decimal;
    subtotal: Prisma.Decimal;
  }> = [];

  for (const product of products) {
    const entry = entryByProductId.get(product.id) ?? {
      productId: product.id,
      leftoversPrev: 0,
      orderQty: 0,
      leftoversNow: 0,
    };
    const max = entry.leftoversPrev + entry.orderQty;
    if (entry.leftoversNow > max) {
      return { ok: false, message: `Sobras > maximo en ${product.name}.` };
    }
    const soldQty = calcSoldQty(entry.orderQty, entry.leftoversPrev, entry.leftoversNow);
    if (soldQty < 0) {
      return { ok: false, message: `Venta negativa en ${product.name}.` };
    }
    const unitPriceUsed = priceByProductId.get(product.id) ?? new Prisma.Decimal(0);
    const subtotal = new Prisma.Decimal(calcSubtotal(soldQty, Number(unitPriceUsed)));
    lineUpdates.push({
      productId: product.id,
      leftoversPrev: entry.leftoversPrev,
      orderQty: entry.orderQty,
      leftoversNow: entry.leftoversNow,
      soldQty,
      unitPriceUsed,
      subtotal,
    });
  }

  await prisma.$transaction(
    lineUpdates.map((line) =>
      prisma.ticketLine.update({
        where: { ticketId_productId: { ticketId: ticketId!, productId: line.productId } },
        data: {
          leftoversPrev: line.leftoversPrev,
          orderQty: line.orderQty,
          leftoversNow: line.leftoversNow,
          soldQty: line.soldQty,
          unitPriceUsed: line.unitPriceUsed,
          subtotal: line.subtotal,
        },
      })
    )
  );

  const batteryTotal = calcBatteryTotal(
    settings.batteryMode,
    Number(settings.batteryUnitPrice),
    batteryQty
  );
  const total = sumTotals(
    lineUpdates.map((line) => Number(line.subtotal)),
    batteryTotal
  );

  const paid = leftoversReported ? Number(paidAmount.toFixed(2)) : 0;
  const carryoverCredit = leftoversReported ? 0 : Number(paidAmount.toFixed(2));
  const balance = Number(Math.max(0, total - paid).toFixed(2));
  const paymentStatus = paid >= total ? "PAID" : paid === 0 ? "CREDIT" : "PARTIAL";

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: "CLOSED",
      batteryMode: settings.batteryMode,
      batteryUnitPrice: settings.batteryUnitPrice,
      batteryQty,
      total: new Prisma.Decimal(total),
      paidAmount: new Prisma.Decimal(paid),
      balance: new Prisma.Decimal(balance),
      paymentStatus,
      leftoversReported,
      carryoverCredit: new Prisma.Decimal(carryoverCredit),
      carryoverAppliedAt: null,
      closedAt: new Date(),
      closedByUserId: session.userId,
    },
  });

  const carryoverByProductId = new Map(
    lineUpdates.map((line) => [line.productId, line.leftoversNow])
  );
  const nextOpenTicket = await prisma.ticket.findFirst({
    where: { vendorId, status: "OPEN", date: { gt: date } },
    orderBy: { date: "asc" },
    include: { lines: true },
  });

  if (nextOpenTicket) {
    await prisma.$transaction(
      nextOpenTicket.lines.map((line) => {
        const nextPrev = carryoverByProductId.get(line.productId) ?? line.leftoversPrev;
        const max = nextPrev + line.orderQty;
        const nextNow = Math.min(line.leftoversNow, max);
        const soldQty = Math.max(0, calcSoldQty(line.orderQty, nextPrev, nextNow));
        const subtotal = calcSubtotal(soldQty, Number(line.unitPriceUsed));
        return prisma.ticketLine.update({
          where: { id: line.id },
          data: {
            leftoversPrev: nextPrev,
            leftoversNow: nextNow,
            soldQty,
            subtotal: new Prisma.Decimal(subtotal),
          },
        });
      })
    );

    if (!leftoversReported && carryoverCredit > 0) {
      await prisma.ticket.update({
        where: { id: nextOpenTicket.id },
        data: { paidAmount: new Prisma.Decimal(carryoverCredit) },
      });
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { carryoverAppliedAt: new Date() },
      });
    }
  }

  return { ok: true, total, balance, paymentStatus };
};
