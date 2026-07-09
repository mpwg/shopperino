import { createServer as createNodeServer, type IncomingMessage, type Server, type ServerResponse } from "node:http";
import {
  confirmTransactionOrderMatchUseCase,
  createBankTransactionUseCase,
  createManualTransactionOrderMatchUseCase,
  createOrderUseCase,
  rejectTransactionOrderMatchUseCase,
  suggestTransactionOrderMatchesUseCase,
  type ShopperinoStore,
} from "../../packages/application/index.ts";

export type ShopperinoServerOptions = {
  store: ShopperinoStore;
};

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export function createShopperinoServer(options: ShopperinoServerOptions): Server {
  return createNodeServer(async (request, response) => {
    try {
      await handleRequest(options.store, request, response);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unexpected server error";
      const statusCode = message.startsWith("Match not found:") ? 404 : 400;
      writeJson(response, statusCode, { error: message });
    }
  });
}

async function handleRequest(
  store: ShopperinoStore,
  request: IncomingMessage,
  response: ServerResponse,
): Promise<void> {
  const method = request.method ?? "GET";
  const url = new URL(request.url ?? "/", "http://localhost");

  if (method === "GET" && url.pathname === "/health") {
    writeJson(response, 200, { status: "ok" });
    return;
  }

  if (method === "GET" && url.pathname === "/api/transactions") {
    writeJson(response, 200, { transactions: await store.bankTransactions.list() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/transactions") {
    const transaction = await createBankTransactionUseCase({ store }, await readJsonObject(request));
    writeJson(response, 201, { transaction });
    return;
  }

  if (method === "GET" && url.pathname === "/api/orders") {
    writeJson(response, 200, { orders: await store.orders.list() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/orders") {
    const order = await createOrderUseCase({ store }, await readJsonObject(request));
    writeJson(response, 201, { order });
    return;
  }

  if (method === "GET" && url.pathname === "/api/matches") {
    writeJson(response, 200, { matches: await store.matches.list() });
    return;
  }

  if (method === "POST" && url.pathname === "/api/matches/suggestions") {
    const body = await readOptionalJsonObject(request);
    const suggestions = await suggestTransactionOrderMatchesUseCase(
      { store },
      typeof body.dateWindowDays === "number" ? { dateWindowDays: body.dateWindowDays } : undefined,
    );
    writeJson(response, 201, { matches: suggestions });
    return;
  }

  if (method === "POST" && url.pathname === "/api/matches/manual") {
    const match = await createManualTransactionOrderMatchUseCase({ store }, await readJsonObject(request));
    writeJson(response, 201, { match });
    return;
  }

  const confirmMatch = url.pathname.match(/^\/api\/matches\/([^/]+)\/confirm$/);
  if (method === "POST" && confirmMatch) {
    const body = await readOptionalJsonObject(request);
    const match = await confirmTransactionOrderMatchUseCase(
      { store },
      {
        matchId: decodeURIComponent(confirmMatch[1]),
        confirmedAt: typeof body.confirmedAt === "string" ? body.confirmedAt : undefined,
      },
    );
    writeJson(response, 200, { match });
    return;
  }

  const rejectMatch = url.pathname.match(/^\/api\/matches\/([^/]+)\/reject$/);
  if (method === "POST" && rejectMatch) {
    const body = await readOptionalJsonObject(request);
    const match = await rejectTransactionOrderMatchUseCase(
      { store },
      {
        matchId: decodeURIComponent(rejectMatch[1]),
        rejectedAt: typeof body.rejectedAt === "string" ? body.rejectedAt : undefined,
      },
    );
    writeJson(response, 200, { match });
    return;
  }

  writeJson(response, 404, { error: "Not found" });
}

async function readOptionalJsonObject(request: IncomingMessage): Promise<Record<string, unknown>> {
  if (request.headers["content-length"] === "0") {
    return {};
  }

  const body = await readBody(request);
  if (!body.trim()) {
    return {};
  }

  return parseJsonObject(body);
}

async function readJsonObject(request: IncomingMessage): Promise<Record<string, unknown>> {
  const body = await readBody(request);
  if (!body.trim()) {
    throw new Error("Request body must be a JSON object");
  }

  return parseJsonObject(body);
}

function parseJsonObject(body: string): Record<string, unknown> {
  const value = JSON.parse(body) as unknown;
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Request body must be a JSON object");
  }

  return value as Record<string, unknown>;
}

async function readBody(request: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  return Buffer.concat(chunks).toString("utf8");
}

function writeJson(response: ServerResponse, statusCode: number, body: JsonValue): void {
  response.writeHead(statusCode, {
    "content-type": "application/json; charset=utf-8",
  });
  response.end(JSON.stringify(body));
}
