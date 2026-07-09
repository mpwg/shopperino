import assert from "node:assert/strict";
import type { AddressInfo } from "node:net";
import { after, before, describe, it } from "node:test";
import { createInMemoryStore } from "../packages/application/index.ts";
import { createShopperinoServer } from "../apps/server/server.ts";

const store = createInMemoryStore();
const server = createShopperinoServer({ store });
let baseUrl = "";

describe("server API", () => {
  before(async () => {
    await new Promise<void>((resolve) => {
      server.listen(0, "127.0.0.1", resolve);
    });
    const address = server.address() as AddressInfo;
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    await new Promise<void>((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
  });

  it("answers the health endpoint", async () => {
    const response = await fetch(`${baseUrl}/health`);

    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: "ok" });
  });

  it("creates and lists transactions, orders and matches through application use cases", async () => {
    const transactionResponse = await postJson("/api/transactions", {
      id: "transaction-1",
      bankAccountId: "account-1",
      importRunId: "bank-import-1",
      bookingDate: "2026-07-04",
      amountMinor: 4999,
      currency: "EUR",
      direction: "debit",
      counterpartyName: "Amazon Payments",
      description: "AMAZON MARKETPLACE",
    });
    assert.equal(transactionResponse.status, 201);
    assert.equal(transactionResponse.body.transaction.id, "transaction-1");

    const orderResponse = await postJson("/api/orders", {
      id: "order-1",
      merchantId: "amazon",
      importRunId: "amazon-import-1",
      externalOrderId: "amazon-123",
      orderDate: "2026-07-02",
      shipmentDate: "2026-07-03",
      status: "shipped",
      totalAmountMinor: 4999,
      currency: "EUR",
    });
    assert.equal(orderResponse.status, 201);
    assert.equal(orderResponse.body.order.id, "order-1");

    const transactions = await getJson("/api/transactions");
    assert.equal(transactions.status, 200);
    assert.equal(transactions.body.transactions.length, 1);

    const orders = await getJson("/api/orders");
    assert.equal(orders.status, 200);
    assert.equal(orders.body.orders.length, 1);

    const suggestions = await postJson("/api/matches/suggestions", {});
    assert.equal(suggestions.status, 201);
    assert.equal(suggestions.body.matches.length, 1);

    const matchId = suggestions.body.matches[0].id;
    const confirmed = await postJson(`/api/matches/${encodeURIComponent(matchId)}/confirm`, {
      confirmedAt: "2026-07-05T00:00:00.000Z",
    });
    assert.equal(confirmed.status, 200);
    assert.equal(confirmed.body.match.status, "confirmed");

    const matches = await getJson("/api/matches");
    assert.equal(matches.status, 200);
    assert.equal(matches.body.matches[0].status, "confirmed");
  });
});

async function getJson(path: string): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`);
  return {
    status: response.status,
    body: await response.json(),
  };
}

async function postJson(path: string, body: Record<string, unknown>): Promise<{ status: number; body: any }> {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(body),
  });
  return {
    status: response.status,
    body: await response.json(),
  };
}
