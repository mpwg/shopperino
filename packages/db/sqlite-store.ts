import { DatabaseSync } from "node:sqlite";
import type { BankTransaction } from "../core/bank-transaction.ts";
import type { TransactionOrderMatch } from "../core/match.ts";
import type { Order, OrderItem, OrderPayment } from "../core/order.ts";
import type {
  BankTransactionRepository,
  MatchRepository,
  OrderRepository,
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
