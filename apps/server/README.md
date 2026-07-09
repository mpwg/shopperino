# Server Host

Der Server ist der erste Self-hosted Host fuer shopperino. Er bleibt bewusst duenn:
HTTP wird hier terminiert, Fachlogik laeuft ueber Use Cases aus `packages/application`,
und Persistenz wird als Store injiziert.

## Start

```sh
npm run server
```

Konfiguration:

- `HOST`: Bind-Adresse, Standard `127.0.0.1`
- `PORT`: HTTP-Port, Standard `3000`
- `SHOPPERINO_STORE`: `sqlite` oder `memory`, Standard `sqlite`
- `SHOPPERINO_DATABASE_PATH`: SQLite-Datei, Standard `.shopperino/shopperino.db`

## Endpunkte

- `GET /health`
- `GET /api/transactions`
- `POST /api/transactions`
- `GET /api/orders`
- `POST /api/orders`
- `GET /api/matches`
- `POST /api/matches/suggestions`
- `POST /api/matches/:matchId/confirm`
