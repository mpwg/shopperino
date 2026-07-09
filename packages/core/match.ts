import { dateDeltaDays, type IsoDate } from "./date.ts";

export type MatchStatus = "suggested" | "confirmed" | "rejected" | "manual" | "superseded";
export type MatchType = "exact" | "partial" | "split" | "refund" | "manual";
export type MatchActor = "system" | "user";

export type TransactionOrderMatch = {
  id: string;
  bankTransactionId: string;
  orderId: string;
  orderPaymentId?: string;
  status: MatchStatus;
  matchType: MatchType;
  confidenceScore: number;
  amountDeltaMinor: number;
  dateDeltaDays?: number;
  reason: string;
  rules: Record<string, unknown>;
  createdBy: MatchActor;
  createdAt: string;
  confirmedAt?: string;
  rejectedAt?: string;
};

export type CreateSuggestedMatchInput = {
  id: string;
  bankTransactionId: string;
  orderId: string;
  orderPaymentId?: string;
  confidenceScore: number;
  amountDeltaMinor: number;
  bankBookingDate?: IsoDate;
  orderDate?: IsoDate;
  reason: string;
  rules?: Record<string, unknown>;
  createdAt?: string;
};

export function createSuggestedMatch(input: CreateSuggestedMatchInput): TransactionOrderMatch {
  return {
    id: requireNonBlank(input.id, "id"),
    bankTransactionId: requireNonBlank(input.bankTransactionId, "bankTransactionId"),
    orderId: requireNonBlank(input.orderId, "orderId"),
    orderPaymentId: optionalTrimmed(input.orderPaymentId),
    status: "suggested",
    matchType: input.amountDeltaMinor === 0 ? "exact" : "partial",
    confidenceScore: requireConfidence(input.confidenceScore),
    amountDeltaMinor: input.amountDeltaMinor,
    dateDeltaDays:
      input.bankBookingDate && input.orderDate ? dateDeltaDays(input.bankBookingDate, input.orderDate) : undefined,
    reason: requireNonBlank(input.reason, "reason"),
    rules: input.rules ?? {},
    createdBy: "system",
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

export function confirmMatch(match: TransactionOrderMatch, confirmedAt?: string): TransactionOrderMatch {
  if (match.status === "rejected") {
    throw new Error("Rejected matches cannot be confirmed");
  }

  return {
    ...match,
    status: match.createdBy === "user" ? "manual" : "confirmed",
    confirmedAt: confirmedAt ?? new Date().toISOString(),
  };
}

export function rejectMatch(match: TransactionOrderMatch, rejectedAt?: string): TransactionOrderMatch {
  if (match.status === "confirmed" || match.status === "manual") {
    throw new Error("Confirmed or manual matches cannot be rejected");
  }

  return {
    ...match,
    status: "rejected",
    rejectedAt: rejectedAt ?? new Date().toISOString(),
  };
}

export function createManualMatch(input: Omit<CreateSuggestedMatchInput, "confidenceScore" | "rules">): TransactionOrderMatch {
  const now = input.createdAt ?? new Date().toISOString();

  return {
    ...createSuggestedMatch({
      ...input,
      confidenceScore: 1,
      rules: { manual: true },
      createdAt: now,
    }),
    status: "manual",
    matchType: "manual",
    createdBy: "user",
    confirmedAt: now,
  };
}

function requireConfidence(value: number): number {
  if (!Number.isFinite(value) || value < 0 || value > 1) {
    throw new Error("confidenceScore must be between 0 and 1");
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
