import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { createInMemoryStore, type ShopperinoStore } from "../../packages/application/index.ts";
import { createSqliteStore, type SqliteShopperinoStore } from "../../packages/db/index.ts";

export type ConfiguredStore = {
  store: ShopperinoStore;
  close?: () => void;
};

export function createStoreFromEnv(env: Record<string, string | undefined> = process.env): ConfiguredStore {
  const storeKind = env.SHOPPERINO_STORE ?? "sqlite";

  if (storeKind === "memory") {
    return { store: createInMemoryStore() };
  }

  if (storeKind !== "sqlite") {
    throw new Error("SHOPPERINO_STORE must be sqlite or memory");
  }

  const databasePath = resolve(env.SHOPPERINO_DATABASE_PATH ?? ".shopperino/shopperino.db");
  mkdirSync(dirname(databasePath), { recursive: true });

  const store = createSqliteStore(databasePath);
  return {
    store,
    close: () => (store as SqliteShopperinoStore).close(),
  };
}
