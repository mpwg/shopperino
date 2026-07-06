# shopperino

Eine selbst gehostete Webanwendung zur Analyse und Auswertung von Einkaufs- und Bestelldaten.

shopperino hilft dabei, persönliche Einkaufsdaten zentral zu verwalten, zu kategorisieren und auszuwerten. Ziel ist es, Daten aus verschiedenen Quellen – beispielsweise Amazon-Bestellungen oder Bankexporten – zusammenzuführen und daraus nützliche Statistiken und Erkenntnisse zu gewinnen.

Die Anwendung wird vollständig selbst gehostet und als Docker-Container betrieben.

⸻

Features

Bereits geplant

- 📦 Import von Amazon-Bestelldaten
- 💳 Import von Konto- und Kreditkartenexporten
- 🏷️ Automatische Kategorisierung von Einkäufen
- 📊 Statistiken und Auswertungen
- 🔍 Durchsuchbare Einkaufshistorie
- 🐳 Einfache Bereitstellung per Docker
- 🌐 Browserbasierte Benutzeroberfläche
- 🔒 Self-hosted – deine Daten bleiben bei dir

Geplant für spätere Versionen

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
