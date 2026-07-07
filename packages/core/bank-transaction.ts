import { requireIsoDate, type IsoDate } from "./date.ts";
import { stableFingerprint } from "./fingerprint.ts";
import { createMoney, requirePositiveMoney, type Money } from "./money.ts";

export type TransactionDirection = "debit" | "credit";

export type BankTransaction = {
  id: string;
  bankAccountId: string;
  importRunId: string;
  rawRecordId?: string;
  externalTransactionId?: string;
  bookingDate: IsoDate;
  valueDate?: IsoDate;
  amount: Money;
  direction: TransactionDirection;
  counterpartyName?: string;
  description: string;
  reference?: string;
  merchantHint?: string;
  fingerprint: string;
  createdAt: string;
  updatedAt: string;
};

export type CreateBankTransactionInput = {
  id: string;
  bankAccountId: string;
  importRunId: string;
  rawRecordId?: string;
  externalTransactionId?: string;
  bookingDate: string;
  valueDate?: string;
  amountMinor: number;
  currency: string;
  direction: TransactionDirection;
  counterpartyName?: string;
  description: string;
  reference?: string;
  merchantHint?: string;
  createdAt?: string;
  updatedAt?: string;
};

export function createBankTransaction(input: CreateBankTransactionInput): BankTransaction {
  const direction = requireDirection(input.direction);
  const description = requireNonBlank(input.description, "description");
  const amount = requirePositiveMoney(createMoney(input.amountMinor, input.currency));
  const bookingDate = requireIsoDate(input.bookingDate, "bookingDate");
  const valueDate = input.valueDate ? requireIsoDate(input.valueDate, "valueDate") : undefined;
  const now = new Date().toISOString();

  return {
    id: requireNonBlank(input.id, "id"),
    bankAccountId: requireNonBlank(input.bankAccountId, "bankAccountId"),
    importRunId: requireNonBlank(input.importRunId, "importRunId"),
    rawRecordId: optionalTrimmed(input.rawRecordId),
    externalTransactionId: optionalTrimmed(input.externalTransactionId),
    bookingDate,
    valueDate,
    amount,
    direction,
    counterpartyName: optionalTrimmed(input.counterpartyName),
    description,
    reference: optionalTrimmed(input.reference),
    merchantHint: optionalTrimmed(input.merchantHint),
    fingerprint: stableFingerprint({
      bankAccountId: input.bankAccountId,
      externalTransactionId: input.externalTransactionId,
      bookingDate,
      valueDate,
      amountMinor: amount.amountMinor,
      currency: amount.currency,
      direction,
      counterpartyName: input.counterpartyName,
      description,
      reference: input.reference,
    }),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

function requireDirection(value: string): TransactionDirection {
  if (value !== "debit" && value !== "credit") {
    throw new Error("direction must be debit or credit");
  }

  return value;
}

function requireNonBlank(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} must not be blank`);
  }

  return trimmed;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
