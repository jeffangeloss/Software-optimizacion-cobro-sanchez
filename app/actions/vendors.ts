"use server";

import { prisma } from "@/lib/prisma";
import { requireAdmin, requireSession } from "@/lib/auth";
import { z } from "zod";

const vendorSchema = z.object({
  name: z.string().min(2),
  code: z.string().min(2),
  active: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
});

const createVendorSchema = z.object({
  name: z.string().min(2),
  code: z.preprocess(
    (value) => (typeof value === "string" && value.trim() === "" ? undefined : value),
    z.string().min(2).optional()
  ),
  active: z.boolean().optional(),
  isFavorite: z.boolean().optional(),
});

const normalizeCode = (code?: string) => code?.trim().toUpperCase() ?? "";

const generateVendorCode = async () => {
  const vendors = await prisma.vendor.findMany({ select: { code: true } });
  const existing = new Set(vendors.map((vendor) => vendor.code.toUpperCase()));
  const max = vendors.reduce((acc, vendor) => {
    const match = /^V(\d+)$/i.exec(vendor.code.trim());
    if (!match) return acc;
    const value = Number.parseInt(match[1], 10);
    return Number.isFinite(value) ? Math.max(acc, value) : acc;
  }, 0);

  let next = max + 1;
  let code = `V${String(next).padStart(3, "0")}`;
  while (existing.has(code)) {
    next += 1;
    code = `V${String(next).padStart(3, "0")}`;
  }
  return code;
};

export const listVendors = async () => {
  await requireSession();
  const vendors = await prisma.vendor.findMany({
    where: { active: true },
    orderBy: [{ isFavorite: "desc" }, { name: "asc" }],
  });
  return vendors.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    code: vendor.code,
    active: vendor.active,
    isFavorite: vendor.isFavorite,
  }));
};

export const searchVendors = async (query: string) => {
  await requireSession();
  const vendors = await prisma.vendor.findMany({
    where: {
      active: true,
      OR: [
        { name: { contains: query } },
        { code: { contains: query } },
      ],
    },
    orderBy: [{ isFavorite: "desc" }, { name: "asc" }],
  });
  return vendors.map((vendor) => ({
    id: vendor.id,
    name: vendor.name,
    code: vendor.code,
    active: vendor.active,
    isFavorite: vendor.isFavorite,
  }));
};

export const createVendor = async (data: z.infer<typeof createVendorSchema>) => {
  await requireAdmin();
  const parsed = createVendorSchema.safeParse(data);
  if (!parsed.success) throw new Error("INVALID");
  const { code: rawCode, ...rest } = parsed.data;
  const normalized = normalizeCode(rawCode);
  const code = normalized || (await generateVendorCode());
  const vendor = await prisma.vendor.create({ data: { ...rest, code } });
  return {
    id: vendor.id,
    name: vendor.name,
    code: vendor.code,
    active: vendor.active,
    isFavorite: vendor.isFavorite,
  };
};

export const updateVendor = async (
  id: string,
  data: Partial<z.infer<typeof vendorSchema>>
) => {
  await requireAdmin();
  const vendor = await prisma.vendor.update({ where: { id }, data });
  return {
    id: vendor.id,
    name: vendor.name,
    code: vendor.code,
    active: vendor.active,
    isFavorite: vendor.isFavorite,
  };
};

export const toggleVendorFavorite = async (id: string, isFavorite: boolean) => {
  await requireAdmin();
  const vendor = await prisma.vendor.update({ where: { id }, data: { isFavorite } });
  return {
    id: vendor.id,
    name: vendor.name,
    code: vendor.code,
    active: vendor.active,
    isFavorite: vendor.isFavorite,
  };
};
