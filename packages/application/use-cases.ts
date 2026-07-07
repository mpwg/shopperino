import { randomUUID } from "node:crypto";
import {
  confirmMatch,
  createBankTransaction,
  createOrder,
  suggestMatchForPair,
  type BankTransaction,
  type CreateBankTransactionInput,
  type CreateOrderInput,
  type Order,
  type TransactionOrderMatch,
} from "../core/index.ts";
import type { ShopperinoStore } from "./ports.ts";

export type UseCaseContext = {
  store: ShopperinoStore;
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
