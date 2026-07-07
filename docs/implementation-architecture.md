# Implementierungsarchitektur

Dieses Dokument beschreibt die erste technische Umsetzung der shopperino-Architektur. Es ergänzt die fachliche [Architektur](architecture.md) und das [Datenmodell](data-model.md).

## Grundentscheidung

shopperino wird als Core-first TypeScript-Anwendung aufgebaut.

Das bedeutet:

- Fachlogik liegt in einem wiederverwendbaren Core
- Hosts wie Web-Server, Desktop-App oder Mobile-App binden den Core nur ein
- Datenbanken werden über Ports angesprochen
- SQLite ist der erste Adapter, aber nicht Teil der Fachlogik
- Tests laufen ohne Netzwerk und ohne externe Services

## Paketstruktur

```text
packages/
  core/             # Domain-Modelle, Value Objects, Matching-Logik
  application/      # Use Cases, Repository-Ports, In-Memory-Store
  db/               # Persistenzadapter, zuerst SQLite

apps/
  server/           # Self-hosted Server-Host
  desktop/          # spaeterer Tauri Host

tests/              # Domain-, Use-Case- und Store-Contract-Tests
```

## Dependency-Regeln

Die Abhängigkeiten laufen nur in eine Richtung:

```text
apps/* -> packages/application -> packages/core
apps/* -> packages/db -> packages/application
packages/db -> packages/core
```

Nicht erlaubt:

- `packages/core` importiert aus `packages/application`, `packages/db` oder `apps`
- `packages/application` importiert aus `packages/db` oder `apps`
- Use Cases greifen direkt auf SQLite zu
- HTTP-, UI- oder Desktop-Code enthält Fachlogik

## Domain und Use Cases

`packages/core` enthält reine Fachlogik:

- `Money`
- `BankTransaction`
- `Order`
- `OrderItem`
- `OrderPayment`
- `TransactionOrderMatch`
- Matching-Regeln

`packages/application` enthält Use Cases:

- Banktransaktion anlegen
- Bestellung anlegen
- Match-Vorschläge berechnen
- Match bestätigen

Use Cases sprechen nur mit Repository-Ports. Dadurch können Tests den `InMemoryStore` nutzen, während die Anwendung später SQLite oder PostgreSQL verwenden kann.

## DB-Austauschbarkeit

Der DB-Layer wird über diese Ports gekapselt:

- `BankTransactionRepository`
- `OrderRepository`
- `MatchRepository`
- `ShopperinoStore`

Der SQLite-Adapter in `packages/db` implementiert diese Ports mit `node:sqlite`. Ein späterer PostgreSQL-Adapter muss dieselben Ports implementieren. Store-Contract-Tests prüfen, dass In-Memory und SQLite gleiches Verhalten liefern.

## Runtime und Tests

Die erste Implementierung nutzt keine Runtime-Dependencies.

Vorgaben:

- Node.js 24.18 oder neuer
- TypeScript-Dateien werden mit `--experimental-strip-types` ausgeführt
- SQLite läuft über `--experimental-sqlite`
- Tests laufen mit dem Node Test Runner

Testaufruf:

```text
npm test
```

## Host-Modell

### Self-hosted Server

Der Server-Host wird später HTTP, Uploads und statische UI-Auslieferung übernehmen. Er soll Use Cases aus `packages/application` aufrufen und einen Store aus `packages/db` injizieren.

### Desktop

Desktop wird als Tauri-Ziel geplant. Tauri soll den gleichen Core verwenden und lokal mit SQLite arbeiten. Im ersten Schritt wird noch keine Tauri-App gebaut.

### Mobile

Mobile bleibt ein späterer Host. Die Architektur erlaubt sowohl eine lokale Core-Nutzung als auch eine API-basierte App. Die Entscheidung wird erst getroffen, wenn konkrete Mobile-Anforderungen feststehen.

## Leitlinien fuer neue Implementierung

- Erst Core- oder Use-Case-Test schreiben, dann Adapter anschließen
- DB-Zugriff nur in `packages/db`
- keine globale Datenbankverbindung in der Fachlogik
- neue Persistenzadapter gegen die Store-Contract-Tests laufen lassen
- automatische Entscheidungen mit Score und Begründung modellieren
