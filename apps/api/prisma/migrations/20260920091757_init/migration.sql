-- CreateEnum
CREATE TYPE "VerificationPurpose" AS ENUM ('EMAIL_VERIFICATION', 'PASSWORD_RESET');

-- CreateEnum
CREATE TYPE "ClassroomStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "ClassSessionStatus" AS ENUM ('SCHEDULED', 'LIVE', 'ENDED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "EnrollmentStatus" AS ENUM ('PENDING_PAYMENT', 'ACTIVE', 'CANCELLED', 'REFUNDED');

-- CreateEnum
CREATE TYPE "InvitationStatus" AS ENUM ('SENT', 'ACCEPTED', 'EXPIRED', 'REVOKED');

-- CreateEnum
CREATE TYPE "PaymentProvider" AS ENUM ('MTN_MOMO', 'AIRTEL_MONEY', 'FAKE');

-- CreateEnum
CREATE TYPE "PaymentPurpose" AS ENUM ('CLASS_ENROLLMENT', 'RECORDING_ACCESS');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('INITIATED', 'PENDING', 'SUCCESSFUL', 'FAILED', 'TIMEOUT');

-- CreateEnum
CREATE TYPE "PaymentEventSource" AS ENUM ('CALLBACK', 'POLL', 'MANUAL');

-- CreateEnum
CREATE TYPE "ParticipantRole" AS ENUM ('HOST', 'CO_HOST', 'STUDENT');

-- CreateEnum
CREATE TYPE "RecordingStatus" AS ENUM ('STARTING', 'ACTIVE', 'COMPLETE', 'FAILED');

-- CreateEnum
CREATE TYPE "AccessGrant" AS ENUM ('ENROLLMENT', 'PURCHASE');

-- CreateTable
CREATE TABLE "User" (
    "id" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "phoneE164" TEXT,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "replacedById" UUID,
    "userAgent" TEXT,
    "ip" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationToken" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "VerificationPurpose" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "consumedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Classroom" (
    "id" UUID NOT NULL,
    "hostId" UUID NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priceMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZMW',
    "capacity" INTEGER NOT NULL DEFAULT 100,
    "coverImageUrl" TEXT,
    "status" "ClassroomStatus" NOT NULL DEFAULT 'DRAFT',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Classroom_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassSession" (
    "id" UUID NOT NULL,
    "classroomId" UUID NOT NULL,
    "title" TEXT,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,
    "status" "ClassSessionStatus" NOT NULL DEFAULT 'SCHEDULED',
    "livekitRoom" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "endedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ClassSession_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Enrollment" (
    "id" UUID NOT NULL,
    "classroomId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "status" "EnrollmentStatus" NOT NULL DEFAULT 'PENDING_PAYMENT',
    "activatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Enrollment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" UUID NOT NULL,
    "classroomId" UUID NOT NULL,
    "email" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "invitedById" UUID NOT NULL,
    "status" "InvitationStatus" NOT NULL DEFAULT 'SENT',
    "comp" BOOLEAN NOT NULL DEFAULT false,
    "message" TEXT,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Payment" (
    "id" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "purpose" "PaymentPurpose" NOT NULL,
    "classroomId" UUID,
    "recordingId" UUID,
    "amountMinor" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'ZMW',
    "provider" "PaymentProvider" NOT NULL,
    "status" "PaymentStatus" NOT NULL DEFAULT 'INITIATED',
    "providerRef" TEXT,
    "externalId" TEXT NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "payerMsisdn" TEXT NOT NULL,
    "failureReason" TEXT,
    "settledAt" TIMESTAMP(3),
    "pollAttempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Payment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PaymentEvent" (
    "id" UUID NOT NULL,
    "paymentId" UUID NOT NULL,
    "source" "PaymentEventSource" NOT NULL,
    "outcome" TEXT NOT NULL,
    "fromStatus" "PaymentStatus",
    "toStatus" "PaymentStatus",
    "payload" JSONB NOT NULL,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ClassParticipant" (
    "id" UUID NOT NULL,
    "classSessionId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "identity" TEXT NOT NULL,
    "role" "ParticipantRole" NOT NULL DEFAULT 'STUDENT',
    "canPublish" BOOLEAN NOT NULL DEFAULT false,
    "handRaisedAt" TIMESTAMP(3),
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),

    CONSTRAINT "ClassParticipant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Recording" (
    "id" UUID NOT NULL,
    "classSessionId" UUID NOT NULL,
    "egressId" TEXT,
    "status" "RecordingStatus" NOT NULL DEFAULT 'STARTING',
    "storageKey" TEXT,
    "durationSec" INTEGER,
    "sizeBytes" BIGINT,
    "priceMinor" INTEGER,
    "currency" TEXT NOT NULL DEFAULT 'ZMW',
    "failureReason" TEXT,
    "recordedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),

    CONSTRAINT "Recording_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RecordingAccess" (
    "id" UUID NOT NULL,
    "recordingId" UUID NOT NULL,
    "userId" UUID NOT NULL,
    "grantedVia" "AccessGrant" NOT NULL,
    "paymentId" UUID,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RecordingAccess_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE INDEX "User_email_idx" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationToken_tokenHash_key" ON "VerificationToken"("tokenHash");

-- CreateIndex
CREATE INDEX "VerificationToken_userId_purpose_idx" ON "VerificationToken"("userId", "purpose");

-- CreateIndex
CREATE INDEX "Classroom_hostId_idx" ON "Classroom"("hostId");

-- CreateIndex
CREATE INDEX "Classroom_status_createdAt_idx" ON "Classroom"("status", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "ClassSession_livekitRoom_key" ON "ClassSession"("livekitRoom");

-- CreateIndex
CREATE INDEX "ClassSession_classroomId_startsAt_idx" ON "ClassSession"("classroomId", "startsAt");

-- CreateIndex
CREATE INDEX "ClassSession_status_startsAt_idx" ON "ClassSession"("status", "startsAt");

-- CreateIndex
CREATE INDEX "Enrollment_userId_status_idx" ON "Enrollment"("userId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "Enrollment_classroomId_userId_key" ON "Enrollment"("classroomId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tokenHash_key" ON "Invitation"("tokenHash");

-- CreateIndex
CREATE INDEX "Invitation_email_status_idx" ON "Invitation"("email", "status");

-- CreateIndex
CREATE INDEX "Invitation_expiresAt_idx" ON "Invitation"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_classroomId_email_key" ON "Invitation"("classroomId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_providerRef_key" ON "Payment"("providerRef");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_externalId_key" ON "Payment"("externalId");

-- CreateIndex
CREATE UNIQUE INDEX "Payment_idempotencyKey_key" ON "Payment"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Payment_userId_createdAt_idx" ON "Payment"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_status_createdAt_idx" ON "Payment"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Payment_classroomId_idx" ON "Payment"("classroomId");

-- CreateIndex
CREATE INDEX "PaymentEvent_paymentId_receivedAt_idx" ON "PaymentEvent"("paymentId", "receivedAt");

-- CreateIndex
CREATE INDEX "ClassParticipant_classSessionId_role_idx" ON "ClassParticipant"("classSessionId", "role");

-- CreateIndex
CREATE UNIQUE INDEX "ClassParticipant_classSessionId_userId_key" ON "ClassParticipant"("classSessionId", "userId");

-- CreateIndex
CREATE UNIQUE INDEX "Recording_classSessionId_key" ON "Recording"("classSessionId");

-- CreateIndex
CREATE UNIQUE INDEX "Recording_egressId_key" ON "Recording"("egressId");

-- CreateIndex
CREATE INDEX "Recording_status_idx" ON "Recording"("status");

-- CreateIndex
CREATE INDEX "RecordingAccess_userId_idx" ON "RecordingAccess"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "RecordingAccess_recordingId_userId_key" ON "RecordingAccess"("recordingId", "userId");

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationToken" ADD CONSTRAINT "VerificationToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Classroom" ADD CONSTRAINT "Classroom_hostId_fkey" FOREIGN KEY ("hostId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassSession" ADD CONSTRAINT "ClassSession_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Enrollment" ADD CONSTRAINT "Enrollment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_invitedById_fkey" FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_classroomId_fkey" FOREIGN KEY ("classroomId") REFERENCES "Classroom"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Payment" ADD CONSTRAINT "Payment_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PaymentEvent" ADD CONSTRAINT "PaymentEvent_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassParticipant" ADD CONSTRAINT "ClassParticipant_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ClassParticipant" ADD CONSTRAINT "ClassParticipant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Recording" ADD CONSTRAINT "Recording_classSessionId_fkey" FOREIGN KEY ("classSessionId") REFERENCES "ClassSession"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingAccess" ADD CONSTRAINT "RecordingAccess_recordingId_fkey" FOREIGN KEY ("recordingId") REFERENCES "Recording"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingAccess" ADD CONSTRAINT "RecordingAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RecordingAccess" ADD CONSTRAINT "RecordingAccess_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Invariants Prisma cannot express in schema.prisma, enforced by Postgres so
-- they hold regardless of which code path writes the row.
-- ---------------------------------------------------------------------------

-- A payment buys exactly one thing, and the target matches the stated purpose.
-- This is what stops a CLASS_ENROLLMENT payment from silently carrying a
-- recordingId, or a payment from pointing at both or neither.
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_target_matches_purpose" CHECK (
    (purpose = 'CLASS_ENROLLMENT' AND "classroomId" IS NOT NULL AND "recordingId" IS NULL)
    OR
    (purpose = 'RECORDING_ACCESS' AND "recordingId" IS NOT NULL AND "classroomId" IS NULL)
  );

-- Never send a zero or negative collection request to an operator.
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_amount_positive" CHECK ("amountMinor" > 0);

-- A settled payment must carry its settlement time, and an unsettled one
-- must not: `settledAt IS NOT NULL` is therefore a safe proxy for "terminal".
ALTER TABLE "Payment"
  ADD CONSTRAINT "Payment_settled_at_matches_status" CHECK (
    (status IN ('SUCCESSFUL', 'FAILED', 'TIMEOUT') AND "settledAt" IS NOT NULL)
    OR
    (status IN ('INITIATED', 'PENDING') AND "settledAt" IS NULL)
  );

-- Free classes are allowed; negative prices are not.
ALTER TABLE "Classroom"
  ADD CONSTRAINT "Classroom_price_non_negative" CHECK ("priceMinor" >= 0);

ALTER TABLE "Classroom"
  ADD CONSTRAINT "Classroom_capacity_positive" CHECK (capacity > 0);

-- A replay is either not for sale (NULL) or priced at zero or above.
ALTER TABLE "Recording"
  ADD CONSTRAINT "Recording_price_non_negative" CHECK ("priceMinor" IS NULL OR "priceMinor" >= 0);

-- A session cannot end before it starts.
ALTER TABLE "ClassSession"
  ADD CONSTRAINT "ClassSession_ends_after_starts" CHECK ("endsAt" > "startsAt");
