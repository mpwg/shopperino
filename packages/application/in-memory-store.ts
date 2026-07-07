import type { BankTransaction } from "../core/bank-transaction.ts";
import type { TransactionOrderMatch } from "../core/match.ts";
import type { Order } from "../core/order.ts";
import type {
  BankTransactionRepository,
  MatchRepository,
  OrderRepository,
  ShopperinoStore,
} from "./ports.ts";

export class InMemoryBankTransactionRepository implements BankTransactionRepository {
  private readonly items = new Map<string, BankTransaction>();

  async save(transaction: BankTransaction): Promise<void> {
    this.items.set(transaction.id, structuredClone(transaction));
  }

  async findById(id: string): Promise<BankTransaction | null> {
    return cloneOrNull(this.items.get(id));
  }

  async findByFingerprint(fingerprint: string): Promise<BankTransaction | null> {
    for (const transaction of this.items.values()) {
      if (transaction.fingerprint === fingerprint) {
        return structuredClone(transaction);
      }
    }

    return null;
  }

  async list(): Promise<BankTransaction[]> {
    return Array.from(this.items.values()).map((item) => structuredClone(item));
  }
}

export class InMemoryOrderRepository implements OrderRepository {
  private readonly items = new Map<string, Order>();

  async save(order: Order): Promise<void> {
    this.items.set(order.id, structuredClone(order));
  }

  async findById(id: string): Promise<Order | null> {
    return cloneOrNull(this.items.get(id));
  }

  async findByFingerprint(fingerprint: string): Promise<Order | null> {
    for (const order of this.items.values()) {
      if (order.fingerprint === fingerprint) {
        return structuredClone(order);
      }
    }

    return null;
  }

  async list(): Promise<Order[]> {
    return Array.from(this.items.values()).map((item) => structuredClone(item));
  }
}

export class InMemoryMatchRepository implements MatchRepository {
  private readonly items = new Map<string, TransactionOrderMatch>();

  async save(match: TransactionOrderMatch): Promise<void> {
    this.items.set(match.id, structuredClone(match));
  }

  async findById(id: string): Promise<TransactionOrderMatch | null> {
    return cloneOrNull(this.items.get(id));
  }

  async findByTransactionAndOrder(bankTransactionId: string, orderId: string): Promise<TransactionOrderMatch[]> {
    return Array.from(this.items.values())
      .filter((match) => match.bankTransactionId === bankTransactionId && match.orderId === orderId)
      .map((match) => structuredClone(match));
  }

  async list(): Promise<TransactionOrderMatch[]> {
    return Array.from(this.items.values()).map((item) => structuredClone(item));
  }
}

export function createInMemoryStore(): ShopperinoStore {
  return {
    bankTransactions: new InMemoryBankTransactionRepository(),
    orders: new InMemoryOrderRepository(),
    matches: new InMemoryMatchRepository(),
  };
}

function cloneOrNull<T>(value: T | undefined): T | null {
  return value ? structuredClone(value) : null;
}
