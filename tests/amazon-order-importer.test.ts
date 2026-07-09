import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";
import {
  createAmazonOrderHistoryImporter,
  createInMemoryStore,
  importAmazonOrdersUseCase,
} from "../packages/application/index.ts";
import { createDataSource } from "../packages/core/index.ts";

const anonymizedFixturePath = new URL("../docs/examples/amazon-order-history.csv", import.meta.url);
const localRealFixturePath = new URL(
  "../samples/Amazon/Your Orders/Your Amazon Orders/Order History.csv",
  import.meta.url,
);

describe("Amazon order history importer", () => {
  it("parses the anonymized Amazon order history into normalized orders", async () => {
    const csv = await readFile(anonymizedFixturePath, "utf8");
    const result = await createAmazonOrderHistoryImporter().parse({
      dataSourceId: "source-amazon",
      inputType: "csv",
      payload: csv,
      fileName: "amazon-order-history.csv",
    });

    assert.equal(result.failed?.length ?? 0, 0);
    assert.equal(result.parsed.length, 3);
    assert.deepEqual(result.parsed[0]?.normalized, {
      merchantId: "amazon",
      externalOrderId: "303-0000000-0000001",
      orderDate: "2025-02-03",
      shipmentDate: "2025-02-04",
      status: "shipped",
      totalAmountMinor: 1499,
      currency: "EUR",
      paymentMethodHint: "Visa ending in 1234",
      items: [
        {
          title: "Reusable notebook",
          asin: "B000TEST01",
          quantity: 1,
          unitPriceMinor: 1249,
          totalPriceMinor: 1499,
          itemType: "product",
        },
      ],
      payments: [
        {
          paymentDate: "2025-02-03",
          amountMinor: 1499,
          paymentMethodHint: "Visa ending in 1234",
          externalPaymentId: "303-0000000-0000001:Visa ending in 1234",
        },
      ],
    });

    const multiItemOrder = result.parsed[1]?.normalized;
    assert.equal(multiItemOrder?.externalOrderId, "303-0000000-0000002");
    assert.equal(multiItemOrder?.totalAmountMinor, 1698);
    assert.equal(multiItemOrder?.items.length, 2);

    const orderWithoutPaymentData = result.parsed[2]?.normalized;
    assert.equal(orderWithoutPaymentData?.paymentMethodHint, undefined);
    assert.deepEqual(orderWithoutPaymentData?.payments, []);
    assert.equal(orderWithoutPaymentData?.shipmentDate, undefined);
  });

  it("records invalid Amazon rows as failed parser records", () => {
    const result = createAmazonOrderHistoryImporter().parse({
      dataSourceId: "source-amazon",
      inputType: "csv",
      payload:
        "ASIN,Currency,Order Date,Order ID,Order Status,Original Quantity,Payment Method Type,Product Name,Ship Date,Shipment Status,Total Amount,Unit Price\n" +
        "B000TEST,EUR,2025-02-03T10:15:00Z,303-0000000-0000001,Closed,1,Visa,Notebook,2025-02-04T02:00:00Z,Shipped,not-an-amount,12.49",
    });

    assert.equal(result.parsed.length, 0);
    assert.equal(result.failed?.length, 1);
    assert.equal(result.failed?.[0]?.lineNumber, 2);
    assert.match(result.failed?.[0]?.error ?? "", /invalid Total Amount/);
  });

  it("persists parsed orders and deduplicates a re-import by fingerprint", async () => {
    const csv = await readFile(anonymizedFixturePath, "utf8");
    const store = createInMemoryStore();
    await store.dataSources.save(
      createDataSource({
        id: "source-amazon",
        kind: "orders",
        provider: "amazon",
        sourceType: "csv",
        displayName: "Amazon Order History",
      }),
    );

    const input = {
      source: {
        dataSourceId: "source-amazon",
        inputType: "csv" as const,
        payload: csv,
        fileName: "amazon-order-history.csv",
      },
      idFactory: sequenceIds("id"),
      now: fixedNow("2026-07-09T10:00:00.000Z"),
    };

    const firstImport = await importAmazonOrdersUseCase({ store }, input);
    const secondImport = await importAmazonOrdersUseCase({ store }, input);

    assert.equal(firstImport.importRun.status, "completed");
    assert.equal(secondImport.importRun.status, "completed");
    assert.equal((await store.orders.list()).length, 3);
    assert.equal((await store.rawRecords.listByImportRunId(firstImport.importRun.id)).length, 3);
    assert.equal((await store.rawRecords.listByImportRunId(secondImport.importRun.id)).length, 3);
  });

  it("deduplicates overlapping order exports while preserving import runs", async () => {
    const store = createInMemoryStore();
    await store.dataSources.save(
      createDataSource({
        id: "source-amazon-overlap",
        kind: "orders",
        provider: "amazon",
        sourceType: "csv",
        displayName: "Amazon Order History",
      }),
    );

    const header =
      "ASIN,Currency,Order Date,Order ID,Order Status,Original Quantity,Payment Method Type,Product Name,Ship Date,Shipment Status,Total Amount,Unit Price\n";
    const inputBase = {
      idFactory: sequenceIds("overlap"),
      now: fixedNow("2026-07-09T10:00:00.000Z"),
    };
    const firstImport = await importAmazonOrdersUseCase(
      { store },
      {
        ...inputBase,
        source: {
          dataSourceId: "source-amazon-overlap",
          inputType: "csv",
          payload:
            header +
            "BJAN,EUR,2026-01-05T00:00:00Z,303-0000000-0000101,Closed,1,Visa,January item,2026-01-06T00:00:00Z,Shipped,10.00,10.00\n" +
            "BFEB,EUR,2026-02-05T00:00:00Z,303-0000000-0000102,Closed,1,Visa,February item,2026-02-06T00:00:00Z,Shipped,20.00,20.00\n" +
            "BMAR,EUR,2026-03-05T00:00:00Z,303-0000000-0000103,Closed,1,Visa,March item,2026-03-06T00:00:00Z,Shipped,30.00,30.00",
        },
      },
    );
    const secondImport = await importAmazonOrdersUseCase(
      { store },
      {
        ...inputBase,
        source: {
          dataSourceId: "source-amazon-overlap",
          inputType: "csv",
          payload:
            header +
            "BFEB,EUR,2026-02-05T00:00:00Z,303-0000000-0000102,Closed,1,Visa,February item,2026-02-06T00:00:00Z,Shipped,20.00,20.00\n" +
            "BMAR,EUR,2026-03-05T00:00:00Z,303-0000000-0000103,Closed,1,Visa,March item,2026-03-06T00:00:00Z,Shipped,30.00,30.00\n" +
            "BAPR,EUR,2026-04-05T00:00:00Z,303-0000000-0000104,Closed,1,Visa,April item,2026-04-06T00:00:00Z,Shipped,40.00,40.00",
        },
      },
    );

    assert.equal(firstImport.importRun.recordsImported, 3);
    assert.equal(secondImport.importRun.recordsImported, 3);
    assert.equal((await store.orders.list()).length, 4);
    assert.equal((await store.rawRecords.listByImportRunId(firstImport.importRun.id)).length, 3);
    assert.equal((await store.rawRecords.listByImportRunId(secondImport.importRun.id)).length, 3);
  });

  it("parses the local real Amazon order history export when it is present", async (context) => {
    if (!existsSync(localRealFixturePath)) {
      context.skip("samples/Amazon order history is local-only");
      return;
    }

    const csv = await readFile(localRealFixturePath, "utf8");
    const result = await createAmazonOrderHistoryImporter().parse({
      dataSourceId: "source-amazon",
      inputType: "csv",
      payload: csv,
      fileName: "Order History.csv",
    });

    assert.equal(result.failed?.length ?? 0, 0);
    assert.ok(result.parsed.length >= 1000);
    assert.equal(result.parsed[0]?.normalized.currency, "EUR");
    assert.match(result.parsed[0]?.normalized.externalOrderId ?? "", /^\d{3}-\d{7}-\d{7}$/);
  });
});

function sequenceIds(prefix: string): () => string {
  let nextId = 1;
  return () => `${prefix}-${nextId++}`;
}

function fixedNow(value: string): () => string {
  return () => value;
}
