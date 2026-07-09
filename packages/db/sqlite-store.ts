import { DatabaseSync } from "node:sqlite";
import type { BankTransaction } from "../core/bank-transaction.ts";
import type { DataSource, ImportRun, RawRecord } from "../core/import.ts";
import type { TransactionOrderMatch } from "../core/match.ts";
import type { Order, OrderItem, OrderPayment } from "../core/order.ts";
import type {
  BankTransactionRepository,
  DataSourceRepository,
  ImportRunRepository,
  MatchRepository,
  OrderRepository,
  RawRecordRepository,
  ShopperinoStore,
} from "../application/ports.ts";

type SqliteRow = Record<string, unknown>;

export type SqliteShopperinoStore = ShopperinoStore & {
  close(): void;
};

export function createSqliteStore(databasePath: string): SqliteShopperinoStore {
  const database = new DatabaseSync(databasePath);
  initializeSqliteSchema(database);

  return {
    dataSources: new SqliteDataSourceRepository(database),
    importRuns: new SqliteImportRunRepository(database),
    rawRecords: new SqliteRawRecordRepository(database),
    bankTransactions: new SqliteBankTransactionRepository(database),
    orders: new SqliteOrderRepository(database),
    matches: new SqliteMatchRepository(database),
    close() {
      database.close();
    },
  };
}

export function initializeSqliteSchema(database: DatabaseSync): void {
  database.exec(`
    PRAGMA foreign_keys = ON;

    CREATE TABLE IF NOT EXISTS data_sources (
      id TEXT PRIMARY KEY,
      kind TEXT NOT NULL,
      provider TEXT NOT NULL,
      source_type TEXT NOT NULL,
      display_name TEXT NOT NULL,
      config_json TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS import_runs (
      id TEXT PRIMARY KEY,
      data_source_id TEXT NOT NULL REFERENCES data_sources(id) ON DELETE RESTRICT,
      source_kind TEXT NOT NULL,
      input_type TEXT NOT NULL,
      file_name TEXT,
      file_hash TEXT,
      parser_name TEXT NOT NULL,
      parser_version TEXT NOT NULL,
      status TEXT NOT NULL,
      started_at TEXT NOT NULL,
      finished_at TEXT,
      records_seen INTEGER NOT NULL,
      records_imported INTEGER NOT NULL,
      records_failed INTEGER NOT NULL,
      error_summary TEXT
    );

    CREATE TABLE IF NOT EXISTS raw_records (
      id TEXT PRIMARY KEY,
      import_run_id TEXT NOT NULL REFERENCES import_runs(id) ON DELETE CASCADE,
      record_type TEXT NOT NULL,
      external_id TEXT,
      line_number INTEGER,
      raw_payload_json TEXT NOT NULL,
      payload_hash TEXT NOT NULL,
      parse_status TEXT NOT NULL,
      parse_error TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS bank_transactions (
      id TEXT PRIMARY KEY,
      bank_account_id TEXT NOT NULL,
      import_run_id TEXT NOT NULL,
      raw_record_id TEXT,
      external_transaction_id TEXT,
      booking_date TEXT NOT NULL,
      value_date TEXT,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      direction TEXT NOT NULL,
      counterparty_name TEXT,
      description TEXT NOT NULL,
      reference TEXT,
      merchant_hint TEXT,
      fingerprint TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      import_run_id TEXT NOT NULL,
      raw_record_id TEXT,
      external_order_id TEXT NOT NULL,
      order_date TEXT NOT NULL,
      shipment_date TEXT,
      invoice_date TEXT,
      status TEXT NOT NULL,
      total_amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      payment_method_hint TEXT,
      fingerprint TEXT NOT NULL UNIQUE,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      title TEXT NOT NULL,
      asin TEXT,
      quantity REAL NOT NULL,
      unit_price_minor INTEGER,
      total_price_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      item_type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_payments (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      payment_date TEXT,
      amount_minor INTEGER NOT NULL,
      currency TEXT NOT NULL,
      payment_method_hint TEXT,
      external_payment_id TEXT,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS transaction_order_matches (
      id TEXT PRIMARY KEY,
      bank_transaction_id TEXT NOT NULL REFERENCES bank_transactions(id) ON DELETE CASCADE,
      order_id TEXT NOT NULL REFERENCES orders(id) ON DELETE CASCADE,
      order_payment_id TEXT REFERENCES order_payments(id) ON DELETE SET NULL,
      status TEXT NOT NULL,
      match_type TEXT NOT NULL,
      confidence_score REAL NOT NULL,
      amount_delta_minor INTEGER NOT NULL,
      date_delta_days INTEGER,
      reason TEXT NOT NULL,
      rules_json TEXT NOT NULL,
      created_by TEXT NOT NULL,
      created_at TEXT NOT NULL,
      confirmed_at TEXT,
      rejected_at TEXT
    );
  `);
}

class SqliteDataSourceRepository implements DataSourceRepository {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async save(dataSource: DataSource): Promise<void> {
    this.database
      .prepare(`
        INSERT INTO data_sources (
          id, kind, provider, source_type, display_name, config_json, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          kind = excluded.kind,
          provider = excluded.provider,
          source_type = excluded.source_type,
          display_name = excluded.display_name,
          config_json = excluded.config_json,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `)
      .run(
        dataSource.id,
        dataSource.kind,
        dataSource.provider,
        dataSource.sourceType,
        dataSource.displayName,
        JSON.stringify(dataSource.config),
        dataSource.createdAt,
        dataSource.updatedAt,
      );
  }

  async findById(id: string): Promise<DataSource | null> {
    return dataSourceFromRow(this.database.prepare("SELECT * FROM data_sources WHERE id = ?").get(id));
  }

  async list(): Promise<DataSource[]> {
    return this.database
      .prepare("SELECT * FROM data_sources ORDER BY created_at, id")
      .all()
      .map((row) => dataSourceFromRow(row))
      .filter((dataSource) => dataSource !== null);
  }
}

class SqliteImportRunRepository implements ImportRunRepository {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async save(importRun: ImportRun): Promise<void> {
    this.database
      .prepare(`
        INSERT INTO import_runs (
          id, data_source_id, source_kind, input_type, file_name, file_hash,
          parser_name, parser_version, status, started_at, finished_at,
          records_seen, records_imported, records_failed, error_summary
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          data_source_id = excluded.data_source_id,
          source_kind = excluded.source_kind,
          input_type = excluded.input_type,
          file_name = excluded.file_name,
          file_hash = excluded.file_hash,
          parser_name = excluded.parser_name,
          parser_version = excluded.parser_version,
          status = excluded.status,
          started_at = excluded.started_at,
          finished_at = excluded.finished_at,
          records_seen = excluded.records_seen,
          records_imported = excluded.records_imported,
          records_failed = excluded.records_failed,
          error_summary = excluded.error_summary
      `)
      .run(
        importRun.id,
        importRun.dataSourceId,
        importRun.sourceKind,
        importRun.inputType,
        importRun.fileName ?? null,
        importRun.fileHash ?? null,
        importRun.parserName,
        importRun.parserVersion,
        importRun.status,
        importRun.startedAt,
        importRun.finishedAt ?? null,
        importRun.recordsSeen,
        importRun.recordsImported,
        importRun.recordsFailed,
        importRun.errorSummary ?? null,
      );
  }

  async findById(id: string): Promise<ImportRun | null> {
    return importRunFromRow(this.database.prepare("SELECT * FROM import_runs WHERE id = ?").get(id));
  }

  async list(): Promise<ImportRun[]> {
    return this.database
      .prepare("SELECT * FROM import_runs ORDER BY started_at, id")
      .all()
      .map((row) => importRunFromRow(row))
      .filter((importRun) => importRun !== null);
  }

  async listByDataSourceId(dataSourceId: string): Promise<ImportRun[]> {
    return this.database
      .prepare("SELECT * FROM import_runs WHERE data_source_id = ? ORDER BY started_at, id")
      .all(dataSourceId)
      .map((row) => importRunFromRow(row))
      .filter((importRun) => importRun !== null);
  }
}

class SqliteRawRecordRepository implements RawRecordRepository {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async save(rawRecord: RawRecord): Promise<void> {
    this.database
      .prepare(`
        INSERT INTO raw_records (
          id, import_run_id, record_type, external_id, line_number, raw_payload_json,
          payload_hash, parse_status, parse_error, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          import_run_id = excluded.import_run_id,
          record_type = excluded.record_type,
          external_id = excluded.external_id,
          line_number = excluded.line_number,
          raw_payload_json = excluded.raw_payload_json,
          payload_hash = excluded.payload_hash,
          parse_status = excluded.parse_status,
          parse_error = excluded.parse_error,
          created_at = excluded.created_at
      `)
      .run(
        rawRecord.id,
        rawRecord.importRunId,
        rawRecord.recordType,
        rawRecord.externalId ?? null,
        rawRecord.lineNumber ?? null,
        JSON.stringify(rawRecord.rawPayload),
        rawRecord.payloadHash,
        rawRecord.parseStatus,
        rawRecord.parseError ?? null,
        rawRecord.createdAt,
      );
  }

  async findById(id: string): Promise<RawRecord | null> {
    return rawRecordFromRow(this.database.prepare("SELECT * FROM raw_records WHERE id = ?").get(id));
  }

  async listByImportRunId(importRunId: string): Promise<RawRecord[]> {
    return this.database
      .prepare("SELECT * FROM raw_records WHERE import_run_id = ? ORDER BY created_at, id")
      .all(importRunId)
      .map((row) => rawRecordFromRow(row))
      .filter((rawRecord) => rawRecord !== null);
  }
}

class SqliteBankTransactionRepository implements BankTransactionRepository {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async save(transaction: BankTransaction): Promise<void> {
    this.database
      .prepare(`
        INSERT INTO bank_transactions (
          id, bank_account_id, import_run_id, raw_record_id, external_transaction_id,
          booking_date, value_date, amount_minor, currency, direction, counterparty_name,
          description, reference, merchant_hint, fingerprint, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          bank_account_id = excluded.bank_account_id,
          import_run_id = excluded.import_run_id,
          raw_record_id = excluded.raw_record_id,
          external_transaction_id = excluded.external_transaction_id,
          booking_date = excluded.booking_date,
          value_date = excluded.value_date,
          amount_minor = excluded.amount_minor,
          currency = excluded.currency,
          direction = excluded.direction,
          counterparty_name = excluded.counterparty_name,
          description = excluded.description,
          reference = excluded.reference,
          merchant_hint = excluded.merchant_hint,
          fingerprint = excluded.fingerprint,
          created_at = excluded.created_at,
          updated_at = excluded.updated_at
      `)
      .run(
        transaction.id,
        transaction.bankAccountId,
        transaction.importRunId,
        transaction.rawRecordId ?? null,
        transaction.externalTransactionId ?? null,
        transaction.bookingDate,
        transaction.valueDate ?? null,
        transaction.amount.amountMinor,
        transaction.amount.currency,
        transaction.direction,
        transaction.counterpartyName ?? null,
        transaction.description,
        transaction.reference ?? null,
        transaction.merchantHint ?? null,
        transaction.fingerprint,
        transaction.createdAt,
        transaction.updatedAt,
      );
  }

  async findById(id: string): Promise<BankTransaction | null> {
    return bankTransactionFromRow(this.database.prepare("SELECT * FROM bank_transactions WHERE id = ?").get(id));
  }

  async findByFingerprint(fingerprint: string): Promise<BankTransaction | null> {
    return bankTransactionFromRow(
      this.database.prepare("SELECT * FROM bank_transactions WHERE fingerprint = ?").get(fingerprint),
    );
  }

  async list(): Promise<BankTransaction[]> {
    return this.database
      .prepare("SELECT * FROM bank_transactions ORDER BY booking_date, id")
      .all()
      .map((row) => bankTransactionFromRow(row))
      .filter((transaction) => transaction !== null);
  }
}

class SqliteOrderRepository implements OrderRepository {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async save(order: Order): Promise<void> {
    this.database.exec("BEGIN");
    try {
      this.database
        .prepare(`
          INSERT INTO orders (
            id, merchant_id, import_run_id, raw_record_id, external_order_id, order_date,
            shipment_date, invoice_date, status, total_amount_minor, currency,
            payment_method_hint, fingerprint, created_at, updated_at
          )
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            merchant_id = excluded.merchant_id,
            import_run_id = excluded.import_run_id,
            raw_record_id = excluded.raw_record_id,
            external_order_id = excluded.external_order_id,
            order_date = excluded.order_date,
            shipment_date = excluded.shipment_date,
            invoice_date = excluded.invoice_date,
            status = excluded.status,
            total_amount_minor = excluded.total_amount_minor,
            currency = excluded.currency,
            payment_method_hint = excluded.payment_method_hint,
            fingerprint = excluded.fingerprint,
            created_at = excluded.created_at,
            updated_at = excluded.updated_at
        `)
        .run(
          order.id,
          order.merchantId,
          order.importRunId,
          order.rawRecordId ?? null,
          order.externalOrderId,
          order.orderDate,
          order.shipmentDate ?? null,
          order.invoiceDate ?? null,
          order.status,
          order.totalAmount.amountMinor,
          order.totalAmount.currency,
          order.paymentMethodHint ?? null,
          order.fingerprint,
          order.createdAt,
          order.updatedAt,
        );

      this.database.prepare("DELETE FROM order_items WHERE order_id = ?").run(order.id);
      this.database.prepare("DELETE FROM order_payments WHERE order_id = ?").run(order.id);

      const insertItem = this.database.prepare(`
        INSERT INTO order_items (
          id, order_id, title, asin, quantity, unit_price_minor, total_price_minor,
          currency, item_type, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const item of order.items) {
        insertItem.run(
          item.id,
          item.orderId,
          item.title,
          item.asin ?? null,
          item.quantity,
          item.unitPrice?.amountMinor ?? null,
          item.totalPrice.amountMinor,
          item.totalPrice.currency,
          item.itemType,
          item.createdAt,
          item.updatedAt,
        );
      }

      const insertPayment = this.database.prepare(`
        INSERT INTO order_payments (
          id, order_id, payment_date, amount_minor, currency,
          payment_method_hint, external_payment_id, created_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `);
      for (const payment of order.payments) {
        insertPayment.run(
          payment.id,
          payment.orderId,
          payment.paymentDate ?? null,
          payment.amount.amountMinor,
          payment.amount.currency,
          payment.paymentMethodHint ?? null,
          payment.externalPaymentId ?? null,
          payment.createdAt,
        );
      }

      this.database.exec("COMMIT");
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }

  async findById(id: string): Promise<Order | null> {
    return this.orderFromRow(this.database.prepare("SELECT * FROM orders WHERE id = ?").get(id));
  }

  async findByFingerprint(fingerprint: string): Promise<Order | null> {
    return this.orderFromRow(this.database.prepare("SELECT * FROM orders WHERE fingerprint = ?").get(fingerprint));
  }

  async list(): Promise<Order[]> {
    return this.database
      .prepare("SELECT * FROM orders ORDER BY order_date, id")
      .all()
      .map((row) => this.orderFromRow(row))
      .filter((order) => order !== null);
  }

  private orderFromRow(row: unknown): Order | null {
    if (!row) {
      return null;
    }

    const data = row as SqliteRow;
    const orderId = String(data.id);

    return {
      id: orderId,
      merchantId: String(data.merchant_id),
      importRunId: String(data.import_run_id),
      rawRecordId: optionalString(data.raw_record_id),
      externalOrderId: String(data.external_order_id),
      orderDate: String(data.order_date),
      shipmentDate: optionalString(data.shipment_date),
      invoiceDate: optionalString(data.invoice_date),
      status: String(data.status) as Order["status"],
      totalAmount: {
        amountMinor: Number(data.total_amount_minor),
        currency: String(data.currency),
      },
      paymentMethodHint: optionalString(data.payment_method_hint),
      fingerprint: String(data.fingerprint),
      items: this.itemsForOrder(orderId),
      payments: this.paymentsForOrder(orderId),
      createdAt: String(data.created_at),
      updatedAt: String(data.updated_at),
    };
  }

  private itemsForOrder(orderId: string): OrderItem[] {
    return this.database
      .prepare("SELECT * FROM order_items WHERE order_id = ? ORDER BY id")
      .all(orderId)
      .map((row) => {
        const data = row as SqliteRow;
        return {
          id: String(data.id),
          orderId: String(data.order_id),
          title: String(data.title),
          asin: optionalString(data.asin),
          quantity: Number(data.quantity),
          unitPrice:
            data.unit_price_minor === null
              ? undefined
              : { amountMinor: Number(data.unit_price_minor), currency: String(data.currency) },
          totalPrice: {
            amountMinor: Number(data.total_price_minor),
            currency: String(data.currency),
          },
          itemType: String(data.item_type) as OrderItem["itemType"],
          createdAt: String(data.created_at),
          updatedAt: String(data.updated_at),
        };
      });
  }

  private paymentsForOrder(orderId: string): OrderPayment[] {
    return this.database
      .prepare("SELECT * FROM order_payments WHERE order_id = ? ORDER BY id")
      .all(orderId)
      .map((row) => {
        const data = row as SqliteRow;
        return {
          id: String(data.id),
          orderId: String(data.order_id),
          paymentDate: optionalString(data.payment_date),
          amount: {
            amountMinor: Number(data.amount_minor),
            currency: String(data.currency),
          },
          paymentMethodHint: optionalString(data.payment_method_hint),
          externalPaymentId: optionalString(data.external_payment_id),
          createdAt: String(data.created_at),
        };
      });
  }
}

class SqliteMatchRepository implements MatchRepository {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  async save(match: TransactionOrderMatch): Promise<void> {
    this.database
      .prepare(`
        INSERT INTO transaction_order_matches (
          id, bank_transaction_id, order_id, order_payment_id, status, match_type,
          confidence_score, amount_delta_minor, date_delta_days, reason, rules_json,
          created_by, created_at, confirmed_at, rejected_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          bank_transaction_id = excluded.bank_transaction_id,
          order_id = excluded.order_id,
          order_payment_id = excluded.order_payment_id,
          status = excluded.status,
          match_type = excluded.match_type,
          confidence_score = excluded.confidence_score,
          amount_delta_minor = excluded.amount_delta_minor,
          date_delta_days = excluded.date_delta_days,
          reason = excluded.reason,
          rules_json = excluded.rules_json,
          created_by = excluded.created_by,
          created_at = excluded.created_at,
          confirmed_at = excluded.confirmed_at,
          rejected_at = excluded.rejected_at
      `)
      .run(
        match.id,
        match.bankTransactionId,
        match.orderId,
        match.orderPaymentId ?? null,
        match.status,
        match.matchType,
        match.confidenceScore,
        match.amountDeltaMinor,
        match.dateDeltaDays ?? null,
        match.reason,
        JSON.stringify(match.rules),
        match.createdBy,
        match.createdAt,
        match.confirmedAt ?? null,
        match.rejectedAt ?? null,
      );
  }

  async findById(id: string): Promise<TransactionOrderMatch | null> {
    return matchFromRow(this.database.prepare("SELECT * FROM transaction_order_matches WHERE id = ?").get(id));
  }

  async findByTransactionAndOrder(bankTransactionId: string, orderId: string): Promise<TransactionOrderMatch[]> {
    return this.database
      .prepare(`
        SELECT * FROM transaction_order_matches
        WHERE bank_transaction_id = ? AND order_id = ?
        ORDER BY created_at, id
      `)
      .all(bankTransactionId, orderId)
      .map((row) => matchFromRow(row))
      .filter((match) => match !== null);
  }

  async list(): Promise<TransactionOrderMatch[]> {
    return this.database
      .prepare("SELECT * FROM transaction_order_matches ORDER BY created_at, id")
      .all()
      .map((row) => matchFromRow(row))
      .filter((match) => match !== null);
  }
}

function dataSourceFromRow(row: unknown): DataSource | null {
  if (!row) {
    return null;
  }

  const data = row as SqliteRow;
  return {
    id: String(data.id),
    kind: String(data.kind) as DataSource["kind"],
    provider: String(data.provider),
    sourceType: String(data.source_type) as DataSource["sourceType"],
    displayName: String(data.display_name),
    config: JSON.parse(String(data.config_json)) as Record<string, unknown>,
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
  };
}

function importRunFromRow(row: unknown): ImportRun | null {
  if (!row) {
    return null;
  }

  const data = row as SqliteRow;
  return {
    id: String(data.id),
    dataSourceId: String(data.data_source_id),
    sourceKind: String(data.source_kind) as ImportRun["sourceKind"],
    inputType: String(data.input_type) as ImportRun["inputType"],
    fileName: optionalString(data.file_name),
    fileHash: optionalString(data.file_hash),
    parserName: String(data.parser_name),
    parserVersion: String(data.parser_version),
    status: String(data.status) as ImportRun["status"],
    startedAt: String(data.started_at),
    finishedAt: optionalString(data.finished_at),
    recordsSeen: Number(data.records_seen),
    recordsImported: Number(data.records_imported),
    recordsFailed: Number(data.records_failed),
    errorSummary: optionalString(data.error_summary),
  };
}

function rawRecordFromRow(row: unknown): RawRecord | null {
  if (!row) {
    return null;
  }

  const data = row as SqliteRow;
  return {
    id: String(data.id),
    importRunId: String(data.import_run_id),
    recordType: String(data.record_type) as RawRecord["recordType"],
    externalId: optionalString(data.external_id),
    lineNumber: data.line_number === null ? undefined : Number(data.line_number),
    rawPayload: JSON.parse(String(data.raw_payload_json)) as unknown,
    payloadHash: String(data.payload_hash),
    parseStatus: String(data.parse_status) as RawRecord["parseStatus"],
    parseError: optionalString(data.parse_error),
    createdAt: String(data.created_at),
  };
}

function bankTransactionFromRow(row: unknown): BankTransaction | null {
  if (!row) {
    return null;
  }

  const data = row as SqliteRow;
  return {
    id: String(data.id),
    bankAccountId: String(data.bank_account_id),
    importRunId: String(data.import_run_id),
    rawRecordId: optionalString(data.raw_record_id),
    externalTransactionId: optionalString(data.external_transaction_id),
    bookingDate: String(data.booking_date),
    valueDate: optionalString(data.value_date),
    amount: {
      amountMinor: Number(data.amount_minor),
      currency: String(data.currency),
    },
    direction: String(data.direction) as BankTransaction["direction"],
    counterpartyName: optionalString(data.counterparty_name),
    description: String(data.description),
    reference: optionalString(data.reference),
    merchantHint: optionalString(data.merchant_hint),
    fingerprint: String(data.fingerprint),
    createdAt: String(data.created_at),
    updatedAt: String(data.updated_at),
  };
}

function matchFromRow(row: unknown): TransactionOrderMatch | null {
  if (!row) {
    return null;
  }

  const data = row as SqliteRow;
  return {
    id: String(data.id),
    bankTransactionId: String(data.bank_transaction_id),
    orderId: String(data.order_id),
    orderPaymentId: optionalString(data.order_payment_id),
    status: String(data.status) as TransactionOrderMatch["status"],
    matchType: String(data.match_type) as TransactionOrderMatch["matchType"],
    confidenceScore: Number(data.confidence_score),
    amountDeltaMinor: Number(data.amount_delta_minor),
    dateDeltaDays: data.date_delta_days === null ? undefined : Number(data.date_delta_days),
    reason: String(data.reason),
    rules: JSON.parse(String(data.rules_json)) as Record<string, unknown>,
    createdBy: String(data.created_by) as TransactionOrderMatch["createdBy"],
    createdAt: String(data.created_at),
    confirmedAt: optionalString(data.confirmed_at),
    rejectedAt: optionalString(data.rejected_at),
  };
}

function optionalString(value: unknown): string | undefined {
  if (value === null || value === undefined) {
    return undefined;
  }

  const text = String(value);
  return text ? text : undefined;
}
