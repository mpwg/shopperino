import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { createDataSource, type CreateBankTransactionInput } from "../packages/core/index.ts";
import {
  createBankTransactionUseCase,
  createInMemoryStore,
  executeImportUseCase,
  type Importer,
} from "../packages/application/index.ts";

type BankTransactionImportPayload = Omit<CreateBankTransactionInput, "id" | "importRunId" | "rawRecordId">;

describe("Import pipeline", () => {
  it("creates an import run, raw records and normalized records for a successful import", async () => {
    const store = createInMemoryStore();
    await store.dataSources.save(
      createDataSource({
        id: "source-bank",
        kind: "bank",
        provider: "demo_bank",
        sourceType: "csv",
        displayName: "Demo Bank CSV",
      }),
    );

    const importer: Importer<BankTransactionImportPayload> = {
      name: "demo-bank-csv",
      version: "1.0.0",
      sourceKind: "bank",
      inputType: "csv",
      parse: () => ({
        parsed: [
          {
            recordType: "bank_transaction",
            lineNumber: 1,
            externalId: "booking-1",
            rawPayload: ["01.07.2025", "AMAZON PAYMENTS", "01.07.2025", "-19,99", "EUR", "booking-1"],
            normalized: {
              bankAccountId: "account-1",
              bookingDate: "2025-07-01",
              valueDate: "2025-07-01",
              amountMinor: 1999,
              currency: "EUR",
              direction: "debit",
              counterpartyName: "Amazon Payments",
              description: "AMAZON PAYMENTS",
              externalTransactionId: "booking-1",
            },
          },
        ],
      }),
    };

    const result = await executeImportUseCase(
      { store },
      {
        importer,
        source: {
          dataSourceId: "source-bank",
          inputType: "csv",
          fileName: "bank-anonymized.csv",
          fileHash: "sha256:demo",
          payload: "csv content",
        },
        idFactory: sequenceIds("id"),
        now: fixedNow("2026-07-09T10:00:00.000Z"),
        persistParsedRecord: async (record, { importRun, rawRecord }) => {
          await createBankTransactionUseCase(
            { store },
            {
              ...record.normalized,
              id: `transaction-${rawRecord.id}`,
              importRunId: importRun.id,
              rawRecordId: rawRecord.id,
            },
          );
        },
      },
    );

    assert.equal(result.importRun.status, "completed");
    assert.equal(result.importRun.recordsSeen, 1);
    assert.equal(result.importRun.recordsImported, 1);
    assert.equal(result.importRun.recordsFailed, 0);
    assert.equal(result.rawRecords.length, 1);
    assert.equal(result.rawRecords[0]?.parseStatus, "parsed");
    assert.equal(result.parsed[0]?.rawRecordId, "id-2");
    assert.equal((await store.importRuns.findById("id-1"))?.status, "completed");
    assert.equal((await store.rawRecords.listByImportRunId("id-1")).length, 1);
    assert.equal((await store.bankTransactions.list())[0]?.rawRecordId, "id-2");
  });

  it("keeps parsed, skipped and failed input records traceable in partial imports", async () => {
    const store = createInMemoryStore();
    await store.dataSources.save(
      createDataSource({
        id: "source-orders",
        kind: "orders",
        provider: "amazon",
        sourceType: "api",
        displayName: "Amazon API",
      }),
    );

    const importer: Importer<{ orderNumber: string }> = {
      name: "amazon-demo",
      version: "0.1.0",
      sourceKind: "orders",
      inputType: "json",
      parse: () => ({
        parsed: [
          {
            recordType: "order",
            lineNumber: 1,
            externalId: "order-1",
            rawPayload: { orderNumber: "order-1", total: "19.99" },
            normalized: { orderNumber: "order-1" },
          },
        ],
        skipped: [
          {
            recordType: "order",
            lineNumber: 2,
            rawPayload: { orderNumber: "order-2", total: "0.00" },
            reason: "zero-value order",
          },
        ],
        failed: [
          {
            recordType: "order",
            lineNumber: 3,
            rawPayload: { orderNumber: "order-3", total: "not-a-price" },
            error: "invalid total amount",
          },
        ],
      }),
    };

    const result = await executeImportUseCase(
      { store },
      {
        importer,
        source: {
          dataSourceId: "source-orders",
          inputType: "json",
          payload: [{ orderNumber: "order-1" }, { orderNumber: "order-2" }, { orderNumber: "order-3" }],
        },
        idFactory: sequenceIds("partial"),
        now: fixedNow("2026-07-09T11:00:00.000Z"),
      },
    );

    assert.equal(result.importRun.status, "completed_with_errors");
    assert.equal(result.importRun.recordsSeen, 3);
    assert.equal(result.importRun.recordsImported, 1);
    assert.equal(result.importRun.recordsFailed, 1);
    assert.match(result.importRun.errorSummary ?? "", /invalid total amount/);
    assert.deepEqual(
      result.rawRecords.map((record) => record.parseStatus),
      ["parsed", "skipped", "failed"],
    );
    assert.equal(result.rawRecords[1]?.parseError, "zero-value order");
    assert.equal(result.rawRecords[2]?.parseError, "invalid total amount");
  });

  it("marks the import run as failed when the importer cannot parse the input at all", async () => {
    const store = createInMemoryStore();
    await store.dataSources.save(
      createDataSource({
        id: "source-bank",
        kind: "bank",
        provider: "demo_bank",
        sourceType: "csv",
        displayName: "Demo Bank CSV",
      }),
    );

    const importer: Importer<unknown> = {
      name: "broken-csv",
      version: "1.0.0",
      sourceKind: "bank",
      inputType: "csv",
      parse: () => {
        throw new Error("missing required columns");
      },
    };

    const result = await executeImportUseCase(
      { store },
      {
        importer,
        source: {
          dataSourceId: "source-bank",
          inputType: "csv",
          payload: "not really csv",
        },
        idFactory: sequenceIds("failed"),
        now: fixedNow("2026-07-09T12:00:00.000Z"),
      },
    );

    assert.equal(result.importRun.status, "failed");
    assert.equal(result.importRun.recordsSeen, 0);
    assert.equal(result.importRun.recordsImported, 0);
    assert.equal(result.importRun.recordsFailed, 1);
    assert.match(result.importRun.errorSummary ?? "", /missing required columns/);
    assert.deepEqual(await store.rawRecords.listByImportRunId("failed-1"), []);
  });
});

function sequenceIds(prefix: string): () => string {
  let nextId = 1;
  return () => `${prefix}-${nextId++}`;
}

function fixedNow(value: string): () => string {
  return () => value;
}
