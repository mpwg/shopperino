import { createShopperinoServer } from "./server.ts";
import { createStoreFromEnv } from "./store.ts";

const host = process.env.HOST ?? "127.0.0.1";
const port = Number.parseInt(process.env.PORT ?? "3000", 10);
const configuredStore = createStoreFromEnv();
const server = createShopperinoServer({ store: configuredStore.store });

server.listen(port, host, () => {
  const address = server.address();
  const actualPort = typeof address === "object" && address ? address.port : port;
  console.log(`shopperino server listening on http://${host}:${actualPort}`);
});

function shutdown(): void {
  server.close(() => {
    configuredStore.close?.();
  });
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
