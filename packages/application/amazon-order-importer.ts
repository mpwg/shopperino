import { randomUUID } from "node:crypto";
import type { CreateOrderInput, OrderItemType, OrderStatus } from "../core/order.ts";
import type { Importer, ImportSource } from "./ports.ts";
import {
  createOrderUseCase,
  executeImportUseCase,
  type ExecuteImportResult,
  type UseCaseContext,
} from "./use-cases.ts";

type AmazonOrderItemPayload = {
  title: string;
  asin?: string;
  quantity: number;
  unitPriceMinor?: number;
  totalPriceMinor: number;
  itemType: OrderItemType;
};

type AmazonOrderPaymentPayload = {
  paymentDate?: string;
  amountMinor: number;
  paymentMethodHint?: string;
  externalPaymentId?: string;
};

export type AmazonOrderPayload = Omit<
  CreateOrderInput,
  "id" | "importRunId" | "rawRecordId" | "items" | "payments"
> & {
  items: AmazonOrderItemPayload[];
  payments: AmazonOrderPaymentPayload[];
};

export type ImportAmazonOrdersInput = {
  source: ImportSource;
  merchantId?: string;
  idFactory?: () => string;
  now?: () => string;
};

type AmazonOrderHistoryRow = {
  lineNumber: number;
  cells: Record<string, string>;
};

type AmazonOrderGroup = {
  orderId: string;
  rows: AmazonOrderHistoryRow[];
};

const requiredColumns = [
  "ASIN",
  "Currency",
  "Order Date",
  "Order ID",
  "Order Status",
  "Original Quantity",
  "Payment Method Type",
  "Product Name",
  "Ship Date",
  "Shipment Status",
  "Total Amount",
  "Unit Price",
] as const;

export function createAmazonOrderHistoryImporter(options: { merchantId?: string } = {}): Importer<AmazonOrderPayload> {
  return {
    name: "amazon-order-history",
    version: "1.0.0",
    sourceKind: "orders",
    inputType: "csv",
    parse: (source) => parseAmazonOrderHistory(source, options.merchantId ?? "amazon"),
  };
}

export async function importAmazonOrdersUseCase(
  context: UseCaseContext,
  input: ImportAmazonOrdersInput,
): Promise<ExecuteImportResult<AmazonOrderPayload>> {
  return executeImportUseCase(context, {
    importer: createAmazonOrderHistoryImporter({ merchantId: input.merchantId }),
    source: input.source,
    idFactory: input.idFactory,
    now: input.now,
    persistParsedRecord: async (record, { importRun, rawRecord }) => {
      const orderId = input.idFactory?.() ?? randomUUID();
      await createOrderUseCase(context, {
        ...record.normalized,
        id: orderId,
        importRunId: importRun.id,
        rawRecordId: rawRecord.id,
        items: record.normalized.items.map((item, index) => ({
          ...item,
          id: `${orderId}-item-${index + 1}`,
        })),
        payments: record.normalized.payments.map((payment, index) => ({
          ...payment,
          id: `${orderId}-payment-${index + 1}`,
        })),
      });
    },
  });
}

function parseAmazonOrderHistory(source: ImportSource, merchantId: string) {
  const rows = parseNamedCsvRows(payloadToText(source.payload));
  const failed = [];
  const skipped = [];
  const groups = groupRowsByOrderId(rows);
  const parsed = [];

  for (const group of groups) {
    try {
      const normalized = normalizeOrderGroup(group, merchantId);
      if (normalized.totalAmountMinor <= 0) {
        skipped.push({
          recordType: "order" as const,
          externalId: group.orderId,
          lineNumber: group.rows[0]?.lineNumber,
          rawPayload: group.rows.map((row) => row.cells),
          reason: "order total amount must be greater than zero",
        });
        continue;
      }

      parsed.push({
        recordType: "order" as const,
        externalId: group.orderId,
        lineNumber: group.rows[0]?.lineNumber,
        rawPayload: group.rows.map((row) => row.cells),
        normalized,
      });
    } catch (error) {
      failed.push({
        recordType: "order" as const,
        externalId: group.orderId,
        lineNumber: group.rows[0]?.lineNumber,
        rawPayload: group.rows.map((row) => row.cells),
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { parsed, skipped, failed };
}

function normalizeOrderGroup(group: AmazonOrderGroup, merchantId: string): AmazonOrderPayload {
  const first = group.rows[0];
  if (!first) {
    throw new Error("order has no rows");
  }

  const currency = requiredCell(first, "Currency").toUpperCase();
  const orderDate = parseDate(requiredCell(first, "Order Date"), "Order Date");
  const shipmentDate = firstNonEmpty(group.rows, "Ship Date");
  const paymentMethodHint = normalizeOptionalText(firstNonEmpty(group.rows, "Payment Method Type"));
  const totalAmountMinor = sumAmounts(group.rows, "Total Amount");
  const items = group.rows.map((row, index) => normalizeOrderItem(row, index));

  return {
    merchantId,
    externalOrderId: group.orderId,
    orderDate,
    shipmentDate: shipmentDate ? parseOptionalDate(shipmentDate) : undefined,
    status: mapOrderStatus(requiredCell(first, "Order Status"), firstNonEmpty(group.rows, "Shipment Status")),
    totalAmountMinor,
    currency,
    paymentMethodHint,
    items,
    payments: paymentMethodHint
      ? [
          {
            paymentDate: orderDate,
            amountMinor: totalAmountMinor,
            paymentMethodHint,
            externalPaymentId: `${group.orderId}:${paymentMethodHint}`,
          },
        ]
      : [],
  };
}

function normalizeOrderItem(row: AmazonOrderHistoryRow, index: number): AmazonOrderItemPayload {
  const quantity = parseQuantity(requiredCell(row, "Original Quantity"));
  const totalPriceMinor = parseAmountMinor(requiredCell(row, "Total Amount"), "Total Amount");
  const unitPrice = optionalCell(row, "Unit Price");

  return {
    title: normalizeOptionalText(optionalCell(row, "Product Name")) ?? `Amazon item ${index + 1}`,
    asin: normalizeOptionalText(optionalCell(row, "ASIN")),
    quantity,
    unitPriceMinor: unitPrice ? parseAmountMinor(unitPrice, "Unit Price") : undefined,
    totalPriceMinor,
    itemType: "product",
  };
}

function parseNamedCsvRows(input: string): AmazonOrderHistoryRow[] {
  const rows = parseDelimitedRows(input.replace(/^\uFEFF/, ""), ",");
  const header = rows[0]?.map((cell) => cell.trim());

  if (!header) {
    throw new Error("Amazon order history CSV must contain a header row");
  }

  for (const column of requiredColumns) {
    if (!header.includes(column)) {
      throw new Error(`Amazon order history CSV is missing column ${column}`);
    }
  }

  return rows.slice(1).flatMap((row, index) => {
    if (row.every((cell) => cell.trim() === "")) {
      return [];
    }

    const cells: Record<string, string> = {};
    for (const [columnIndex, column] of header.entries()) {
      cells[column] = row[columnIndex] ?? "";
    }

    return [{ lineNumber: index + 2, cells }];
  });
}

function groupRowsByOrderId(rows: AmazonOrderHistoryRow[]): AmazonOrderGroup[] {
  const byOrderId = new Map<string, AmazonOrderGroup>();

  for (const row of rows) {
    const orderId = requiredCell(row, "Order ID");
    const existing = byOrderId.get(orderId);
    if (existing) {
      existing.rows.push(row);
    } else {
      byOrderId.set(orderId, { orderId, rows: [row] });
    }
  }

  return Array.from(byOrderId.values());
}

function mapOrderStatus(orderStatus: string, shipmentStatus?: string): OrderStatus {
  const value = `${orderStatus} ${shipmentStatus ?? ""}`.toLowerCase();

  if (value.includes("cancel")) {
    return "cancelled";
  }
  if (value.includes("refund") || value.includes("return")) {
    return "refunded";
  }
  if (value.includes("deliver")) {
    return "delivered";
  }
  if (value.includes("ship") || value.includes("closed")) {
    return "shipped";
  }
  if (value.includes("open") || value.includes("order")) {
    return "ordered";
  }

  return "unknown";
}

function sumAmounts(rows: AmazonOrderHistoryRow[], column: string): number {
  return rows.reduce((sum, row) => sum + parseAmountMinor(requiredCell(row, column), column), 0);
}

function firstNonEmpty(rows: AmazonOrderHistoryRow[], column: string): string | undefined {
  for (const row of rows) {
    const value = normalizeOptionalText(optionalCell(row, column));
    if (value) {
      return value;
    }
  }

  return undefined;
}

function requiredCell(row: AmazonOrderHistoryRow, column: string): string {
  const value = normalizeOptionalText(optionalCell(row, column));
  if (!value) {
    throw new Error(`missing ${column}`);
  }

  return value;
}

function optionalCell(row: AmazonOrderHistoryRow, column: string): string | undefined {
  return row.cells[column]?.trim();
}

function normalizeOptionalText(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed || trimmed.toLowerCase() === "not available" || trimmed.toLowerCase() === "not applicable") {
    return undefined;
  }

  return trimmed;
}

function parseDate(value: string, fieldName: string): string {
  const date = value.trim().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    throw new Error(`invalid ${fieldName}`);
  }

  return date;
}

function parseQuantity(value: string): number {
  const parsed = parseInteger(value, "Original Quantity");
  return parsed <= 0 ? 1 : parsed;
}

function parseInteger(value: string, fieldName: string): number {
  const parsed = Number.parseInt(value, 10);
  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`invalid ${fieldName}`);
  }

  return parsed;
}

function parseOptionalDate(value: string): string | undefined {
  return /^\d{4}-\d{2}-\d{2}/.test(value.trim()) ? parseDate(value, "Ship Date") : undefined;
}

function parseAmountMinor(value: string, fieldName: string): number {
  const normalized = value.trim().replace(/^'/, "").replace(/'$/, "");
  if (!/^-?\d+(?:\.\d{1,2})?$/.test(normalized)) {
    throw new Error(`invalid ${fieldName}`);
  }

  return Math.round(Number.parseFloat(normalized) * 100);
}

function payloadToText(payload: unknown): string {
  if (typeof payload === "string") {
    return payload;
  }

  if (payload instanceof Uint8Array) {
    return new TextDecoder().decode(payload);
  }

  if (typeof payload === "object" && payload !== null && "text" in payload) {
    const text = (payload as { text?: unknown }).text;
    if (typeof text === "string") {
      return text;
    }
  }

  throw new Error("Amazon order history payload must be a string, Uint8Array, or object with text");
}

function parseDelimitedRows(input: string, delimiter: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cell = "";
  let quoted = false;

  for (let index = 0; index < input.length; index += 1) {
    const char = input[index];
    const next = input[index + 1];

    if (char === "\"") {
      if (quoted && next === "\"") {
        cell += "\"";
        index += 1;
      } else {
        quoted = !quoted;
      }
      continue;
    }

    if (!quoted && char === delimiter) {
      row.push(cell);
      cell = "";
      continue;
    }

    if (!quoted && (char === "\n" || char === "\r")) {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = "";
      if (char === "\r" && next === "\n") {
        index += 1;
      }
      continue;
    }

    cell += char;
  }

  if (quoted) {
    throw new Error("Amazon order history CSV contains an unclosed quoted field");
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}
