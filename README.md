# shopperino

shopperino ist eine selbst gehostete Webanwendung, die Bankdaten und Amazon-Bestellungen miteinander verknüpft, um eine klare Übersicht über persönliche Ausgaben zu schaffen.

Viele Ausgaben tauchen auf dem Konto nur als einzelne Buchung auf, während die eigentlichen Details in Bestellhistorien, Rechnungen oder Versandbestätigungen liegen. shopperino führt diese Informationen zusammen: Banktransaktionen zeigen, wann und wie viel bezahlt wurde; Amazon-Bestellungen zeigen, wofür das Geld ausgegeben wurde.

Ziel ist eine nachvollziehbare, durchsuchbare und auswertbare Ausgabenübersicht. Die Anwendung soll helfen, Käufe automatisch zuzuordnen, Kategorien zu erkennen, wiederkehrende Ausgaben sichtbar zu machen und persönliche Einkaufsdaten langfristig besser zu verstehen.

shopperino wird vollständig selbst gehostet und als Docker-Container betrieben. Die eigenen Finanz- und Bestelldaten bleiben dabei unter eigener Kontrolle.

## Vision

shopperino soll aus verstreuten Datenquellen eine verständliche persönliche Ausgabenhistorie machen.

Im Mittelpunkt steht die Verknüpfung von:

- Banktransaktionen, Konto- und Kreditkartenexporten
- Amazon-Bestellungen, Bestellpositionen und Rechnungsdaten
- Kategorien, Händlern, Produkten und Zeiträumen

Aus diesen Daten soll eine Oberfläche entstehen, die nicht nur Zahlen anzeigt, sondern Fragen beantwortet:

- Wofür habe ich mein Geld tatsächlich ausgegeben?
- Welche Bankbuchung gehört zu welcher Bestellung?
- Welche Produkte, Kategorien oder Händler verursachen die meisten Ausgaben?
- Welche Ausgaben wiederholen sich?
- Wie entwickeln sich meine Einkaufsgewohnheiten über die Zeit?

shopperino ist kein Buchhaltungssystem und kein Ersatz für Banking-Software. Der Fokus liegt auf privater Ausgabentransparenz: Daten importieren, sinnvoll zusammenführen, verständlich darstellen und lokal kontrollieren.

⸻

## Features

Bereits geplant

- 📦 Import von Amazon-Bestelldaten
- 💳 Import von Konto- und Kreditkartenexporten
- 🔗 Zuordnung von Banktransaktionen zu Amazon-Bestellungen
- 🏷️ Automatische Kategorisierung von Einkäufen
- 📊 Statistiken und Auswertungen
- 🔍 Durchsuchbare Einkaufshistorie
- 🐳 Einfache Bereitstellung per Docker
- 🌐 Browserbasierte Benutzeroberfläche
- 🔒 Self-hosted – deine Daten bleiben bei dir

Geplant für spätere Versionen

- Verbesserte Matching-Regeln für Teilzahlungen, Erstattungen und Sammelbuchungen
- OCR für Rechnungen
- Unterstützung weiterer Shops
- Budget- und Ausgabenanalysen
- Preisentwicklung einzelner Produkte
- Produktempfehlungen und Alternativen
- Exportfunktionen
- Mehrbenutzer-Unterstützung

⸻

Installation

Voraussetzungen

- Docker
- Docker Compose

⸻

Docker Compose

TODO: Offizielles Docker-Image veröffentlichen.

services:
shopperino:
image: TODO
container_name: shopperino
restart: unless-stopped
ports: - "TODO"
environment:
TZ: Europe/Vienna
volumes: - shopperino-data:/data
volumes:
shopperino-data:

⸻

Starten

docker compose up -d

⸻

Stoppen

docker compose down

⸻

Update

docker compose pull
docker compose up -d

⸻

Konfiguration

Die Anwendung wird über Umgebungsvariablen konfiguriert.

Variable Beschreibung
TZ Zeitzone (z.B. Europe/Vienna)
APP_URL Öffentliche URL der Installation (TODO)
PORT HTTP-Port (TODO)
DATA_DIR Speicherort der Anwendungsdaten (TODO)

Weitere Konfigurationsmöglichkeiten folgen.

⸻

Nutzung

Nach dem Start ist shopperino über den konfigurierten HTTP-Port erreichbar.

TODO: Standard-URL und Erstkonfiguration dokumentieren.

⸻

Datenhaltung

Die Anwendung speichert ihre Daten dauerhaft in einem Docker-Volume.

TODO: Dokumentation des Datenformats und möglicher Datenbanken ergänzen.

⸻

Backup

Für ein vollständiges Backup sollten mindestens folgende Daten gesichert werden:

- Persistente Anwendungsdaten (/data)
- Konfigurationsdateien
- Docker Compose Konfiguration

TODO: Backup- und Restore-Anleitung ergänzen.

⸻

Entwicklung

Die Entwicklungsdokumentation befindet sich noch im Aufbau.

Weitere Dokumente:

- [Architektur](docs/architecture.md)
- [Datenmodell](docs/data-model.md)
- [Implementierungsarchitektur](docs/implementation-architecture.md)

Geplant sind Informationen zu:

- Lokaler Entwicklungsumgebung
- Projektstruktur
- Build-Prozess
- Tests
- Release-Prozess

⸻

Roadmap

- Docker-Image veröffentlichen
- Amazon-Import
- Kontoimport
- Automatische Kategorisierung
- Dashboard
- Erweiterte Statistiken
- Preisentwicklung
- OCR-Unterstützung
- REST-API
- Mehrbenutzer-Unterstützung

⸻

Projektstatus

🚧 shopperino befindet sich aktuell in aktiver Entwicklung.

Die API, das Datenmodell und einzelne Funktionen können sich bis zur ersten stabilen Version noch ändern.

⸻

Mitwirken

Beiträge, Bug Reports und Feature Requests sind willkommen.

TODO: Contribution Guide ergänzen.

⸻

Lizenz

TODO: Lizenz festlegen.
