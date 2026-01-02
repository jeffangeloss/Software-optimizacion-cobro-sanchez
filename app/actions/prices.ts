"use server";

import { prisma } from "@/lib/prisma";
import { Prisma } from "@prisma/client";
import { requireAdmin } from "@/lib/auth";
import { calcBatteryTotal, sumTotals } from "@/lib/ticket";
import { z } from "zod";

const priceSchema = z.object({
  productId: z.string().min(1),
  price: z.number().positive(),
  validFrom: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
});

export const setProductPrice = async (data: z.infer<typeof priceSchema>) => {
  await requireAdmin();
  const parsed = priceSchema.safeParse(data);
  if (!parsed.success) throw new Error("INVALID");
  const price = new Prisma.Decimal(parsed.data.price);
  await prisma.priceHistory.upsert({
    where: {
      productId_validFrom: {
        productId: parsed.data.productId,
        validFrom: parsed.data.validFrom,
      },
    },
    update: { price },
    create: { ...parsed.data, price },
  });
  const lines = await prisma.ticketLine.findMany({
    where: { productId: parsed.data.productId },
    select: { id: true, ticketId: true, soldQty: true },
  });
  const updatedSubtotalByLine = lines.map((line) => ({
    id: line.id,
    ticketId: line.ticketId,
    subtotal: new Prisma.Decimal((line.soldQty * parsed.data.price).toFixed(2)),
  }));
  if (updatedSubtotalByLine.length) {
    await prisma.$transaction(
      updatedSubtotalByLine.map((line) =>
        prisma.ticketLine.update({
          where: { id: line.id },
          data: {
            unitPriceUsed: price,
            subtotal: line.subtotal,
          },
        })
      )
    );

    const ticketIds = [...new Set(updatedSubtotalByLine.map((line) => line.ticketId))];
    for (const ticketId of ticketIds) {
      const ticket = await prisma.ticket.findUnique({
        where: { id: ticketId },
        select: {
          batteryMode: true,
          batteryUnitPrice: true,
          batteryQty: true,
          paidAmount: true,
          lines: { select: { subtotal: true } },
        },
      });
      if (!ticket) continue;
      const subtotals = ticket.lines.map((line) => Number(line.subtotal));
      const batteryTotal = calcBatteryTotal(
        ticket.batteryMode,
        Number(ticket.batteryUnitPrice),
        ticket.batteryQty
      );
      const total = sumTotals(subtotals, batteryTotal);
      const paidAmount = Number(ticket.paidAmount);
      const balance = Number(Math.max(0, total - paidAmount).toFixed(2));
      const paymentStatus =
        paidAmount >= total ? "PAID" : paidAmount === 0 ? "CREDIT" : "PARTIAL";

      await prisma.ticket.update({
        where: { id: ticketId },
        data: {
          total: new Prisma.Decimal(total),
          balance: new Prisma.Decimal(balance),
          paymentStatus,
        },
      });
    }
  }
  return { ok: true };
};
