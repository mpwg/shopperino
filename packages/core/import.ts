import { stableFingerprint } from "./fingerprint.ts";

export type DataSourceKind = "bank" | "orders";
export type DataSourceType = "csv" | "api" | "manual";

export type DataSource = {
  id: string;
  kind: DataSourceKind;
  provider: string;
  sourceType: DataSourceType;
  displayName: string;
  config: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
};

export type CreateDataSourceInput = {
  id: string;
  kind: DataSourceKind;
  provider: string;
  sourceType: DataSourceType;
  displayName: string;
  config?: Record<string, unknown>;
  createdAt?: string;
  updatedAt?: string;
};

export type ImportInputType = "csv" | "api" | "json" | "html" | "pdf" | "manual";
export type ImportRunStatus = "pending" | "running" | "completed" | "completed_with_errors" | "failed";

export type ImportRun = {
  id: string;
  dataSourceId: string;
  sourceKind: DataSourceKind;
  inputType: ImportInputType;
  fileName?: string;
  fileHash?: string;
  parserName: string;
  parserVersion: string;
  status: ImportRunStatus;
  startedAt: string;
  finishedAt?: string;
  recordsSeen: number;
  recordsImported: number;
  recordsFailed: number;
  errorSummary?: string;
};

export type CreateImportRunInput = {
  id: string;
  dataSourceId: string;
  sourceKind: DataSourceKind;
  inputType: ImportInputType;
  fileName?: string;
  fileHash?: string;
  parserName: string;
  parserVersion: string;
  status: ImportRunStatus;
  startedAt?: string;
  finishedAt?: string;
  recordsSeen?: number;
  recordsImported?: number;
  recordsFailed?: number;
  errorSummary?: string;
};

export type RawRecordType = "bank_transaction" | "order" | "order_item" | "payment" | "refund" | "unknown";
export type RawRecordParseStatus = "parsed" | "skipped" | "failed";

export type RawRecord = {
  id: string;
  importRunId: string;
  recordType: RawRecordType;
  externalId?: string;
  lineNumber?: number;
  rawPayload: unknown;
  payloadHash: string;
  parseStatus: RawRecordParseStatus;
  parseError?: string;
  createdAt: string;
};

export type CreateRawRecordInput = {
  id: string;
  importRunId: string;
  recordType: RawRecordType;
  externalId?: string;
  lineNumber?: number;
  rawPayload: unknown;
  payloadHash?: string;
  parseStatus: RawRecordParseStatus;
  parseError?: string;
  createdAt?: string;
};

export function createDataSource(input: CreateDataSourceInput): DataSource {
  const now = new Date().toISOString();

  return {
    id: requireNonBlank(input.id, "id"),
    kind: requireDataSourceKind(input.kind),
    provider: requireNonBlank(input.provider, "provider"),
    sourceType: requireDataSourceType(input.sourceType),
    displayName: requireNonBlank(input.displayName, "displayName"),
    config: structuredClone(input.config ?? {}),
    createdAt: input.createdAt ?? now,
    updatedAt: input.updatedAt ?? now,
  };
}

export function createImportRun(input: CreateImportRunInput): ImportRun {
  return {
    id: requireNonBlank(input.id, "id"),
    dataSourceId: requireNonBlank(input.dataSourceId, "dataSourceId"),
    sourceKind: requireDataSourceKind(input.sourceKind),
    inputType: requireImportInputType(input.inputType),
    fileName: optionalTrimmed(input.fileName),
    fileHash: optionalTrimmed(input.fileHash),
    parserName: requireNonBlank(input.parserName, "parserName"),
    parserVersion: requireNonBlank(input.parserVersion, "parserVersion"),
    status: requireImportRunStatus(input.status),
    startedAt: input.startedAt ?? new Date().toISOString(),
    finishedAt: optionalTrimmed(input.finishedAt),
    recordsSeen: requireNonNegativeInteger(input.recordsSeen ?? 0, "recordsSeen"),
    recordsImported: requireNonNegativeInteger(input.recordsImported ?? 0, "recordsImported"),
    recordsFailed: requireNonNegativeInteger(input.recordsFailed ?? 0, "recordsFailed"),
    errorSummary: optionalTrimmed(input.errorSummary),
  };
}

export function createRawRecord(input: CreateRawRecordInput): RawRecord {
  return {
    id: requireNonBlank(input.id, "id"),
    importRunId: requireNonBlank(input.importRunId, "importRunId"),
    recordType: requireRawRecordType(input.recordType),
    externalId: optionalTrimmed(input.externalId),
    lineNumber:
      input.lineNumber === undefined ? undefined : requirePositiveInteger(input.lineNumber, "lineNumber"),
    rawPayload: structuredClone(input.rawPayload),
    payloadHash: input.payloadHash ?? stableFingerprint(input.rawPayload),
    parseStatus: requireRawRecordParseStatus(input.parseStatus),
    parseError: optionalTrimmed(input.parseError),
    createdAt: input.createdAt ?? new Date().toISOString(),
  };
}

function requireDataSourceKind(value: string): DataSourceKind {
  if (value !== "bank" && value !== "orders") {
    throw new Error("data source kind must be bank or orders");
  }

  return value;
}

function requireDataSourceType(value: string): DataSourceType {
  if (value !== "csv" && value !== "api" && value !== "manual") {
    throw new Error("data source type must be csv, api or manual");
  }

  return value;
}

function requireImportInputType(value: string): ImportInputType {
  if (
    value !== "csv" &&
    value !== "api" &&
    value !== "json" &&
    value !== "html" &&
    value !== "pdf" &&
    value !== "manual"
  ) {
    throw new Error("import input type is invalid");
  }

  return value;
}

function requireImportRunStatus(value: string): ImportRunStatus {
  if (
    value !== "pending" &&
    value !== "running" &&
    value !== "completed" &&
    value !== "completed_with_errors" &&
    value !== "failed"
  ) {
    throw new Error("import run status is invalid");
  }

  return value;
}

function requireRawRecordType(value: string): RawRecordType {
  if (
    value !== "bank_transaction" &&
    value !== "order" &&
    value !== "order_item" &&
    value !== "payment" &&
    value !== "refund" &&
    value !== "unknown"
  ) {
    throw new Error("raw record type is invalid");
  }

  return value;
}

function requireRawRecordParseStatus(value: string): RawRecordParseStatus {
  if (value !== "parsed" && value !== "skipped" && value !== "failed") {
    throw new Error("raw record parse status is invalid");
  }

  return value;
}

function requireNonBlank(value: string, fieldName: string): string {
  const trimmed = value.trim();
  if (!trimmed) {
    throw new Error(`${fieldName} must not be blank`);
  }

  return trimmed;
}

function requireNonNegativeInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0) {
    throw new Error(`${fieldName} must be a non-negative integer`);
  }

  return value;
}

function requirePositiveInteger(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${fieldName} must be a positive integer`);
  }

  return value;
}

function optionalTrimmed(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  return trimmed ? trimmed : undefined;
}
