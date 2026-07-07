# Roadmap

Diese Roadmap ist als sequenzieller GitHub-Issue-Backlog aufgebaut. Die Issues sollen in der Reihenfolge abgearbeitet werden, weil spätere Schritte bewusst auf den fachlichen und technischen Grundlagen der früheren Schritte aufbauen.

## GitHub Issues

| Reihenfolge | Issue | Fokus |
| --- | --- | --- |
| 01 | [#6 Projekt-Tooling und CI-Grundlage härten](https://github.com/mpwg/shopperino/issues/6) | Tests, CI, Entwicklungsbasis |
| 02 | [#7 Persistenzmodell für Datenquellen, Importläufe und Rohdaten ergänzen](https://github.com/mpwg/shopperino/issues/7) | `DataSource`, `ImportRun`, `RawRecord` |
| 03 | [#8 Minimalen Server-Host mit API-Schnittstellen aufbauen](https://github.com/mpwg/shopperino/issues/8) | Self-hosted API-Host |
| 04 | [#9 Generische Import-Pipeline definieren](https://github.com/mpwg/shopperino/issues/9) | Importer-Port, Raw Records, Fehlerbehandlung |
| 05 | [#10 Bank-CSV-Import als ersten Bankadapter umsetzen](https://github.com/mpwg/shopperino/issues/10) | Banktransaktionen aus CSV |
| 06 | [#11 Amazon-Bestellimport für Orders, Items und Payments umsetzen](https://github.com/mpwg/shopperino/issues/11) | Amazon-Bestellungen ins generische Bestellmodell |
| 07 | [#12 Matching-Workflow für Vorschläge und manuelle Entscheidungen ausbauen](https://github.com/mpwg/shopperino/issues/12) | Vorschlagen, bestätigen, ablehnen, manuell matchen |
| 08 | [#13 Kategorien und automatische Kategoriezuordnungen einführen](https://github.com/mpwg/shopperino/issues/13) | Kategorien und Regeln |
| 09 | [#14 Query- und Reporting-Services für Ausgabenübersicht bauen](https://github.com/mpwg/shopperino/issues/14) | Dashboarddaten und Auswertungen |
| 10 | [#15 Erste Web-UI für Import, Matching und Übersicht umsetzen](https://github.com/mpwg/shopperino/issues/15) | Bedienbare MVP-Workflows |
| 11 | [#16 Self-hosted Docker-Betrieb produktionsnah machen](https://github.com/mpwg/shopperino/issues/16) | Docker, Compose, Backup, Healthcheck |
| 12 | [#17 Tauri-Desktop-Verpackung evaluieren und vorbereiten](https://github.com/mpwg/shopperino/issues/17) | Desktop-Fähigkeit prüfen |

## Phasen

### Foundation

- #6 Projekt-Tooling und CI
- #7 Persistenzmodell für Importgrundlagen
- #8 Minimaler Server-Host

### Imports

- #9 Generische Import-Pipeline
- #10 Bank-CSV-Import
- #11 Amazon-Bestellimport

### Matching und Kategorien

- #12 Matching-Workflow
- #13 Kategorien

### Produkt und Betrieb

- #14 Query- und Reporting-Services
- #15 Web-UI
- #16 Self-hosted Docker-Betrieb
- #17 Tauri-Desktop-Evaluierung

## Leitlinie

Die Roadmap priorisiert zuerst belastbare technische Grundlagen, dann konkrete Datenimporte, danach Matching und Auswertung. UI, Docker-Betrieb und Desktop-Verpackung bauen auf diesen Grundlagen auf, damit Fachlogik nicht in Host- oder UI-Schichten wandert.
