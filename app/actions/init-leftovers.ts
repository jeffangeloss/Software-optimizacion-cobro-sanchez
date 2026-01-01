"use server";

import { prisma } from "@/lib/prisma";
import { pinSchema } from "@/lib/validators";
import { Prisma } from "@prisma/client";
import { z } from "zod";

const INIT_PIN = process.env.INIT_LEFTOVERS_PIN ?? "1617";
const TARGET_DATE = "2026-01-01";

const entriesSchema = z.array(
  z.object({
    vendorId: z.string().min(1),
    productId: z.string().min(1),
    qty: z.number().int().min(0),
  })
);

const payloadSchema = z.object({
  pin: z.string(),
  entries: entriesSchema,
});

const validatePin = (pin: string) => {
  const normalized = pin.trim();
  const parsed = pinSchema.safeParse(normalized);
  if (!parsed.success) {
    return { ok: false, message: "PIN invalido." };
  }
  if (parsed.data !== INIT_PIN) {
    return { ok: false, message: "PIN incorrecto." };
  }
  return { ok: true as const };
};

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

export const verifyInitPin = async (pin: string) => {
  const check = validatePin(pin);
  if (!check.ok) return { ok: false, message: check.message };
  return { ok: true };
};

export const saveInitialLeftovers = async (payload: {
  pin: string;
  entries: Array<{ vendorId: string; productId: string; qty: number }>;
}) => {
  const parsed = payloadSchema.safeParse(payload);
  if (!parsed.success) {
    return { ok: false, message: "Datos invalidos." };
  }

  const pinCheck = validatePin(parsed.data.pin);
  if (!pinCheck.ok) return { ok: false, message: pinCheck.message };

  const entries = parsed.data.entries;
  if (!entries.length) return { ok: false, message: "No hay datos." };

  const vendorIds = [...new Set(entries.map((entry) => entry.vendorId))];
  const productIds = [...new Set(entries.map((entry) => entry.productId))];

  const [settings, actor, vendors, activeProducts] = await Promise.all([
    ensureSettings(),
    prisma.user.findFirst({ where: { role: "ADMIN" }, orderBy: { createdAt: "asc" } }),
    prisma.vendor.findMany({ where: { id: { in: vendorIds } } }),
    prisma.product.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    }),
  ]);

  if (!actor) return { ok: false, message: "No hay usuario admin." };

  const vendorById = new Map(vendors.map((vendor) => [vendor.id, vendor]));
  const missingVendors = vendorIds.filter((id) => !vendorById.has(id));
  if (missingVendors.length) {
    return { ok: false, message: "Vendedor no encontrado." };
  }

  const activeProductIds = new Set(activeProducts.map((product) => product.id));
  const missingProducts = productIds.filter((id) => !activeProductIds.has(id));
  if (missingProducts.length) {
    return { ok: false, message: "Producto no encontrado." };
  }

  const priceByProductId = new Map<string, Prisma.Decimal>();
  await Promise.all(
    activeProducts.map(async (product) => {
      const price = await getPriceForDate(product.id, TARGET_DATE);
      priceByProductId.set(product.id, price);
    })
  );

  for (const vendorId of vendorIds) {
    const vendorEntries = entries.filter((entry) => entry.vendorId === vendorId);
    const qtyByProductId = new Map(
      vendorEntries.map((entry) => [entry.productId, entry.qty])
    );

    let ticket = await prisma.ticket.findUnique({
      where: { vendorId_date: { vendorId, date: TARGET_DATE } },
      include: { lines: true },
    });

    if (!ticket) {
      await prisma.ticket.create({
        data: {
          vendorId,
          date: TARGET_DATE,
          status: "OPEN",
          batteryMode: settings.batteryMode,
          batteryUnitPrice: settings.batteryUnitPrice,
          batteryQty: settings.batteryQty,
          total: new Prisma.Decimal(0),
          paidAmount: new Prisma.Decimal(0),
          balance: new Prisma.Decimal(0),
          paymentStatus: "CREDIT",
          createdByUserId: actor.id,
          lines: {
            create: activeProducts.map((product) => ({
              productId: product.id,
              leftoversPrev: qtyByProductId.get(product.id) ?? 0,
              orderQty: 0,
              leftoversNow: 0,
              soldQty: 0,
              unitPriceUsed: priceByProductId.get(product.id) ?? new Prisma.Decimal(0),
              subtotal: new Prisma.Decimal(0),
            })),
          },
        },
      });
      continue;
    }

    const existingProductIds = new Set(ticket.lines.map((line) => line.productId));
    const missingLines = activeProducts.filter((product) => !existingProductIds.has(product.id));
    if (missingLines.length) {
      await prisma.$transaction(
        missingLines.map((product) =>
          prisma.ticketLine.create({
            data: {
              ticketId: ticket!.id,
              productId: product.id,
              leftoversPrev: qtyByProductId.get(product.id) ?? 0,
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

    await prisma.ticketLine.updateMany({
      where: { ticketId: ticket.id, productId: { in: [...activeProductIds] } },
      data: { leftoversPrev: 0 },
    });

    if (vendorEntries.length) {
      await prisma.$transaction(
        vendorEntries.map((entry) =>
          prisma.ticketLine.update({
            where: { ticketId_productId: { ticketId: ticket!.id, productId: entry.productId } },
            data: { leftoversPrev: entry.qty },
          })
        )
      );
    }
  }

  return { ok: true, targetDate: TARGET_DATE };
};
