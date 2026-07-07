# Architektur

Dieses Dokument beschreibt die grundlegende Architektur von shopperino. Es legt fest, wie Bankdaten und Amazon-Bestellungen importiert, normalisiert, miteinander verknüpft und in der Oberfläche ausgewertet werden sollen.

shopperino ist eine selbst gehostete Anwendung für private Ausgabentransparenz. Die Architektur ist deshalb auf lokale Datenkontrolle, nachvollziehbare Verarbeitung und einfache Wartbarkeit ausgelegt.

## Ziele

- Banktransaktionen und Amazon-Bestellungen in einem gemeinsamen Datenmodell zusammenführen
- Ausgaben nachvollziehbar, durchsuchbar und auswertbar machen
- Importierte Rohdaten nachvollziehbar speichern, damit Zuordnungen später überprüft oder neu berechnet werden können
- Automatische Zuordnungen ermöglichen, aber manuelle Korrekturen immer erlauben
- Self-hosted-Betrieb per Docker mit möglichst wenig Betriebsaufwand unterstützen

## Nicht-Ziele

- shopperino ist kein Banking-System und führt keine Zahlungen aus
- shopperino ist kein Buchhaltungssystem mit steuerlicher oder rechtlicher Vollständigkeit
- shopperino soll keine Bankzugänge verwalten, sondern zunächst Datei-Exporte importieren
- shopperino soll im MVP keine Multi-Tenant-SaaS-Anwendung sein

## Architekturüberblick

shopperino wird als Core-first-Anwendung aufgebaut. Der fachliche Core ist unabhängig von HTTP, UI und konkreter Datenbank. Dadurch kann dieselbe Logik in mehreren Hosts laufen:

- Self-hosted Web-App im Docker-Container
- lokale Desktop-App, bevorzugt mit Tauri
- spätere Mobile-App oder API-basierte Mobile-Oberfläche

Die Anwendung besteht aus fünf fachlichen Schichten:

1. Benutzeroberfläche
2. HTTP-API
3. Anwendungslogik
4. Import- und Matching-Pipeline
5. Persistenz

```text
Browser
  |
  v
Web UI / Desktop UI / Mobile UI
  |
  v
Host Adapter
  |
  v
Application Use Cases
  |
  +--> Import Services
  |      +--> Bank Importer
  |      +--> Amazon Importer
  |
  +--> Normalization Services
  |
  +--> Matching Engine
  |
  +--> Category Engine
  |
  +--> Query/Reporting Services
  |
  v
Repository Ports
  |
  v
Database + File Storage Adapter
```

Die Schichten sollen fachlich klar getrennt bleiben. Importer lesen externe Formate, Normalizer erzeugen interne Modelle, die Matching Engine verknüpft Datensätze, und Reporting Services liefern vorbereitete Sichten für Dashboard, Suche und Auswertungen.

Die konkrete Implementierungsstruktur ist in [Implementierungsarchitektur](implementation-architecture.md) beschrieben.

## Datenfluss

Der zentrale Datenfluss folgt immer demselben Muster:

1. Datei importieren
2. Rohdaten speichern
3. Daten parsen
4. Daten normalisieren
5. Duplikate erkennen
6. Banktransaktionen und Bestellungen matchen
7. Kategorien berechnen oder vorschlagen
8. Ergebnisse in UI und Reports anzeigen
9. Manuelle Korrekturen speichern

Rohdaten und normalisierte Daten werden getrennt gespeichert. Dadurch bleibt nachvollziehbar, welche importierte Datei zu welchem Datensatz geführt hat. Außerdem können Parser, Matching-Regeln und Kategorien später verbessert und auf bestehende Daten erneut angewendet werden.

## Kernmodule

### Web UI

Die Weboberfläche ist die primäre Interaktionsebene.

Aufgaben:

- Dateien hochladen
- Importstatus anzeigen
- Transaktionen, Bestellungen und Matches durchsuchen
- automatische Zuordnungen bestätigen oder korrigieren
- Kategorien pflegen
- Dashboards und Auswertungen anzeigen

Die UI sollte nicht die Fachlogik enthalten. Sie ruft API-Endpunkte auf und stellt die vom Backend berechneten Sichten dar.

### HTTP API

Die API bildet die Grenze zwischen UI und Backend.

Aufgaben:

- Uploads entgegennehmen
- Importvorgänge starten
- Datenlisten und Detailansichten liefern
- manuelle Matches und Kategorien speichern
- Statistiken und Reports bereitstellen

Die API sollte fachliche Use Cases ausdrücken, nicht direkt Datenbanktabellen spiegeln.

### Import Services

Import Services sind für externe Datenformate zuständig.

Bank Importer:

- verarbeitet Konto- und Kreditkartenexporte
- unterstützt später mehrere Formate pro Bank
- extrahiert Buchungsdatum, Valutadatum, Betrag, Währung, Empfänger, Verwendungszweck und Referenzen

Amazon Importer:

- verarbeitet Amazon-Bestelldaten
- extrahiert Bestellungen, Bestellpositionen, Versandkosten, Rabatte, Erstattungen und Zahlungsinformationen, soweit verfügbar
- bewahrt Bestellnummern und externe Referenzen für Matching und Nachvollziehbarkeit auf

Importer sollen möglichst wenig Fachentscheidungen treffen. Ihre Aufgabe ist das robuste Lesen und Strukturieren externer Daten.

### Normalization Services

Normalizer überführen importierte Daten in ein stabiles internes Modell.

Aufgaben:

- Datumswerte, Beträge und Währungen vereinheitlichen
- Händler- und Empfängernamen bereinigen
- eindeutige Fingerprints für Duplikaterkennung erzeugen
- unvollständige oder mehrdeutige Daten markieren

Die normalisierten Daten sind die Grundlage für Suche, Matching und Auswertungen.

### Matching Engine

Die Matching Engine verknüpft Banktransaktionen mit Amazon-Bestellungen.

MVP-Regeln:

- Betrag stimmt exakt überein
- Buchungsdatum liegt nahe am Bestell- oder Versanddatum
- Empfänger oder Verwendungszweck enthält erkennbare Amazon-Hinweise
- bekannte Bestellnummern oder Zahlungsreferenzen werden bevorzugt

Spätere Regeln:

- Teilzahlungen
- Sammelbuchungen
- Erstattungen
- Gutscheine und Rabatte
- mehrere Bestellungen pro Bankbuchung
- eine Bestellung mit mehreren Zahlungen

Jeder Match bekommt einen Status und eine Begründung.

Beispielstatus:

- `suggested`: automatisch vorgeschlagen
- `confirmed`: vom Nutzer bestätigt
- `rejected`: vom Nutzer abgelehnt
- `manual`: manuell angelegt

Automatische Matches dürfen manuelle Entscheidungen nicht überschreiben.

### Category Engine

Die Category Engine ordnet Ausgaben Kategorien zu.

Quellen:

- Produktdaten aus Amazon-Bestellungen
- Händler oder Empfänger aus Banktransaktionen
- manuelle Regeln des Nutzers
- wiederkehrende Muster

Kategorien sollten ebenfalls nachvollziehbar sein. Eine Kategorie kann automatisch vorgeschlagen oder manuell gesetzt sein.

### Query und Reporting Services

Diese Services bereiten Daten für UI und Auswertungen auf.

Beispiele:

- monatliche Ausgaben
- Ausgaben nach Kategorie
- Ausgaben nach Händler
- ungematchte Banktransaktionen
- unvollständige oder unsichere Matches
- wiederkehrende Ausgaben
- Produkthistorie und Preisentwicklung

Reporting sollte nicht direkt auf Rohdaten arbeiten, sondern auf normalisierten und gematchten Daten.

## Datenmodell

Das ausführliche fachliche Datenmodell ist in [Datenmodell](data-model.md) beschrieben.

Die wichtigsten Modellbereiche sind:

- Quellen und Importe
- Bankdaten
- Bestelldaten
- Matching
- Kategorien
- Audit und Verarbeitung

Für den MVP sind insbesondere folgende Entitäten relevant:

- `DataSource`
- `ImportRun`
- `RawRecord`
- `BankAccount`
- `BankTransaction`
- `Merchant`
- `Order`
- `OrderItem`
- `OrderPayment`
- `TransactionOrderMatch`
- `Category`
- `CategoryAssignment`

Das Bestellmodell verwendet bewusst generische Namen wie `Order` und `OrderItem` statt `AmazonOrder`. Amazon ist die erste konkrete Quelle, aber weitere Shops sollen später ohne neues Grundmodell ergänzt werden können.

## Persistenz

Für den MVP ist eine relationale Datenbank sinnvoll, bevorzugt SQLite.

Gründe:

- einfacher Self-hosted-Betrieb
- keine zusätzliche Datenbank-Infrastruktur erforderlich
- gute Unterstützung für Transaktionen und relationale Abfragen
- ausreichend für private Datenmengen

Die Architektur sollte so gestaltet sein, dass später PostgreSQL möglich bleibt. Datenbankzugriff sollte deshalb über eine klare Repository- oder Service-Schicht erfolgen.

Dateien und größere Rohdaten können unter `/data` gespeichert werden. Die Datenbank liegt ebenfalls im persistenten Datenverzeichnis.

Vorgeschlagene Struktur:

```text
/data
  /uploads
  /raw
  /exports
  shopperino.db
```

## Deployment

shopperino soll als einzelner Docker-Container betrieben werden.

Im Container laufen:

- Web UI
- Backend/API
- Import- und Matching-Logik

Persistente Daten liegen außerhalb des Containers in einem Volume.

Minimal benötigte Konfiguration:

- `TZ`
- `APP_URL`
- `PORT`
- `DATA_DIR`

Für den MVP sollte keine externe Infrastruktur erforderlich sein.

## Plattform-Hosts

Die erste Umsetzung priorisiert den fachlichen Core und eine austauschbare Persistenzschicht. Hosts sind dünne Einstiegspunkte:

- `apps/server`: Self-hosted Betrieb mit HTTP-API und Weboberfläche
- `apps/desktop`: lokale Desktop-Verpackung, geplant mit Tauri
- Mobile: späterer Host, der entweder lokal mit einem Core-Subset oder über die Server-API arbeiten kann

Host-Code darf keine Fachlogik enthalten. Er validiert Eingaben, ruft Use Cases auf und stellt Ergebnisse dar.

## Sicherheit und Datenschutz

shopperino verarbeitet sensible Finanz- und Einkaufsdaten. Deshalb gelten folgende Grundregeln:

- Daten bleiben lokal im selbst gehosteten System
- keine Telemetrie ohne explizite Zustimmung
- keine externen API-Aufrufe für private Daten im MVP
- Uploads werden validiert
- Importfehler dürfen keine sensiblen Daten unnötig in Logs schreiben
- Backups müssen dokumentiert und einfach möglich sein

Authentifizierung kann im frühen MVP optional sein, sollte aber architektonisch vorgesehen werden. Sobald shopperino nicht nur lokal im Heimnetz betrieben wird, ist Login verpflichtend.

## Fehlerbehandlung und Nachvollziehbarkeit

Importe und automatische Entscheidungen müssen erklärbar bleiben.

Wichtig:

- jeder Import erzeugt einen ImportRun
- fehlerhafte Zeilen werden gespeichert oder referenziert
- Matches erhalten Confidence Score und Begründung
- manuelle Entscheidungen werden nicht automatisch überschrieben
- Parser- und Matching-Versionen werden gespeichert, wenn Regeln sich ändern

## MVP-Schnitt

Der erste sinnvolle Architektur-Schnitt umfasst:

- Docker-fähige Webanwendung
- SQLite-Datenbank in `/data`
- Upload für Bankexporte
- Upload für Amazon-Bestelldaten
- normalisierte Tabellen für Transaktionen, Bestellungen und Bestellpositionen
- einfache automatische Matching-Regeln
- Liste ungematchter Banktransaktionen
- Liste vorgeschlagener Matches
- Möglichkeit, Matches manuell zu bestätigen oder abzulehnen
- einfache Auswertung nach Monat und Kategorie

Nicht im MVP:

- direkte Bankintegration
- OCR
- Multi-User-Betrieb
- Produktempfehlungen
- komplexe Budgetplanung

## Offene Architekturentscheidungen

Folgende Entscheidungen sollten als nächstes getroffen werden:

- Backend- und Frontend-Technologie
- Datenbankzugriff und Migrationstool
- erwartete Importformate für die erste Bank
- Format der Amazon-Datenquelle
- Authentifizierungsstrategie
- Kategorie- und Regelmodell
- Teststrategie für Parser und Matching-Regeln

## Leitprinzipien

- Rohdaten behalten, normalisierte Daten ableiten
- automatische Entscheidungen erklären
- Nutzerentscheidungen respektieren
- einfache lokale Installation priorisieren
- Parser und Matching-Regeln isoliert testbar halten
- fachliche Modelle wichtiger nehmen als externe Dateiformate
