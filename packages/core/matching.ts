import { randomUUID } from "node:crypto";
import { dateDeltaDays } from "./date.ts";
import type { BankTransaction } from "./bank-transaction.ts";
import { createSuggestedMatch, type TransactionOrderMatch } from "./match.ts";
import type { Order, OrderPayment } from "./order.ts";

export type MatchCandidateConfig = {
  dateWindowDays: number;
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

  const bestPayment = findBestPayment(transaction, order);
  const comparableAmount = bestPayment?.amount.amountMinor ?? order.totalAmount.amountMinor;
  const amountDeltaMinor = Math.abs(transaction.amount.amountMinor - comparableAmount);
  const closeEnoughDate = Math.abs(dateDeltaDays(transaction.bookingDate, order.shipmentDate ?? order.orderDate)) <= config.dateWindowDays;

  if (amountDeltaMinor !== 0 || !closeEnoughDate) {
    return null;
  }

  const hasMerchantHint = `${transaction.counterpartyName ?? ""} ${transaction.description} ${transaction.merchantHint ?? ""}`
    .toLowerCase()
    .includes("amazon");

  return createSuggestedMatch({
    id: randomUUID(),
    bankTransactionId: transaction.id,
    orderId: order.id,
    orderPaymentId: bestPayment?.id,
    confidenceScore: hasMerchantHint ? 0.95 : 0.8,
    amountDeltaMinor,
    bankBookingDate: transaction.bookingDate,
    orderDate: order.shipmentDate ?? order.orderDate,
    reason: hasMerchantHint
      ? "Betrag, Waehrung, Datum und Amazon-Hinweis passen zusammen."
      : "Betrag, Waehrung und Datum passen zusammen.",
    rules: {
      amount: "exact",
      currency: "exact",
      dateWindowDays: config.dateWindowDays,
      merchantHint: hasMerchantHint,
    },
  });
}

function findBestPayment(transaction: BankTransaction, order: Order): OrderPayment | undefined {
  return order.payments.find(
    (payment) =>
      payment.amount.currency === transaction.amount.currency &&
      payment.amount.amountMinor === transaction.amount.amountMinor,
  );
}
