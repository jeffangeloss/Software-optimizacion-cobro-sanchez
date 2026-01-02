-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Ticket" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "vendorId" TEXT NOT NULL,
    "date" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "batteryMode" TEXT NOT NULL DEFAULT 'PER_DAY',
    "batteryUnitPrice" DECIMAL NOT NULL,
    "batteryQty" INTEGER NOT NULL DEFAULT 1,
    "total" DECIMAL NOT NULL DEFAULT 0,
    "paidAmount" DECIMAL NOT NULL DEFAULT 0,
    "balance" DECIMAL NOT NULL DEFAULT 0,
    "paymentStatus" TEXT NOT NULL DEFAULT 'CREDIT',
    "leftoversReported" BOOLEAN NOT NULL DEFAULT true,
    "carryoverCredit" DECIMAL NOT NULL DEFAULT 0,
    "carryoverAppliedAt" DATETIME,
    "createdByUserId" TEXT NOT NULL,
    "closedByUserId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "closedAt" DATETIME,
    "printedAt" DATETIME,
    CONSTRAINT "Ticket_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "Vendor" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "Ticket_closedByUserId_fkey" FOREIGN KEY ("closedByUserId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Ticket" ("balance", "batteryMode", "batteryQty", "batteryUnitPrice", "closedAt", "closedByUserId", "createdAt", "createdByUserId", "date", "id", "paidAmount", "paymentStatus", "printedAt", "status", "total", "vendorId") SELECT "balance", "batteryMode", "batteryQty", "batteryUnitPrice", "closedAt", "closedByUserId", "createdAt", "createdByUserId", "date", "id", "paidAmount", "paymentStatus", "printedAt", "status", "total", "vendorId" FROM "Ticket";
DROP TABLE "Ticket";
ALTER TABLE "new_Ticket" RENAME TO "Ticket";
CREATE UNIQUE INDEX "Ticket_vendorId_date_key" ON "Ticket"("vendorId", "date");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
