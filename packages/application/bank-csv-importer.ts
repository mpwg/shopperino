import { randomUUID } from "node:crypto";
import type { CreateBankTransactionInput } from "../core/bank-transaction.ts";
import type { Importer, ImportSource } from "./ports.ts";
import {
  createBankTransactionUseCase,
  executeImportUseCase,
  type ExecuteImportResult,
  type UseCaseContext,
} from "./use-cases.ts";

export type BankCsvColumnName =
  | "bookingDate"
  | "description"
  | "valueDate"
  | "amount"
  | "currency"
  | "externalTransactionId";

export type BankCsvProfile = {
  bankAccountId: string;
  delimiter: string;
  hasHeader: boolean;
  columns: Record<BankCsvColumnName, number>;
};

export type BankCsvTransactionPayload = Omit<CreateBankTransactionInput, "id" | "importRunId" | "rawRecordId">;

export type ImportBankCsvInput = {
  source: ImportSource;
  profile?: Partial<BankCsvProfile>;
  idFactory?: () => string;
  now?: () => string;
};

export const defaultBankCsvProfile: BankCsvProfile = {
  bankAccountId: "bank-account-default",
  delimiter: ";",
  hasHeader: false,
  columns: {
    bookingDate: 0,
    description: 1,
    valueDate: 2,
    amount: 3,
    currency: 4,
    externalTransactionId: 5,
  },
};

export function createBankCsvImporter(profileInput: Partial<BankCsvProfile> = {}): Importer<BankCsvTransactionPayload> {
  const profile = mergeBankCsvProfile(profileInput);

  return {
    name: "bank-csv",
    version: "1.0.0",
    sourceKind: "bank",
    inputType: "csv",
    parse: (source) => parseBankCsv(source, profile),
  };
}

export async function importBankCsvUseCase(
  context: UseCaseContext,
  input: ImportBankCsvInput,
): Promise<ExecuteImportResult<BankCsvTransactionPayload>> {
  return executeImportUseCase(context, {
    importer: createBankCsvImporter(input.profile),
    source: input.source,
    idFactory: input.idFactory,
    now: input.now,
    persistParsedRecord: async (record, { importRun, rawRecord }) => {
      await createBankTransactionUseCase(context, {
        ...record.normalized,
        id: input.idFactory?.() ?? randomUUID(),
        importRunId: importRun.id,
        rawRecordId: rawRecord.id,
      });
    },
  });
}

function parseBankCsv(source: ImportSource, profile: BankCsvProfile) {
  const rows = parseDelimitedRows(payloadToText(source.payload), profile.delimiter);
  const dataRows = profile.hasHeader ? rows.slice(1) : rows;
  const lineOffset = profile.hasHeader ? 2 : 1;
  const parsed = [];
  const failed = [];

  for (const [index, row] of dataRows.entries()) {
    const lineNumber = index + lineOffset;

    if (row.every((cell) => cell.trim() === "")) {
      continue;
    }

    try {
      const description = requiredCell(row, profile.columns.description, "description");
      const amount = parseAmount(requiredCell(row, profile.columns.amount, "amount"));
      const currency = requiredCell(row, profile.columns.currency, "currency").toUpperCase();
      const externalId = optionalCell(row, profile.columns.externalTransactionId);

      parsed.push({
        recordType: "bank_transaction" as const,
        lineNumber,
        externalId,
        rawPayload: row,
        normalized: {
          bankAccountId: profile.bankAccountId,
          bookingDate: parseDate(requiredCell(row, profile.columns.bookingDate, "bookingDate")),
          valueDate: parseDate(optionalCell(row, profile.columns.valueDate)),
          amountMinor: Math.abs(amount),
          currency,
          direction: amount < 0 ? "debit" as const : "credit" as const,
          counterpartyName: extractCounterparty(description),
          description,
          reference: extractReference(description),
          externalTransactionId: externalId,
        },
      });
    } catch (error) {
      failed.push({
        recordType: "bank_transaction" as const,
        lineNumber,
        rawPayload: row,
        error: error instanceof Error ? error.message : String(error),
      });
    }
  }

  return { parsed, failed };
}

function mergeBankCsvProfile(input: Partial<BankCsvProfile>): BankCsvProfile {
  return {
    ...defaultBankCsvProfile,
    ...input,
    columns: {
      ...defaultBankCsvProfile.columns,
      ...input.columns,
    },
  };
}

function payloadToText(payload: unknown): string {
  if (typeof payload === "string") {
    return payload.replace(/^\uFEFF/, "");
  }

  if (payload instanceof Uint8Array) {
    return new TextDecoder().decode(payload).replace(/^\uFEFF/, "");
  }

  if (typeof payload === "object" && payload !== null && "text" in payload) {
    const text = (payload as { text?: unknown }).text;
    if (typeof text === "string") {
      return text.replace(/^\uFEFF/, "");
    }
  }

  throw new Error("Bank CSV payload must be a string, Uint8Array, or object with text");
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
    throw new Error("Bank CSV contains an unclosed quoted field");
  }

  if (cell !== "" || row.length > 0) {
    row.push(cell);
    rows.push(row);
  }

  return rows;
}

function requiredCell(row: string[], index: number, fieldName: string): string {
  const value = optionalCell(row, index);
  if (!value) {
    throw new Error(`missing ${fieldName}`);
  }

  return value;
}

function optionalCell(row: string[], index: number): string | undefined {
  const value = row[index]?.trim();
  return value ? value : undefined;
}

function parseDate(value: string | undefined): string | undefined {
  if (!value) {
    return undefined;
  }

  const match = /^(?<day>\d{2})\.(?<month>\d{2})\.(?<year>\d{4})$/.exec(value.trim());
  if (!match?.groups) {
    throw new Error(`invalid date: ${value}`);
  }

  return `${match.groups.year}-${match.groups.month}-${match.groups.day}`;
}

function parseAmount(value: string): number {
  const normalized = value.trim().replace(/\s/g, "").replace(/\./g, "").replace(",", ".");
  const amount = Number(normalized);

  if (!Number.isFinite(amount) || amount === 0) {
    throw new Error(`invalid amount: ${value}`);
  }

  return Math.round(amount * 100);
}

function extractCounterparty(description: string): string | undefined {
  return extractFirst(
    description,
    /(?:Zahlungsempfaenger|Zahlungsempfänger|Empfaenger|Empfänger):\s*(.+?)(?=\s+(?:Zahlungsreferenz|Verwendungszweck|IBAN|BIC|Auftraggeberreferenz|Empfaenger-Kennung|Empfänger-Kennung|Mandat|Creditor_ID)\b|$)/iu,
  );
}

function extractReference(description: string): string | undefined {
  return (
    extractFirst(
      description,
      /Verwendungszweck:\s*(.+?)(?=\s+(?:Zahlungsreferenz|IBAN|BIC|Auftraggeberreferenz|Empfaenger|Empfänger|Zahlungsempfaenger|Zahlungsempfänger)\b|$)/iu,
    ) ??
    extractFirst(
      description,
      /Zahlungsreferenz:\s*(.+?)(?=\s+(?:Verwendungszweck|IBAN|BIC|Auftraggeberreferenz|Empfaenger|Empfänger|Zahlungsempfaenger|Zahlungsempfänger)\b|$)/iu,
    )
  );
}

function extractFirst(value: string, pattern: RegExp): string | undefined {
  const match = pattern.exec(value);
  return match?.[1]?.trim() || undefined;
}
