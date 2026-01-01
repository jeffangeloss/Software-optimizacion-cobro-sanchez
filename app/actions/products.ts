"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSession } from "@/lib/auth";
import { z } from "zod";

const productSchema = z.object({
  name: z.string().min(2),
  active: z.boolean().optional(),
});

export const listProducts = async () => {
  await requireSession();
  const products = await prisma.product.findMany({
    where: { active: true },
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
  });
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    active: product.active,
  }));
};

export const listProductsWithPrices = async () => {
  await requireSession();
  const products = await prisma.product.findMany({
    orderBy: [{ displayOrder: "asc" }, { name: "asc" }],
    include: {
      prices: {
        orderBy: { validFrom: "desc" },
        take: 1,
      },
    },
  });
  return products.map((product) => ({
    id: product.id,
    name: product.name,
    active: product.active,
    currentPrice: product.prices[0]?.price ? Number(product.prices[0].price) : null,
  }));
};

export const createProduct = async (data: z.infer<typeof productSchema>) => {
  await requireAdmin();
  const parsed = productSchema.safeParse(data);
  if (!parsed.success) throw new Error("INVALID");
  const last = await prisma.product.findFirst({
    orderBy: { displayOrder: "desc" },
    select: { displayOrder: true },
  });
  const nextOrder = (last?.displayOrder ?? 0) + 1;
  const product = await prisma.product.create({
    data: { ...parsed.data, displayOrder: nextOrder },
  });
  return { id: product.id, name: product.name, active: product.active };
};

export const updateProduct = async (
  id: string,
  data: Partial<z.infer<typeof productSchema>>
) => {
  await requireAdmin();
  const product = await prisma.product.update({ where: { id }, data });
  return { id: product.id, name: product.name, active: product.active };
};
