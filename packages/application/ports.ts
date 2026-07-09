import type { BankTransaction } from "../core/bank-transaction.ts";
import type {
  DataSource,
  DataSourceKind,
  ImportInputType,
  ImportRun,
  RawRecord,
  RawRecordType,
} from "../core/import.ts";
import type { TransactionOrderMatch } from "../core/match.ts";
import type { Order } from "../core/order.ts";

export type ImportSource = {
  dataSourceId: string;
  inputType: ImportInputType;
  payload: unknown;
  fileName?: string;
  fileHash?: string;
};

export type ParsedImportRecord<TNormalized = unknown> = {
  recordType: RawRecordType;
  rawPayload: unknown;
  normalized: TNormalized;
  externalId?: string;
  lineNumber?: number;
};

export type SkippedImportRecord = {
  recordType?: RawRecordType;
  rawPayload: unknown;
  reason: string;
  externalId?: string;
  lineNumber?: number;
};

export type FailedImportRecord = {
  recordType?: RawRecordType;
  rawPayload: unknown;
  error: string;
  externalId?: string;
  lineNumber?: number;
};

export type ImportParserResult<TNormalized = unknown> = {
  parsed: ParsedImportRecord<TNormalized>[];
  skipped?: SkippedImportRecord[];
  failed?: FailedImportRecord[];
};

export type Importer<TNormalized = unknown> = {
  name: string;
  version: string;
  sourceKind: DataSourceKind;
  inputType: ImportInputType;
  parse(input: ImportSource): Promise<ImportParserResult<TNormalized>> | ImportParserResult<TNormalized>;
};

export type DataSourceRepository = {
  save(dataSource: DataSource): Promise<void>;
  findById(id: string): Promise<DataSource | null>;
  list(): Promise<DataSource[]>;
};

export type ImportRunRepository = {
  save(importRun: ImportRun): Promise<void>;
  findById(id: string): Promise<ImportRun | null>;
  list(): Promise<ImportRun[]>;
  listByDataSourceId(dataSourceId: string): Promise<ImportRun[]>;
};

export type RawRecordRepository = {
  save(rawRecord: RawRecord): Promise<void>;
  findById(id: string): Promise<RawRecord | null>;
  listByImportRunId(importRunId: string): Promise<RawRecord[]>;
};

export type BankTransactionRepository = {
  save(transaction: BankTransaction): Promise<void>;
  findById(id: string): Promise<BankTransaction | null>;
  findByFingerprint(fingerprint: string): Promise<BankTransaction | null>;
  list(): Promise<BankTransaction[]>;
};

export type OrderRepository = {
  save(order: Order): Promise<void>;
  findById(id: string): Promise<Order | null>;
  findByFingerprint(fingerprint: string): Promise<Order | null>;
  list(): Promise<Order[]>;
};

export type MatchRepository = {
  save(match: TransactionOrderMatch): Promise<void>;
  findById(id: string): Promise<TransactionOrderMatch | null>;
  findByTransactionAndOrder(bankTransactionId: string, orderId: string): Promise<TransactionOrderMatch[]>;
  list(): Promise<TransactionOrderMatch[]>;
};

export type ShopperinoStore = {
  dataSources: DataSourceRepository;
  importRuns: ImportRunRepository;
  rawRecords: RawRecordRepository;
  bankTransactions: BankTransactionRepository;
  orders: OrderRepository;
  matches: MatchRepository;
};
