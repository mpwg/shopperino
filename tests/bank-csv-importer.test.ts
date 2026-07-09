import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import { createDataSource } from "../packages/core/index.ts";
import {
  createBankCsvImporter,
  createInMemoryStore,
  importBankCsvUseCase,
} from "../packages/application/index.ts";

const anonymizedFixturePath = new URL("../docs/examples/bank-anonymized.csv", import.meta.url);
const localRealFixturePath = new URL("../samples/bank.csv", import.meta.url);

describe("Bank CSV importer", () => {
  it("parses the anonymized sample into normalized bank transactions", async () => {
    const csv = await readFile(anonymizedFixturePath, "utf8");
    const result = await createBankCsvImporter({ bankAccountId: "account-1" }).parse({
      dataSourceId: "source-bank",
      inputType: "csv",
      payload: csv,
      fileName: "bank-anonymized.csv",
    });

    assert.equal(result.failed?.length ?? 0, 0);
    assert.equal(result.parsed.length, 4);
    assert.deepEqual(result.parsed[0]?.normalized, {
      bankAccountId: "account-1",
      bookingDate: "2025-07-01",
      valueDate: "2025-07-01",
      amountMinor: 12023,
      currency: "EUR",
      direction: "debit",
      counterpartyName: "Max Mustermann",
      description:
        "ONLINE BANKING VOM 30.06 UM 20:42 Empfaenger: Max Mustermann Zahlungsreferenz: Einkauf Supermarkt IBAN Empfaenger: AT000000000000000000 BIC Empfaenger: TESTAT00XXX Empfaenger: Beispielgasse 1, 1000 Wien",
      reference: "Einkauf Supermarkt",
      externalTransactionId: "30.06.2025 20:42:01:421",
    });
    assert.equal(result.parsed[3]?.normalized.amountMinor, 1999);
    assert.equal(result.parsed[3]?.normalized.reference, "AMAZON PAYMENTS EUROPE");
  });

  it("records invalid rows as failed parser records", () => {
    const result = createBankCsvImporter().parse({
      dataSourceId: "source-bank",
      inputType: "csv",
      payload: "01.07.2025;BROKEN;01.07.2025;not-an-amount;EUR;booking-1",
    });

    assert.equal(result.parsed.length, 0);
    assert.equal(result.failed?.length, 1);
    assert.equal(result.failed?.[0]?.lineNumber, 1);
    assert.match(result.failed?.[0]?.error ?? "", /invalid amount/);
  });

  it("persists parsed transactions and deduplicates a re-import by fingerprint", async () => {
    const csv = await readFile(anonymizedFixturePath, "utf8");
    const store = createInMemoryStore();
    await store.dataSources.save(
      createDataSource({
        id: "source-bank",
        kind: "bank",
        provider: "erste_bank",
        sourceType: "csv",
        displayName: "Bank CSV",
      }),
    );

    const input = {
      source: {
        dataSourceId: "source-bank",
        inputType: "csv" as const,
        payload: csv,
        fileName: "bank-anonymized.csv",
      },
      profile: { bankAccountId: "account-1" },
      idFactory: sequenceIds("id"),
      now: fixedNow("2026-07-09T10:00:00.000Z"),
    };

    const firstImport = await importBankCsvUseCase({ store }, input);
    const secondImport = await importBankCsvUseCase({ store }, input);

    assert.equal(firstImport.importRun.status, "completed");
    assert.equal(secondImport.importRun.status, "completed");
    assert.equal((await store.bankTransactions.list()).length, 4);
    assert.equal((await store.rawRecords.listByImportRunId(firstImport.importRun.id)).length, 4);
    assert.equal((await store.rawRecords.listByImportRunId(secondImport.importRun.id)).length, 4);
  });

  it("deduplicates overlapping exports while keeping every import traceable", async () => {
    const store = createInMemoryStore();
    await store.dataSources.save(
      createDataSource({
        id: "source-bank-overlap",
        kind: "bank",
        provider: "erste_bank",
        sourceType: "csv",
        displayName: "Bank CSV",
      }),
    );

    const inputBase = {
      profile: { bankAccountId: "account-overlap" },
      idFactory: sequenceIds("overlap"),
      now: fixedNow("2026-07-09T10:00:00.000Z"),
    };
    const firstImport = await importBankCsvUseCase(
      { store },
      {
        ...inputBase,
        source: {
          dataSourceId: "source-bank-overlap",
          inputType: "csv",
          payload:
            "01.01.2026;AMAZON 01;01.01.2026;-10,00;EUR;booking-jan\n" +
            "01.02.2026;AMAZON 02;01.02.2026;-20,00;EUR;booking-feb\n" +
            "01.03.2026;AMAZON 03;01.03.2026;-30,00;EUR;booking-mar",
        },
      },
    );
    const secondImport = await importBankCsvUseCase(
      { store },
      {
        ...inputBase,
        source: {
          dataSourceId: "source-bank-overlap",
          inputType: "csv",
          payload:
            "01.02.2026;AMAZON 02;01.02.2026;-20,00;EUR;booking-feb\n" +
            "01.03.2026;AMAZON 03;01.03.2026;-30,00;EUR;booking-mar\n" +
            "01.04.2026;AMAZON 04;01.04.2026;-40,00;EUR;booking-apr",
        },
      },
    );

    assert.equal(firstImport.importRun.recordsImported, 3);
    assert.equal(secondImport.importRun.recordsImported, 3);
    assert.equal((await store.bankTransactions.list()).length, 4);
    assert.equal((await store.rawRecords.listByImportRunId(firstImport.importRun.id)).length, 3);
    assert.equal((await store.rawRecords.listByImportRunId(secondImport.importRun.id)).length, 3);
  });

  it("parses the local real bank export when it is present", async (context) => {
    if (!existsSync(localRealFixturePath)) {
      context.skip("samples/bank.csv is local-only");
      return;
    }

    const csv = await readFile(localRealFixturePath, "utf8");
    const result = await createBankCsvImporter({ bankAccountId: "local-account" }).parse({
      dataSourceId: "source-bank",
      inputType: "csv",
      payload: csv,
      fileName: "bank.csv",
    });

    assert.equal(result.failed?.length ?? 0, 0);
    assert.ok(result.parsed.length >= 700);
    assert.equal(result.parsed[0]?.normalized.bookingDate, "2025-07-01");
    assert.equal(result.parsed[0]?.normalized.amountMinor, 12023);
  });
});

function sequenceIds(prefix: string): () => string {
  let nextId = 1;
  return () => `${prefix}-${nextId++}`;
}

function fixedNow(value: string): () => string {
  return () => value;
}
