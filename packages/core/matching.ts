import { randomUUID } from "node:crypto";
import { dateDeltaDays } from "./date.ts";
import type { BankTransaction } from "./bank-transaction.ts";
import { createSuggestedMatch, type TransactionOrderMatch } from "./match.ts";
import type { Order, OrderPayment } from "./order.ts";

export type MatchCandidateConfig = {
  dateWindowDays: number;
};

type ComparablePayment = {
  amountMinor: number;
  date: string;
  orderPayment?: OrderPayment;
  scope: "order_payment" | "order_total";
  paymentMethodHint?: string;
};

export function suggestMatchForPair(
  transaction: BankTransaction,
  order: Order,
  config: MatchCandidateConfig,
): TransactionOrderMatch | null {
  if (transaction.direction !== "debit") {
    return null;
  }

  if (transaction.amount.currency !== order.totalAmount.currency) {
    return null;
  }

  const comparable = findBestComparablePayment(transaction, order);
  const amountDeltaMinor = Math.abs(transaction.amount.amountMinor - comparable.amountMinor);
  const closeEnoughDate = Math.abs(dateDeltaDays(transaction.bookingDate, comparable.date)) <= config.dateWindowDays;
  const hasMerchantHint = hasAmazonHint(transaction);
  const hasCreditCardHint = isCreditCardHint(comparable.paymentMethodHint ?? order.paymentMethodHint);
  const isExactAmount = amountDeltaMinor === 0;
  const isCreditCardPartial =
    hasCreditCardHint &&
    transaction.amount.amountMinor > comparable.amountMinor &&
    closeEnoughDate;

  if ((!isExactAmount && !isCreditCardPartial) || !closeEnoughDate) {
    return null;
  }

  const confidenceScore = scoreCandidate({
    isExactAmount,
    hasMerchantHint,
    hasCreditCardHint,
    scope: comparable.scope,
  });

  return createSuggestedMatch({
    id: randomUUID(),
    bankTransactionId: transaction.id,
    orderId: order.id,
    orderPaymentId: comparable.orderPayment?.id,
    confidenceScore,
    amountDeltaMinor,
    bankBookingDate: transaction.bookingDate,
    orderDate: comparable.date,
    reason: buildReason({ isExactAmount, hasMerchantHint, hasCreditCardHint, scope: comparable.scope }),
    rules: {
      amount: isExactAmount ? "exact" : "contained_in_larger_card_charge",
      currency: "exact",
      dateWindowDays: config.dateWindowDays,
      merchantHint: hasMerchantHint,
      paymentMethodHint: comparable.paymentMethodHint,
      scope: comparable.scope,
    },
  });
}

function findBestComparablePayment(transaction: BankTransaction, order: Order): ComparablePayment {
  const candidates: ComparablePayment[] = [
    ...order.payments
      .filter((payment) => payment.amount.currency === transaction.amount.currency)
      .map((payment) => ({
        amountMinor: payment.amount.amountMinor,
        date: payment.paymentDate ?? order.shipmentDate ?? order.orderDate,
        orderPayment: payment,
        scope: "order_payment" as const,
        paymentMethodHint: payment.paymentMethodHint ?? order.paymentMethodHint,
      })),
    {
      amountMinor: order.totalAmount.amountMinor,
      date: order.shipmentDate ?? order.orderDate,
      scope: "order_total" as const,
      paymentMethodHint: order.paymentMethodHint,
    },
  ];

  return candidates
    .sort((left, right) => compareCandidates(transaction, left, right))
    [0];
}

function compareCandidates(transaction: BankTransaction, left: ComparablePayment, right: ComparablePayment): number {
  const leftExact = left.amountMinor === transaction.amount.amountMinor ? 0 : 1;
  const rightExact = right.amountMinor === transaction.amount.amountMinor ? 0 : 1;
  if (leftExact !== rightExact) {
    return leftExact - rightExact;
  }

  const leftDelta = Math.abs(transaction.amount.amountMinor - left.amountMinor);
  const rightDelta = Math.abs(transaction.amount.amountMinor - right.amountMinor);
  if (leftDelta !== rightDelta) {
    return leftDelta - rightDelta;
  }

  const leftPayment = left.scope === "order_payment" ? 0 : 1;
  const rightPayment = right.scope === "order_payment" ? 0 : 1;
  return leftPayment - rightPayment;
}

function hasAmazonHint(transaction: BankTransaction): boolean {
  return `${transaction.counterpartyName ?? ""} ${transaction.description} ${transaction.merchantHint ?? ""}`
    .toLowerCase()
    .includes("amazon");
}

function isCreditCardHint(value: string | undefined): boolean {
  const normalized = value?.toLowerCase().replace(/[\s-]+/g, "_") ?? "";
  return normalized.includes("credit_card") || normalized.includes("kreditkarte") || normalized.includes("visa") || normalized.includes("mastercard");
}

function scoreCandidate(input: {
  isExactAmount: boolean;
  hasMerchantHint: boolean;
  hasCreditCardHint: boolean;
  scope: ComparablePayment["scope"];
}): number {
  if (input.isExactAmount) {
    return input.hasMerchantHint ? 0.95 : 0.8;
  }

  let score = 0.55;
  if (input.hasCreditCardHint) {
    score += 0.1;
  }
  if (input.hasMerchantHint) {
    score += 0.1;
  }
  if (input.scope === "order_payment") {
    score += 0.05;
  }
  return Math.min(score, 0.75);
}

function buildReason(input: {
  isExactAmount: boolean;
  hasMerchantHint: boolean;
  hasCreditCardHint: boolean;
  scope: ComparablePayment["scope"];
}): string {
  if (input.isExactAmount && input.hasMerchantHint) {
    return "Betrag, Waehrung, Datum und Amazon-Hinweis passen zusammen.";
  }
  if (input.isExactAmount) {
    return "Betrag, Waehrung und Datum passen zusammen.";
  }

  const scope = input.scope === "order_payment" ? "Bestellzahlung" : "Bestellsumme";
  return input.hasCreditCardHint
    ? `${scope}, Waehrung und Datum passen zu einer groesseren Kreditkartenbuchung.`
    : `${scope}, Waehrung und Datum passen teilweise zu einer groesseren Buchung.`;
}
