import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  createBankTransaction,
  createMoney,
  createOrder,
  suggestMatchForPair,
} from "../packages/core/index.ts";

describe("Money", () => {
  it("rejects negative amounts", () => {
    assert.throws(() => createMoney(-1, "EUR"), /positive or zero/);
  });

  it("normalizes currencies", () => {
    assert.deepEqual(createMoney(1234, "eur"), {
      amountMinor: 1234,
      currency: "EUR",
    });
  });
});

describe("BankTransaction", () => {
  it("requires positive transaction amounts", () => {
    assert.throws(
      () =>
        createBankTransaction({
          id: "transaction-1",
          bankAccountId: "account-1",
          importRunId: "import-1",
          bookingDate: "2026-07-01",
          amountMinor: 0,
          currency: "EUR",
          direction: "debit",
          description: "AMAZON",
        }),
      /greater than zero/,
    );
  });

  it("rejects invalid directions", () => {
    assert.throws(
      () =>
        createBankTransaction({
          id: "transaction-1",
          bankAccountId: "account-1",
          importRunId: "import-1",
          bookingDate: "2026-07-01",
          amountMinor: 1999,
          currency: "EUR",
          direction: "out" as "debit",
          description: "AMAZON",
        }),
      /debit or credit/,
    );
  });

  it("generates stable fingerprints for equivalent input", () => {
    const first = createBankTransaction({
      id: "transaction-1",
      bankAccountId: "account-1",
      importRunId: "import-1",
      bookingDate: "2026-07-01",
      amountMinor: 1999,
      currency: "EUR",
      direction: "debit",
      description: " AMAZON  EU ",
    });
    const second = createBankTransaction({
      id: "transaction-2",
      bankAccountId: "account-1",
      importRunId: "import-1",
      bookingDate: "2026-07-01",
      amountMinor: 1999,
      currency: "eur",
      direction: "debit",
      description: "amazon eu",
    });

    assert.equal(first.fingerprint, second.fingerprint);
  });
});

describe("Matching", () => {
  it("suggests a match for same currency, exact amount and nearby dates", () => {
    const transaction = createBankTransaction({
      id: "transaction-1",
      bankAccountId: "account-1",
      importRunId: "import-1",
      bookingDate: "2026-07-04",
      amountMinor: 4999,
      currency: "EUR",
      direction: "debit",
      counterpartyName: "Amazon Payments",
      description: "AMAZON MARKETPLACE",
    });
    const order = createOrder({
      id: "order-1",
      merchantId: "amazon",
      importRunId: "import-2",
      externalOrderId: "amazon-123",
      orderDate: "2026-07-02",
      shipmentDate: "2026-07-03",
      status: "shipped",
      totalAmountMinor: 4999,
      currency: "EUR",
      payments: [
        {
          id: "payment-1",
          paymentDate: "2026-07-03",
          amountMinor: 4999,
          paymentMethodHint: "credit_card",
        },
      ],
    });

    const match = suggestMatchForPair(transaction, order, { dateWindowDays: 7 });

    assert.ok(match);
    assert.equal(match.status, "suggested");
    assert.equal(match.orderPaymentId, "payment-1");
    assert.equal(match.confidenceScore, 0.95);
  });

  it("suggests a partial match for an order paid through a larger credit-card booking", () => {
    const transaction = createBankTransaction({
      id: "transaction-card-1",
      bankAccountId: "account-1",
      importRunId: "import-1",
      bookingDate: "2026-07-04",
      amountMinor: 12000,
      currency: "EUR",
      direction: "debit",
      counterpartyName: "Card Provider",
      description: "Monthly credit card settlement",
    });
    const order = createOrder({
      id: "order-card-1",
      merchantId: "amazon",
      importRunId: "import-2",
      externalOrderId: "amazon-card-123",
      orderDate: "2026-07-02",
      shipmentDate: "2026-07-03",
      status: "shipped",
      totalAmountMinor: 4999,
      currency: "EUR",
      paymentMethodHint: "Visa ending in 1234",
      payments: [
        {
          id: "payment-card-1",
          paymentDate: "2026-07-03",
          amountMinor: 4999,
          paymentMethodHint: "Visa ending in 1234",
        },
      ],
    });

    const match = suggestMatchForPair(transaction, order, { dateWindowDays: 7 });

    assert.ok(match);
    assert.equal(match.matchType, "partial");
    assert.equal(match.amountDeltaMinor, 7001);
    assert.equal(match.rules.amount, "contained_in_larger_card_charge");
    assert.match(match.reason, /Kreditkartenbuchung/);
  });

  it("does not suggest an unrelated different amount without a credit-card hint", () => {
    const transaction = createBankTransaction({
      id: "transaction-no-match-1",
      bankAccountId: "account-1",
      importRunId: "import-1",
      bookingDate: "2026-07-04",
      amountMinor: 12000,
      currency: "EUR",
      direction: "debit",
      description: "Some other debit",
    });
    const order = createOrder({
      id: "order-no-match-1",
      merchantId: "amazon",
      importRunId: "import-2",
      externalOrderId: "amazon-no-match-123",
      orderDate: "2026-07-02",
      status: "shipped",
      totalAmountMinor: 4999,
      currency: "EUR",
    });

    assert.equal(suggestMatchForPair(transaction, order, { dateWindowDays: 7 }), null);
  });
});
