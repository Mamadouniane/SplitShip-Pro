-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_SplitPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT,
    "cartToken" TEXT,
    "sourceLineGid" TEXT NOT NULL,
    "lineQuantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "deliveryStatus" TEXT NOT NULL DEFAULT 'pending',
    "deliveryAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastDeliveryError" TEXT,
    "lastDeliveryAt" DATETIME,
    "idempotencyKey" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_SplitPlan" ("cartToken", "createdAt", "id", "lineQuantity", "orderId", "shop", "sourceLineGid", "status", "updatedAt") SELECT "cartToken", "createdAt", "id", "lineQuantity", "orderId", "shop", "sourceLineGid", "status", "updatedAt" FROM "SplitPlan";
DROP TABLE "SplitPlan";
ALTER TABLE "new_SplitPlan" RENAME TO "SplitPlan";
CREATE INDEX "SplitPlan_shop_status_idx" ON "SplitPlan"("shop", "status");
CREATE INDEX "SplitPlan_shop_deliveryStatus_idx" ON "SplitPlan"("shop", "deliveryStatus");
CREATE INDEX "SplitPlan_orderId_idx" ON "SplitPlan"("orderId");
CREATE INDEX "SplitPlan_cartToken_idx" ON "SplitPlan"("cartToken");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
