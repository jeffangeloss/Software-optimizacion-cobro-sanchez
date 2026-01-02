"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSession } from "@/lib/auth";
import { todayIso } from "@/lib/date";
import { nonNegativeInt } from "@/lib/validators";
import { calcBatteryTotal, calcSoldQty, calcSubtotal, sumTotals } from "@/lib/ticket";
import { logAudit } from "@/lib/audit";
import { Prisma } from "@prisma/client";
import { z } from "zod";

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
    where: {
      productId,
      validFrom: { lte: date },
    },
    orderBy: { validFrom: "desc" },
  });
  return price?.price ?? new Prisma.Decimal(0);
};

const getLeftoversPrev = async (vendorId: string, productId: string) => {
  const last = await prisma.ticketLine.findFirst({
    where: {
      productId,
      ticket: { vendorId, status: "CLOSED" },
    },
    orderBy: { ticket: { date: "desc" } },
    include: { ticket: true },
  });
  return last?.leftoversNow ?? 0;
};

const getCarryoverSource = async (vendorId: string, targetDate: string) =>
  prisma.ticket.findFirst({
    where: {
      vendorId,
      status: "CLOSED",
      date: { lt: targetDate },
      leftoversReported: false,
      carryoverCredit: { gt: 0 },
      carryoverAppliedAt: null,
    },
    orderBy: { date: "desc" },
    select: { id: true, carryoverCredit: true },
  });

export const getOrCreateOpenTicket = async (vendorId: string, date?: string) => {
  try {
    const session = await requireSession();
    const targetDate = date ?? todayIso();
    const applyCarryoverCredit = async (ticketId: string, ticketDate: string) => {
      if (ticketDate !== targetDate) return null;
      const source = await getCarryoverSource(vendorId, targetDate);
      if (!source) return null;
      const now = new Date();
      await prisma.ticket.update({
        where: { id: ticketId },
        data: { paidAmount: source.carryoverCredit },
      });
      await prisma.ticket.update({
        where: { id: source.id },
        data: { carryoverAppliedAt: now },
      });
      return Number(source.carryoverCredit);
    };
    const existing = await prisma.ticket.findUnique({
      where: { vendorId_date: { vendorId, date: targetDate } },
      include: { lines: { include: { product: true } }, vendor: true },
    });
    let current = existing;

    if (!current) {
      const pending = await prisma.ticket.findFirst({
        where: { vendorId, status: "OPEN" },
        orderBy: { date: "desc" },
        include: { lines: { include: { product: true } }, vendor: true },
      });
      if (pending) {
        current = pending;
      }
    }

    if (current) {
      if (current.status === "OPEN") {
        const products = await prisma.product.findMany({
          where: { active: true },
          orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
        });
        const existingProductIds = new Set(current.lines.map((line) => line.productId));
        const missingProducts = products.filter((product) => !existingProductIds.has(product.id));

        if (missingProducts.length) {
          const newLines = await Promise.all(
            missingProducts.map(async (product) => {
              const [leftoversPrev, unitPriceUsed] = await Promise.all([
                getLeftoversPrev(vendorId, product.id),
                getPriceForDate(product.id, targetDate),
              ]);
              return {
                ticketId: current.id,
                productId: product.id,
                leftoversPrev,
                orderQty: 0,
                leftoversNow: 0,
                soldQty: 0,
                unitPriceUsed,
                subtotal: new Prisma.Decimal(0),
              };
            })
          );

          await prisma.$transaction(
            newLines.map((data) => prisma.ticketLine.create({ data }))
          );
        }
      }

      const ticket = await prisma.ticket.findUnique({
        where: { id: current.id },
        include: { lines: { include: { product: true } }, vendor: true },
      });
      if (!ticket) throw new Error("NOT_FOUND");
      const carryoverPaidAmount =
        ticket.status === "OPEN" ? await applyCarryoverCredit(ticket.id, ticket.date) : null;
      const effectivePaidAmount = carryoverPaidAmount ?? Number(ticket.paidAmount);
      const activeLines = ticket.lines
        .filter((line) => line.product.active)
        .sort(
          (a, b) =>
            a.product.displayOrder - b.product.displayOrder ||
            a.product.name.localeCompare(b.product.name)
        );
      return {
        id: ticket.id,
        vendor: { name: ticket.vendor.name, code: ticket.vendor.code },
        date: ticket.date,
        isCarryOver: ticket.date !== targetDate,
        status: ticket.status,
        batteryUnitPrice: Number(ticket.batteryUnitPrice),
        batteryQty: ticket.batteryQty,
        total: Number(ticket.total),
        paidAmount: effectivePaidAmount,
        balance: Number(ticket.balance),
        paymentStatus: ticket.paymentStatus,
        lines: activeLines.map((line) => ({
          productId: line.productId,
          product: { name: line.product.name },
          leftoversPrev: line.leftoversPrev,
          orderQty: line.orderQty,
          leftoversNow: line.leftoversNow,
          unitPriceUsed: Number(line.unitPriceUsed),
        })),
      };
    }

    const settings = await ensureSettings();
    const products = await prisma.product.findMany({
      where: { active: true },
      orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    });

    const ticket = await prisma.ticket.create({
      data: {
        vendorId,
        date: targetDate,
        status: "OPEN",
        batteryMode: settings.batteryMode,
        batteryUnitPrice: settings.batteryUnitPrice,
        batteryQty: settings.batteryQty,
        total: new Prisma.Decimal(0),
        paidAmount: new Prisma.Decimal(0),
        balance: new Prisma.Decimal(0),
        paymentStatus: "CREDIT",
        createdByUserId: session.userId,
        lines: {
          create: await Promise.all(
            products.map(async (product) => {
              const leftoversPrev = await getLeftoversPrev(vendorId, product.id);
              const unitPriceUsed = await getPriceForDate(product.id, targetDate);
              return {
                productId: product.id,
                leftoversPrev,
                orderQty: 0,
                leftoversNow: 0,
                soldQty: 0,
                unitPriceUsed,
                subtotal: new Prisma.Decimal(0),
              };
            })
          ),
        },
      },
      include: { lines: { include: { product: true } }, vendor: true },
    });

    const carryoverPaidAmount = await applyCarryoverCredit(ticket.id, ticket.date);
    const effectivePaidAmount = carryoverPaidAmount ?? Number(ticket.paidAmount);
    const activeLines = ticket.lines
      .filter((line) => line.product.active)
      .sort(
        (a, b) =>
          a.product.displayOrder - b.product.displayOrder ||
          a.product.name.localeCompare(b.product.name)
      );

    return {
      id: ticket.id,
      vendor: { name: ticket.vendor.name, code: ticket.vendor.code },
      date: ticket.date,
      isCarryOver: false,
      status: ticket.status,
      batteryUnitPrice: Number(ticket.batteryUnitPrice),
      batteryQty: ticket.batteryQty,
      total: Number(ticket.total),
      paidAmount: effectivePaidAmount,
      balance: Number(ticket.balance),
      paymentStatus: ticket.paymentStatus,
      lines: activeLines.map((line) => ({
        productId: line.productId,
        product: { name: line.product.name },
        leftoversPrev: line.leftoversPrev,
        orderQty: line.orderQty,
        leftoversNow: line.leftoversNow,
        unitPriceUsed: Number(line.unitPriceUsed),
      })),
    };
  } catch (error) {
    if (error instanceof Prisma.PrismaClientValidationError) {
      const message = error.message.toLowerCase();
      if (
        message.includes("leftoversreported") ||
        message.includes("carryovercredit") ||
        message.includes("carryoverappliedat")
      ) {
        throw new Error("PRISMA_CLIENT_OUTDATED");
      }
    }
    if (error instanceof Prisma.PrismaClientKnownRequestError) {
      if (error.code === "P2022") {
        throw new Error("DB_MIGRATION_REQUIRED");
      }
    }
    throw error;
  }
};

export const updateOrderQty = async (
  ticketId: string,
  productId: string,
  qty: number
) => {
  await requireSession();
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { status: true },
  });
  if (!ticket) throw new Error("NOT_FOUND");
  if (ticket.status !== "OPEN") throw new Error("TICKET_CLOSED");
  const parsed = nonNegativeInt.safeParse(qty);
  if (!parsed.success) throw new Error("INVALID_QTY");
  return prisma.ticketLine.update({
    where: { ticketId_productId: { ticketId, productId } },
    data: { orderQty: parsed.data },
  });
};

export const saveOrder = async (ticketId: string, items: Array<{ productId: string; qty: number }>) => {
  const session = await requireSession();
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { status: true },
  });
  if (!ticket) throw new Error("NOT_FOUND");
  if (ticket.status !== "OPEN") throw new Error("TICKET_CLOSED");
  const parsed = z.array(
    z.object({ productId: z.string().min(1), qty: z.number().int().min(0) })
  ).safeParse(items);
  if (!parsed.success) throw new Error("INVALID_ITEMS");

  await prisma.$transaction(
    parsed.data.map((item) =>
      prisma.ticketLine.update({
        where: { ticketId_productId: { ticketId, productId: item.productId } },
        data: { orderQty: item.qty },
      })
    )
  );

  const hasOrder = parsed.data.some((item) => item.qty > 0);
  if (hasOrder) {
    await logAudit({
      entityType: "Ticket",
      entityId: ticketId,
      action: "ORDER_SAVED",
      details: { itemCount: parsed.data.length },
      userId: session.userId,
    });
  }
  return { ok: true };
};

export const updateLeftoversNow = async (params: {
  ticketId: string;
  productId: string;
  qty: number;
  confirmed?: boolean;
  reason?: string;
}) => {
  const session = await requireSession();
  const parsed = nonNegativeInt.safeParse(params.qty);
  if (!parsed.success) throw new Error("INVALID_QTY");

  const line = await prisma.ticketLine.findUnique({
    where: {
      ticketId_productId: { ticketId: params.ticketId, productId: params.productId },
    },
    include: { ticket: { select: { status: true } } },
  });
  if (!line) throw new Error("NOT_FOUND");
  if (line.ticket.status !== "OPEN") throw new Error("TICKET_CLOSED");

  const max = line.leftoversPrev + line.orderQty;
  if (params.qty > max && !params.confirmed) {
    return { ok: false, needsConfirm: true, max };
  }
  if (params.qty > max && params.confirmed) {
    await logAudit({
      entityType: "TicketLine",
      entityId: line.id,
      action: "LEFTOVERS_ADJUSTED",
      details: { reason: params.reason ?? "sin-motivo", max, qty: params.qty },
      userId: session.userId,
    });
  }

  const soldQty = calcSoldQty(line.orderQty, line.leftoversPrev, params.qty);
  if (soldQty < 0) throw new Error("NEGATIVE_SOLD");
  const subtotal = calcSubtotal(soldQty, Number(line.unitPriceUsed));

  await prisma.ticketLine.update({
    where: { ticketId_productId: { ticketId: params.ticketId, productId: params.productId } },
    data: {
      leftoversNow: params.qty,
      soldQty,
      subtotal: new Prisma.Decimal(subtotal),
    },
  });

  return { ok: true };
};

export const closeTicket = async (params: {
  ticketId: string;
  batteryQty: number;
  paidAmount: number;
}): Promise<
  | { ok: true; total: number; balance: number; paymentStatus: string; alreadyClosed?: true }
  | {
      ok: false;
      reason: "INVALID_BATTERY_QTY" | "NOT_FOUND" | "LEFTOVERS_EXCEED" | "NEGATIVE_SOLD";
    }
> => {
  const session = await requireSession();
  const qtyParsed = nonNegativeInt.safeParse(params.batteryQty);
  if (!qtyParsed.success) return { ok: false, reason: "INVALID_BATTERY_QTY" };

  const now = new Date();

  type CloseTxResult =
    | { kind: "NOT_FOUND" }
    | { kind: "ALREADY_CLOSED"; total: number; balance: number; paymentStatus: string }
    | { kind: "LEFTOVERS_EXCEED" }
    | { kind: "NEGATIVE_SOLD" }
    | { kind: "CLOSED"; total: number; balance: number; paymentStatus: string; paidAmount: number };

  const result = await prisma.$transaction<CloseTxResult>(async (tx) => {
    const ticket = await tx.ticket.findUnique({
      where: { id: params.ticketId },
      include: { lines: true },
    });
    if (!ticket) return { kind: "NOT_FOUND" as const };

    if (ticket.status === "CLOSED") {
      return {
        kind: "ALREADY_CLOSED" as const,
        total: Number(ticket.total),
        balance: Number(ticket.balance),
        paymentStatus: ticket.paymentStatus,
      };
    }

    type DbLine = (typeof ticket.lines)[number];
    type RecalcOk = { ok: true; line: DbLine; soldQty: number; subtotal: number };
    type RecalcErr = { ok: false; reason: "LEFTOVERS_EXCEED" | "NEGATIVE_SOLD" };
    type Recalc = RecalcOk | RecalcErr;

    const recalculated: Recalc[] = ticket.lines.map((line) => {
      const max = line.leftoversPrev + line.orderQty;
      if (line.leftoversNow > max) return { ok: false as const, reason: "LEFTOVERS_EXCEED" as const };
      const soldQty = calcSoldQty(line.orderQty, line.leftoversPrev, line.leftoversNow);
      if (soldQty < 0) return { ok: false as const, reason: "NEGATIVE_SOLD" as const };
      const subtotal = calcSubtotal(soldQty, Number(line.unitPriceUsed));
      return { ok: true as const, line, soldQty, subtotal };
    });

    const invalid = recalculated.find((item): item is RecalcErr => !item.ok);
    if (invalid) {
      return invalid.reason === "LEFTOVERS_EXCEED"
        ? { kind: "LEFTOVERS_EXCEED" as const }
        : { kind: "NEGATIVE_SOLD" as const };
    }

    const valid = recalculated.filter((item): item is RecalcOk => item.ok);

    const batteryTotal = calcBatteryTotal(
      ticket.batteryMode,
      Number(ticket.batteryUnitPrice),
      qtyParsed.data
    );
    const total = sumTotals(
      valid.map((item) => item.subtotal),
      batteryTotal
    );

    const paidAmount = Number(params.paidAmount.toFixed(2));
    const balance = Number(Math.max(0, total - paidAmount).toFixed(2));
    const paymentStatus =
      paidAmount >= total ? "PAID" : paidAmount === 0 ? "CREDIT" : "PARTIAL";

    await Promise.all(
      valid.map((item) =>
        tx.ticketLine.update({
          where: { id: item.line.id },
          data: {
            soldQty: item.soldQty,
            subtotal: new Prisma.Decimal(item.subtotal),
          },
        })
      )
    );

    await tx.ticket.update({
      where: { id: params.ticketId },
      data: {
        status: "CLOSED",
        batteryQty: qtyParsed.data,
        total: new Prisma.Decimal(total),
        paidAmount: new Prisma.Decimal(paidAmount),
        balance: new Prisma.Decimal(balance),
        paymentStatus,
        closedByUserId: session.userId,
        closedAt: now,
      },
    });

    return { kind: "CLOSED" as const, total, balance, paymentStatus, paidAmount };
  });

  if (result.kind === "NOT_FOUND") return { ok: false, reason: "NOT_FOUND" };
  if (result.kind === "LEFTOVERS_EXCEED") return { ok: false, reason: "LEFTOVERS_EXCEED" };
  if (result.kind === "NEGATIVE_SOLD") return { ok: false, reason: "NEGATIVE_SOLD" };

  if (result.kind === "ALREADY_CLOSED") {
    return {
      ok: true,
      alreadyClosed: true,
      total: result.total,
      balance: result.balance,
      paymentStatus: result.paymentStatus,
    };
  }

  await logAudit({
    entityType: "Ticket",
    entityId: params.ticketId,
    action: "CLOSED",
    details: { total: result.total, paymentStatus: result.paymentStatus, paidAmount: result.paidAmount },
    userId: session.userId,
  });

  return { ok: true, total: result.total, balance: result.balance, paymentStatus: result.paymentStatus };
};

export const getTicketSummary = async (ticketId: string) => {
  await requireSession();
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    include: { lines: { include: { product: true } }, vendor: true },
  });
  if (!ticket) return null;
  return {
    id: ticket.id,
    vendor: { name: ticket.vendor.name, code: ticket.vendor.code },
    date: ticket.date,
    status: ticket.status,
    batteryUnitPrice: Number(ticket.batteryUnitPrice),
    batteryQty: ticket.batteryQty,
    total: Number(ticket.total),
    lines: ticket.lines.map((line) => ({
      productId: line.productId,
      product: { name: line.product.name },
      leftoversPrev: line.leftoversPrev,
      orderQty: line.orderQty,
      leftoversNow: line.leftoversNow,
      soldQty: line.soldQty,
      unitPriceUsed: Number(line.unitPriceUsed),
      subtotal: Number(line.subtotal),
    })),
  };
};

export const getVendorHistory = async (vendorId: string) => {
  await requireSession();
  const history = await prisma.ticket.findMany({
    where: { vendorId, status: "CLOSED" },
    orderBy: { date: "desc" },
    take: 3,
    select: {
      id: true,
      date: true,
      total: true,
      paymentStatus: true,
    },
  });
  return history.map((item) => ({
    ...item,
    total: Number(item.total),
  }));
};

export const markTicketPrinted = async (ticketId: string) => {
  const session = await requireSession();
  const printedAt = new Date();

  await prisma.ticket.update({
    where: { id: ticketId },
    data: { printedAt },
  });

  await logAudit({
    entityType: "Ticket",
    entityId: ticketId,
    action: "PRINTED",
    details: { printedAt: printedAt.toISOString() },
    userId: session.userId,
  });
  return { ok: true, printedAt: printedAt.toISOString() };
};

export const reopenTicket = async (ticketId: string) => {
  const session = await requireAdmin();
  const ticket = await prisma.ticket.findUnique({
    where: { id: ticketId },
    select: { status: true },
  });
  if (!ticket) throw new Error("NOT_FOUND");
  if (ticket.status !== "CLOSED") return { ok: true, alreadyOpen: true };

  await prisma.ticket.update({
    where: { id: ticketId },
    data: {
      status: "OPEN",
      paymentStatus: "CREDIT",
      paidAmount: new Prisma.Decimal(0),
      balance: new Prisma.Decimal(0),
      total: new Prisma.Decimal(0),
      closedAt: null,
      closedByUserId: null,
    },
  });

  await logAudit({
    entityType: "Ticket",
    entityId: ticketId,
    action: "REOPENED",
    details: {},
    userId: session.userId,
  });

  return { ok: true };
};
