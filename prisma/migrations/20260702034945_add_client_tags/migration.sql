-- CreateTable
CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "color" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClientTag" (
    "id" TEXT NOT NULL,
    "clientId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ClientTag_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

-- CreateIndex
CREATE INDEX "ClientTag_clientId_idx" ON "ClientTag"("clientId");

-- CreateIndex
CREATE INDEX "ClientTag_tagId_idx" ON "ClientTag"("tagId");

-- CreateIndex
CREATE UNIQUE INDEX "ClientTag_clientId_tagId_key" ON "ClientTag"("clientId", "tagId");

-- AddForeignKey
ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_clientId_fkey" FOREIGN KEY ("clientId") REFERENCES "Client"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClientTag" ADD CONSTRAINT "ClientTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;
