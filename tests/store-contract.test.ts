import assert from "node:assert/strict";
import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, it } from "node:test";
import { createDataSource, createImportRun, createManualMatch, createRawRecord } from "../packages/core/index.ts";
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
    it(`${fixture.name} persists data sources, import runs and raw records`, async () => {
      const context = fixture.create() as StoreFixture;
      try {
        const dataSource = createDataSource({
          id: "source-1",
          kind: "bank",
          provider: "erste_bank",
          sourceType: "csv",
          displayName: "Erste Bank CSV",
          config: {
            dateColumn: "Buchungsdatum",
            amountColumn: "Betrag",
          },
          createdAt: "2026-07-01T00:00:00.000Z",
          updatedAt: "2026-07-01T00:00:00.000Z",
        });
        await context.store.dataSources.save(dataSource);

        const importRun = createImportRun({
          id: "import-run-1",
          dataSourceId: dataSource.id,
          sourceKind: "bank",
          inputType: "csv",
          fileName: "konto.csv",
          fileHash: "sha256:test-file",
          parserName: "bank-csv",
          parserVersion: "0.1.0",
          status: "running",
          startedAt: "2026-07-02T00:00:00.000Z",
        });
        await context.store.importRuns.save(importRun);

        const completedImportRun = {
          ...importRun,
          status: "completed" as const,
          finishedAt: "2026-07-02T00:05:00.000Z",
          recordsSeen: 1,
          recordsImported: 1,
        };
        await context.store.importRuns.save(completedImportRun);

        const rawRecord = createRawRecord({
          id: "raw-record-1",
          importRunId: importRun.id,
          recordType: "bank_transaction",
          externalId: "booking-1",
          lineNumber: 2,
          rawPayload: {
            Buchungsdatum: "2026-07-02",
            Betrag: "-49,99",
            Text: "AMAZON MARKETPLACE",
          },
          parseStatus: "parsed",
          createdAt: "2026-07-02T00:01:00.000Z",
        });
        await context.store.rawRecords.save(rawRecord);

        assert.deepEqual(await context.store.dataSources.findById(dataSource.id), dataSource);
        assert.equal((await context.store.dataSources.list()).length, 1);
        assert.deepEqual(await context.store.importRuns.findById(importRun.id), completedImportRun);
        assert.deepEqual(await context.store.importRuns.listByDataSourceId(dataSource.id), [completedImportRun]);
        assert.deepEqual(await context.store.rawRecords.findById(rawRecord.id), rawRecord);
        assert.deepEqual(await context.store.rawRecords.listByImportRunId(importRun.id), [rawRecord]);
      } finally {
        context.close?.();
      }
    });

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
