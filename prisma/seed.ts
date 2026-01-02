import { PrismaBetterSqlite3 } from "@prisma/adapter-better-sqlite3";
import { PrismaClient, Prisma } from "@prisma/client";
import bcrypt from "bcryptjs";

const databaseUrl = process.env.DATABASE_URL ?? "file:./dev.db";
const prisma = new PrismaClient({
  adapter: new PrismaBetterSqlite3({ url: databaseUrl }),
});

const todayIso = () => new Date().toISOString().slice(0, 10);

async function main() {
  const date = todayIso();

  await prisma.settings.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      batteryMode: "PER_DAY",
      batteryUnitPrice: new Prisma.Decimal("3.00"),
      batteryQty: 1,
    },
  });

  const adminPin = await bcrypt.hash("1414", 10);
  const operatorPin = await bcrypt.hash("0000", 10);

  await prisma.user.upsert({
    where: { name: "Jeff" },
    update: { pinHash: adminPin, role: "ADMIN" },
    create: { name: "Jeff", role: "ADMIN", pinHash: adminPin },
  });

  await prisma.user.upsert({
    where: { name: "Papa/Mama" },
    update: { pinHash: operatorPin, role: "OPERADOR" },
    create: { name: "Papa/Mama", role: "OPERADOR", pinHash: operatorPin },
  });

  const catalog: Array<{ name: string; price: number }> = [
    { name: "BUEN HUMOR", price: 1.0 },
    { name: "CHOCO KIDS", price: 1.5 },
    { name: "MINI JET", price: 1.2 },
    { name: "MINI SUBLIME", price: 1.2 },
    { name: "TRIKA", price: 1.2 },
    { name: "BB", price: 0.9 },
    { name: "TURBO MAX", price: 0.9 },
    { name: "STRANGER", price: 4.1 },
    { name: "ALASKA", price: 2.0 },
    { name: "ALASKA MOUSE", price: 2.3 },
    { name: "ZOORPRESA", price: 2.1 },
    { name: "JET", price: 2.0 },
    { name: "FRIO RICO", price: 4.0 },
    { name: "CHOCO D'", price: 3.2 },
    { name: "BOM BOM", price: 4.0 },
    { name: "FRIO PALETA", price: 4.0 },
    { name: "KIT KAT", price: 4.0 },
    { name: "SUBLIME", price: 2.8 },
    { name: "NESCAFE", price: 4.0 },
    { name: "VASO KBANA", price: 2.0 },
    { name: "COPA DONOF", price: 4.0 },
    { name: "SIN PARAR", price: 4.0 },
    { name: "HIELO CREMA", price: 0.7 },
    { name: "VASO V.", price: 1.2 },
    { name: "ENVASE X 5L", price: 28.0 },
    { name: "PINOCHO", price: 0.05 },
    { name: "GEMELO", price: 0.15 },
    { name: "BARQUIMIEL", price: 0.15 },
    { name: "ZAMBITO", price: 1.0 },
  ];

  const catalogNames = catalog.map((item) => item.name);
  await prisma.product.updateMany({
    where: { name: { notIn: catalogNames } },
    data: { active: false, displayOrder: 0 },
  });

  await Promise.all(
    catalog.map(async (item, index) => {
      const product = await prisma.product.upsert({
        where: { name: item.name },
        update: { active: true, displayOrder: index + 1 },
        create: { name: item.name, active: true, displayOrder: index + 1 },
      });

      await prisma.priceHistory.upsert({
        where: { productId_validFrom: { productId: product.id, validFrom: date } },
        update: { price: new Prisma.Decimal(item.price.toFixed(2)) },
        create: {
          productId: product.id,
          price: new Prisma.Decimal(item.price.toFixed(2)),
          validFrom: date,
        },
      });

      return product;
    })
  );

  const vendors = [
    { code: "V001", name: "AMBROSIO", isFavorite: true },
    { code: "V002", name: "MODESTO", isFavorite: true },
    { code: "V003", name: "CHATE", isFavorite: true },
  ];

  const vendorCodes = vendors.map((vendor) => vendor.code);
  await prisma.vendor.updateMany({
    where: { code: { notIn: vendorCodes } },
    data: { active: false, isFavorite: false },
  });

  await Promise.all(
    vendors.map((vendor) =>
      prisma.vendor.upsert({
        where: { code: vendor.code },
        update: {
          name: vendor.name,
          active: true,
          isFavorite: vendor.isFavorite,
        },
        create: vendor,
      })
    )
  );
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
