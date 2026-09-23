-- CreateEnum
CREATE TYPE "OrganisationType" AS ENUM ('BUSINESS', 'SCHOOL');

-- CreateEnum
CREATE TYPE "OrganisationRole" AS ENUM ('ADMIN', 'MEMBER');

-- AlterTable
ALTER TABLE "Classroom" ADD COLUMN     "subCourseId" UUID;

-- CreateTable
CREATE TABLE "Organisation" (
    "id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "type" "OrganisationType" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Organisation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OrganisationMembership" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "role" "OrganisationRole" NOT NULL DEFAULT 'MEMBER',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "OrganisationMembership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubCourse" (
    "id" UUID NOT NULL,
    "organisationId" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SubCourse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Organisation_type_idx" ON "Organisation"("type");

-- CreateIndex
CREATE INDEX "OrganisationMembership_userId_idx" ON "OrganisationMembership"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "OrganisationMembership_organisationId_userId_key" ON "OrganisationMembership"("organisationId", "userId");

-- CreateIndex
CREATE INDEX "SubCourse_organisationId_idx" ON "SubCourse"("organisationId");

-- CreateIndex
CREATE INDEX "Classroom_subCourseId_idx" ON "Classroom"("subCourseId");

-- AddForeignKey
ALTER TABLE "OrganisationMembership" ADD CONSTRAINT "OrganisationMembership_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OrganisationMembership" ADD CONSTRAINT "OrganisationMembership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SubCourse" ADD CONSTRAINT "SubCourse_organisationId_fkey" FOREIGN KEY ("organisationId") REFERENCES "Organisation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_subCourseId_fkey" FOREIGN KEY ("subCourseId") REFERENCES "SubCourse"("id") ON DELETE SET NULL ON UPDATE CASCADE;
