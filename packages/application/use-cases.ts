import { randomUUID } from "node:crypto";
import {
  confirmMatch,
  createBankTransaction,
  createImportRun,
  createManualMatch,
  createOrder,
  createRawRecord,
  rejectMatch,
  suggestMatchForPair,
  type BankTransaction,
  type CreateBankTransactionInput,
  type CreateOrderInput,
  type ImportRun,
  type Order,
  type RawRecord,
  type TransactionOrderMatch,
} from "../core/index.ts";
import type { Importer, ImportSource, ParsedImportRecord, ShopperinoStore } from "./ports.ts";

export type UseCaseContext = {
  store: ShopperinoStore;
};

export type ImportNormalizedRecordContext = {
  importRun: ImportRun;
  rawRecord: RawRecord;
};

export type ExecuteImportInput<TNormalized> = {
  importer: Importer<TNormalized>;
  source: ImportSource;
  persistParsedRecord?: (
    record: ParsedImportRecord<TNormalized>,
    context: ImportNormalizedRecordContext,
  ) => Promise<void> | void;
  idFactory?: () => string;
  now?: () => string;
};

export type ExecuteImportResult<TNormalized> = {
  importRun: ImportRun;
  rawRecords: RawRecord[];
  parsed: Array<ParsedImportRecord<TNormalized> & { rawRecordId: string }>;
};

export async function createBankTransactionUseCase(
  context: UseCaseContext,
  input: Omit<CreateBankTransactionInput, "id"> & { id?: string },
): Promise<BankTransaction> {
  const transaction = createBankTransaction({
    ...input,
    id: input.id ?? randomUUID(),
  });

  const existing = await context.store.bankTransactions.findByFingerprint(transaction.fingerprint);
  if (existing) {
    return existing;
  }

  await context.store.bankTransactions.save(transaction);
  return transaction;
}

export async function createOrderUseCase(
  context: UseCaseContext,
  input: Omit<CreateOrderInput, "id"> & { id?: string },
): Promise<Order> {
  const order = createOrder({
    ...input,
    id: input.id ?? randomUUID(),
  });

  const existing = await context.store.orders.findByFingerprint(order.fingerprint);
  if (existing) {
    return existing;
  }

  await context.store.orders.save(order);
  return order;
}

export async function executeImportUseCase<TNormalized>(
  context: UseCaseContext,
  input: ExecuteImportInput<TNormalized>,
): Promise<ExecuteImportResult<TNormalized>> {
  const idFactory = input.idFactory ?? randomUUID;
  const now = input.now ?? (() => new Date().toISOString());
  const dataSource = await context.store.dataSources.findById(input.source.dataSourceId);

  if (!dataSource) {
    throw new Error(`Data source not found: ${input.source.dataSourceId}`);
  }
  if (dataSource.kind !== input.importer.sourceKind) {
    throw new Error(`Importer source kind ${input.importer.sourceKind} does not match data source kind ${dataSource.kind}`);
  }
  if (input.source.inputType !== input.importer.inputType) {
    throw new Error(`Importer input type ${input.importer.inputType} does not match source input type ${input.source.inputType}`);
  }

  const startedAt = now();
  const importRun = createImportRun({
    id: idFactory(),
    dataSourceId: dataSource.id,
    sourceKind: dataSource.kind,
    inputType: input.source.inputType,
    fileName: input.source.fileName,
    fileHash: input.source.fileHash,
    parserName: input.importer.name,
    parserVersion: input.importer.version,
    status: "running",
    startedAt,
  });
  await context.store.importRuns.save(importRun);

  try {
    const parseResult = await input.importer.parse(input.source);
    const parsed = parseResult.parsed;
    const skipped = parseResult.skipped ?? [];
    const failed = parseResult.failed ?? [];
    const rawRecords: RawRecord[] = [];
    const parsedWithRawRecordIds: Array<ParsedImportRecord<TNormalized> & { rawRecordId: string }> = [];

    for (const record of parsed) {
      const rawRecord = createRawRecord({
        id: idFactory(),
        importRunId: importRun.id,
        recordType: record.recordType,
        externalId: record.externalId,
        lineNumber: record.lineNumber,
        rawPayload: record.rawPayload,
        parseStatus: "parsed",
        createdAt: now(),
      });
      await context.store.rawRecords.save(rawRecord);
      await input.persistParsedRecord?.(record, { importRun, rawRecord });
      rawRecords.push(rawRecord);
      parsedWithRawRecordIds.push({ ...record, rawRecordId: rawRecord.id });
    }

    for (const record of skipped) {
      const rawRecord = createRawRecord({
        id: idFactory(),
        importRunId: importRun.id,
        recordType: record.recordType ?? "unknown",
        externalId: record.externalId,
        lineNumber: record.lineNumber,
        rawPayload: record.rawPayload,
        parseStatus: "skipped",
        parseError: record.reason,
        createdAt: now(),
      });
      await context.store.rawRecords.save(rawRecord);
      rawRecords.push(rawRecord);
    }

    for (const record of failed) {
      const rawRecord = createRawRecord({
        id: idFactory(),
        importRunId: importRun.id,
        recordType: record.recordType ?? "unknown",
        externalId: record.externalId,
        lineNumber: record.lineNumber,
        rawPayload: record.rawPayload,
        parseStatus: "failed",
        parseError: record.error,
        createdAt: now(),
      });
      await context.store.rawRecords.save(rawRecord);
      rawRecords.push(rawRecord);
    }

    const completedImportRun = createImportRun({
      ...importRun,
      status: failed.length > 0 ? "completed_with_errors" : "completed",
      finishedAt: now(),
      recordsSeen: parsed.length + skipped.length + failed.length,
      recordsImported: parsed.length,
      recordsFailed: failed.length,
      errorSummary: summarizeErrors(failed.map((record) => record.error)),
    });
    await context.store.importRuns.save(completedImportRun);

    return {
      importRun: completedImportRun,
      rawRecords,
      parsed: parsedWithRawRecordIds,
    };
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    const failedImportRun = createImportRun({
      ...importRun,
      status: "failed",
      finishedAt: now(),
      recordsSeen: 0,
      recordsImported: 0,
      recordsFailed: 1,
      errorSummary: errorMessage,
    });
    await context.store.importRuns.save(failedImportRun);
    return {
      importRun: failedImportRun,
      rawRecords: [],
      parsed: [],
    };
  }
}

export async function suggestTransactionOrderMatchesUseCase(
  context: UseCaseContext,
  options?: { dateWindowDays?: number },
): Promise<TransactionOrderMatch[]> {
  const dateWindowDays = options?.dateWindowDays ?? 7;
  const transactions = await context.store.bankTransactions.list();
  const orders = await context.store.orders.list();
  const created: TransactionOrderMatch[] = [];

  for (const transaction of transactions) {
    for (const order of orders) {
      const existing = await context.store.matches.findByTransactionAndOrder(transaction.id, order.id);

      if (existing.some((match) => match.status === "confirmed" || match.status === "manual" || match.status === "rejected")) {
        continue;
      }

      if (existing.some((match) => match.status === "suggested")) {
        continue;
      }

      const suggestion = suggestMatchForPair(transaction, order, { dateWindowDays });
      if (!suggestion) {
        continue;
      }

      await context.store.matches.save(suggestion);
      created.push(suggestion);
    }
  }

  return created;
}

export async function confirmTransactionOrderMatchUseCase(
  context: UseCaseContext,
  input: { matchId: string; confirmedAt?: string },
): Promise<TransactionOrderMatch> {
  const match = await context.store.matches.findById(input.matchId);
  if (!match) {
    throw new Error(`Match not found: ${input.matchId}`);
  }

  const confirmed = confirmMatch(match, input.confirmedAt);
  await context.store.matches.save(confirmed);
  return confirmed;
}

export async function rejectTransactionOrderMatchUseCase(
  context: UseCaseContext,
  input: { matchId: string; rejectedAt?: string },
): Promise<TransactionOrderMatch> {
  const match = await context.store.matches.findById(input.matchId);
  if (!match) {
    throw new Error(`Match not found: ${input.matchId}`);
  }

  const rejected = rejectMatch(match, input.rejectedAt);
  await context.store.matches.save(rejected);
  return rejected;
}

export async function createManualTransactionOrderMatchUseCase(
  context: UseCaseContext,
  input: {
    bankTransactionId: string;
    orderId: string;
    orderPaymentId?: string;
    reason?: string;
    createdAt?: string;
    id?: string;
  },
): Promise<TransactionOrderMatch> {
  const transaction = await context.store.bankTransactions.findById(input.bankTransactionId);
  if (!transaction) {
    throw new Error(`Bank transaction not found: ${input.bankTransactionId}`);
  }

  const order = await context.store.orders.findById(input.orderId);
  if (!order) {
    throw new Error(`Order not found: ${input.orderId}`);
  }

  const payment = input.orderPaymentId ? order.payments.find((candidate) => candidate.id === input.orderPaymentId) : undefined;
  if (input.orderPaymentId && !payment) {
    throw new Error(`Order payment not found: ${input.orderPaymentId}`);
  }

  const existing = await context.store.matches.findByTransactionAndOrder(transaction.id, order.id);
  if (existing.some((match) => match.status === "confirmed" || match.status === "manual")) {
    throw new Error("A confirmed or manual match already exists for this transaction and order");
  }

  const comparableAmountMinor = payment?.amount.amountMinor ?? order.totalAmount.amountMinor;
  const orderDate = payment?.paymentDate ?? order.shipmentDate ?? order.orderDate;
  const manual = createManualMatch({
    id: input.id ?? randomUUID(),
    bankTransactionId: transaction.id,
    orderId: order.id,
    orderPaymentId: payment?.id,
    amountDeltaMinor: Math.abs(transaction.amount.amountMinor - comparableAmountMinor),
    bankBookingDate: transaction.bookingDate,
    orderDate,
    reason: input.reason ?? "User created this match manually.",
    createdAt: input.createdAt,
  });
  await context.store.matches.save(manual);
  return manual;
}

function summarizeErrors(errors: string[]): string | undefined {
  if (errors.length === 0) {
    return undefined;
  }

  const firstErrors = errors.slice(0, 3).join("; ");
  return errors.length > 3 ? `${firstErrors}; ${errors.length - 3} more error(s)` : firstErrors;
}
