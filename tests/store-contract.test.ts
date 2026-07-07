import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createManualMatch } from "../packages/core/index.ts";
import type { ShopperinoStore } from "../packages/application/index.ts";
import {
  confirmTransactionOrderMatchUseCase,
  createBankTransactionUseCase,
  createInMemoryStore,
  createOrderUseCase,
  suggestTransactionOrderMatchesUseCase,
} from "../packages/application/index.ts";
import { createSqliteStore, type SqliteShopperinoStore } from "../packages/db/index.ts";

type StoreFixture = {
  store: ShopperinoStore;
  close?: () => void;
};

describe("ShopperinoStore contract", () => {
  for (const fixture of [
    {
      name: "InMemoryStore",
      create: () => ({ store: createInMemoryStore() }),
    },
    {
      name: "SqliteStore",
      create: () => {
        const directory = mkdtempSync(join(tmpdir(), "shopperino-test-"));
        const store = createSqliteStore(join(directory, "shopperino.db"));
        return {
          store,
          close: () => (store as SqliteShopperinoStore).close(),
        };
      },
    },
  ]) {
    it(`${fixture.name} persists transactions, orders and matches`, async () => {
      const context = fixture.create() as StoreFixture;
      try {
        const transaction = await createBankTransactionUseCase(
          { store: context.store },
          {
            id: "transaction-1",
            bankAccountId: "account-1",
            importRunId: "bank-import-1",
            bookingDate: "2026-07-04",
            amountMinor: 4999,
            currency: "EUR",
            direction: "debit",
            counterpartyName: "Amazon Payments",
            description: "AMAZON MARKETPLACE",
          },
        );
        const order = await createOrderUseCase(
          { store: context.store },
          {
            id: "order-1",
            merchantId: "amazon",
            importRunId: "amazon-import-1",
            externalOrderId: "amazon-123",
            orderDate: "2026-07-02",
            shipmentDate: "2026-07-03",
            status: "shipped",
            totalAmountMinor: 4999,
            currency: "EUR",
            items: [
              {
                id: "item-1",
                title: "USB-C Cable",
                asin: "B000TEST",
                quantity: 1,
                unitPriceMinor: 4999,
                totalPriceMinor: 4999,
                itemType: "product",
              },
            ],
            payments: [
              {
                id: "payment-1",
                paymentDate: "2026-07-03",
                amountMinor: 4999,
                paymentMethodHint: "credit_card",
              },
            ],
          },
        );

        assert.equal((await context.store.bankTransactions.findById(transaction.id))?.fingerprint, transaction.fingerprint);
        assert.equal((await context.store.orders.findById(order.id))?.items.length, 1);

        const suggestions = await suggestTransactionOrderMatchesUseCase({ store: context.store });
        assert.equal(suggestions.length, 1);
        assert.equal(suggestions[0]?.bankTransactionId, "transaction-1");

        const confirmed = await confirmTransactionOrderMatchUseCase(
          { store: context.store },
          { matchId: suggestions[0].id, confirmedAt: "2026-07-05T00:00:00.000Z" },
        );

        assert.equal(confirmed.status, "confirmed");
        assert.equal((await context.store.matches.findById(confirmed.id))?.status, "confirmed");
      } finally {
        context.close?.();
      }
    });

    it(`${fixture.name} does not overwrite manual decisions with suggestions`, async () => {
      const context = fixture.create() as StoreFixture;
      try {
        const transaction = await createBankTransactionUseCase(
          { store: context.store },
          {
            id: "transaction-2",
            bankAccountId: "account-1",
            importRunId: "bank-import-1",
            bookingDate: "2026-07-04",
            amountMinor: 4999,
            currency: "EUR",
            direction: "debit",
            counterpartyName: "Amazon Payments",
            description: "AMAZON MARKETPLACE",
          },
        );
        const order = await createOrderUseCase(
          { store: context.store },
          {
            id: "order-2",
            merchantId: "amazon",
            importRunId: "amazon-import-1",
            externalOrderId: "amazon-456",
            orderDate: "2026-07-02",
            shipmentDate: "2026-07-03",
            status: "shipped",
            totalAmountMinor: 4999,
            currency: "EUR",
          },
        );
        const manualMatch = createManualMatch({
          id: "manual-match-1",
          bankTransactionId: transaction.id,
          orderId: order.id,
          amountDeltaMinor: 0,
          bankBookingDate: transaction.bookingDate,
          orderDate: order.shipmentDate,
          reason: "User confirmed this match manually.",
          createdAt: "2026-07-05T00:00:00.000Z",
        });
        await context.store.matches.save(manualMatch);

        const suggestions = await suggestTransactionOrderMatchesUseCase({ store: context.store });

        assert.equal(suggestions.length, 0);
        assert.equal((await context.store.matches.findById(manualMatch.id))?.status, "manual");
      } finally {
        context.close?.();
      }
    });
  }
});
