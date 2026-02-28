-- CreateTable
CREATE TABLE "Recipient" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT,
    "phone" TEXT,
    "addressLine1" TEXT NOT NULL,
    "addressLine2" TEXT,
    "city" TEXT NOT NULL,
    "province" TEXT,
    "postalCode" TEXT NOT NULL,
    "countryCode" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SplitPlan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "orderId" TEXT,
    "cartToken" TEXT,
    "sourceLineGid" TEXT NOT NULL,
    "lineQuantity" INTEGER NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "SplitAllocation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "splitPlanId" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SplitAllocation_splitPlanId_fkey" FOREIGN KEY ("splitPlanId") REFERENCES "SplitPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "SplitAllocation_recipientId_fkey" FOREIGN KEY ("recipientId") REFERENCES "Recipient" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "SplitAuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "splitPlanId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "payloadJson" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SplitAuditEvent_splitPlanId_fkey" FOREIGN KEY ("splitPlanId") REFERENCES "SplitPlan" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Recipient_shop_idx" ON "Recipient"("shop");

-- CreateIndex
CREATE INDEX "SplitPlan_shop_status_idx" ON "SplitPlan"("shop", "status");

-- CreateIndex
CREATE INDEX "SplitPlan_orderId_idx" ON "SplitPlan"("orderId");

-- CreateIndex
CREATE INDEX "SplitPlan_cartToken_idx" ON "SplitPlan"("cartToken");

-- CreateIndex
CREATE INDEX "SplitAllocation_splitPlanId_idx" ON "SplitAllocation"("splitPlanId");

-- CreateIndex
CREATE INDEX "SplitAllocation_recipientId_idx" ON "SplitAllocation"("recipientId");

-- CreateIndex
CREATE INDEX "SplitAuditEvent_splitPlanId_eventType_idx" ON "SplitAuditEvent"("splitPlanId", "eventType");
