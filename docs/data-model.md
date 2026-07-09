# Datenmodell

Dieses Dokument beschreibt das fachliche Datenmodell von shopperino. Es ist unabhängig von einer konkreten Implementierung formuliert, aber so strukturiert, dass es später gut in relationale Tabellen, Migrationen und API-Modelle übertragen werden kann.

Die zentralen Datenquellen sind:

- Bankdaten aus CSV-Exporten oder später aus einer Bank-API
- Bestellungen aus externen Quellen, zuerst Amazon

Das Modell trennt bewusst zwischen Rohdaten, normalisierten Daten und fachlichen Verknüpfungen. Dadurch bleiben Importe nachvollziehbar, Parser austauschbar und automatische Zuordnungen überprüfbar.

## Grundprinzipien

- Rohdaten werden gespeichert, normalisierte Daten daraus abgeleitet
- jede importierte Information ist auf einen Importvorgang zurückführbar
- externe IDs werden bewahrt, aber interne IDs bleiben führend
- Geldbeträge werden als positive kleinste Währungseinheit gespeichert, zum Beispiel Cent
- die Zahlungsrichtung wird separat modelliert, zum Beispiel `debit` oder `credit`
- Zeitpunkte werden eindeutig gespeichert, Datum-only-Felder bleiben Datum-only-Felder
- automatische Entscheidungen bekommen Begründung, Score und Status
- Nutzerentscheidungen überschreiben automatische Vorschläge
- Banktransaktionen und Bestellungen können n:m verknüpft werden

## Fachliche Bereiche

Das Datenmodell besteht aus sechs Bereichen:

1. Quellen und Importe
2. Bankdaten
3. Bestelldaten
4. Matching
5. Kategorien
6. Audit und Verarbeitung

```text
DataSource
  |
  v
ImportRun
  |
  +--> RawRecord
  |
  +--> BankAccount
  |      |
  |      v
  |    BankTransaction
  |
  +--> Merchant
         |
         v
       Order
         |
         v
       OrderItem

BankTransaction <-- TransactionOrderMatch --> Order

Category <-- CategoryAssignment --> BankTransaction / Order / OrderItem
```

## Quellen und Importe

### DataSource

Beschreibt eine externe Datenquelle. Eine Datenquelle kann dateibasiert oder API-basiert sein.

Beispiele:

- `bank_csv`
- `bank_api`
- `amazon_order_export`
- `amazon_api`

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `kind` | Enum | `bank` oder `orders` |
| `provider` | Text | Anbieter, zum Beispiel `erste_bank`, `n26`, `amazon` |
| `source_type` | Enum | `csv`, `api`, `manual` |
| `display_name` | Text | sichtbarer Name |
| `config` | JSON | nicht geheime Konfiguration, zum Beispiel CSV-Profil |
| `created_at` | Timestamp | Erstellungszeitpunkt |
| `updated_at` | Timestamp | letzter Änderungszeitpunkt |

Hinweis: Zugangsdaten oder Tokens gehören nicht unverschlüsselt in `config`. Für den MVP sollten Bank-APIs noch nicht umgesetzt werden.

### ImportRun

Beschreibt einen einzelnen Importvorgang aus einer Datenquelle.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `data_source_id` | UUID | Quelle des Imports |
| `source_kind` | Enum | `bank` oder `orders` |
| `input_type` | Enum | `csv`, `api`, `json`, `html`, `pdf`, `manual` |
| `file_name` | Text, optional | ursprünglicher Dateiname |
| `file_hash` | Text, optional | Hash der Importdatei zur Duplikaterkennung |
| `parser_name` | Text | verwendeter Parser |
| `parser_version` | Text | Parser-Version |
| `status` | Enum | `pending`, `running`, `completed`, `completed_with_errors`, `failed` |
| `started_at` | Timestamp | Startzeitpunkt |
| `finished_at` | Timestamp, optional | Abschlusszeitpunkt |
| `records_seen` | Integer | gelesene Rohdatensätze |
| `records_imported` | Integer | erfolgreich importierte Datensätze |
| `records_failed` | Integer | fehlerhafte Datensätze |
| `error_summary` | Text, optional | zusammengefasste Fehler |

### RawRecord

Speichert die möglichst originalgetreue Eingabe auf Datensatzebene.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `import_run_id` | UUID | zugehöriger Import |
| `record_type` | Enum | `bank_transaction`, `order`, `order_item`, `payment`, `refund`, `unknown` |
| `external_id` | Text, optional | externe Referenz, falls vorhanden |
| `line_number` | Integer, optional | Zeile in einer CSV-Datei |
| `raw_payload` | JSON oder Text | Rohinhalt |
| `payload_hash` | Text | Hash des Rohinhalts |
| `parse_status` | Enum | `parsed`, `skipped`, `failed` |
| `parse_error` | Text, optional | Fehlerbeschreibung |
| `created_at` | Timestamp | Erstellungszeitpunkt |

## Bankdaten

### BankAccount

Beschreibt ein Konto, eine Kreditkarte oder eine andere Zahlungsquelle.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `data_source_id` | UUID | Datenquelle |
| `name` | Text | Anzeigename |
| `institution_name` | Text, optional | Bank oder Anbieter |
| `account_type` | Enum | `checking`, `credit_card`, `paypal`, `cash`, `other` |
| `currency` | Text | Standardwährung, zum Beispiel `EUR` |
| `external_account_id` | Text, optional | maskierte externe Konto-ID |
| `created_at` | Timestamp | Erstellungszeitpunkt |
| `updated_at` | Timestamp | letzter Änderungszeitpunkt |

### BankTransaction

Normalisierte Bank- oder Kreditkartentransaktion.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `bank_account_id` | UUID | Konto oder Karte |
| `import_run_id` | UUID | Importvorgang |
| `raw_record_id` | UUID, optional | ursprünglicher Rohdatensatz |
| `external_transaction_id` | Text, optional | externe Transaktions-ID |
| `booking_date` | Date | Buchungsdatum |
| `value_date` | Date, optional | Valutadatum |
| `amount_minor` | Integer | positiver Betrag in kleinster Währungseinheit |
| `currency` | Text | ISO-Währungscode |
| `direction` | Enum | `debit` oder `credit` |
| `counterparty_name` | Text, optional | Empfänger oder Absender |
| `counterparty_iban_masked` | Text, optional | maskierte IBAN, falls vorhanden |
| `description` | Text | Verwendungszweck oder Buchungstext |
| `reference` | Text, optional | Zahlungsreferenz |
| `merchant_hint` | Text, optional | normalisierter Händlerhinweis |
| `fingerprint` | Text | stabiler Hash zur Duplikaterkennung |
| `created_at` | Timestamp | Erstellungszeitpunkt |
| `updated_at` | Timestamp | letzter Änderungszeitpunkt |

Wichtige Regeln:

- `amount_minor` ist immer positiv. Ausgaben werden über `direction = debit`, Einnahmen oder Erstattungen über `direction = credit` dargestellt.
- Für Auswertungen ist `amount_minor` maßgeblich, nicht formatierter Text.
- `fingerprint` sollte aus Datum, Betrag, Währung, Beschreibung, Gegenpartei und externer ID gebildet werden.

## Bestelldaten

### Merchant

Beschreibt Händler oder Plattformen. Amazon ist ein Händler, spätere Shops können ergänzt werden.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `name` | Text | Anzeigename |
| `provider` | Text | technische Quelle, zum Beispiel `amazon` |
| `website` | Text, optional | Website |
| `created_at` | Timestamp | Erstellungszeitpunkt |
| `updated_at` | Timestamp | letzter Änderungszeitpunkt |

### Order

Normalisierte Bestellung aus Amazon oder später anderen Shops.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `merchant_id` | UUID | Händler |
| `import_run_id` | UUID | Importvorgang |
| `raw_record_id` | UUID, optional | ursprünglicher Rohdatensatz |
| `external_order_id` | Text | Bestellnummer, zum Beispiel Amazon-Bestellnummer |
| `order_date` | Date | Bestelldatum |
| `shipment_date` | Date, optional | Versanddatum |
| `invoice_date` | Date, optional | Rechnungsdatum |
| `status` | Enum | `ordered`, `shipped`, `delivered`, `cancelled`, `refunded`, `unknown` |
| `total_amount_minor` | Integer | Gesamtbetrag |
| `currency` | Text | ISO-Währungscode |
| `payment_method_hint` | Text, optional | Zahlungsart aus Bestelldaten, falls vorhanden |
| `fingerprint` | Text | stabiler Hash zur Duplikaterkennung |
| `created_at` | Timestamp | Erstellungszeitpunkt |
| `updated_at` | Timestamp | letzter Änderungszeitpunkt |

### OrderItem

Position innerhalb einer Bestellung.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `order_id` | UUID | Bestellung |
| `raw_record_id` | UUID, optional | ursprünglicher Rohdatensatz |
| `external_item_id` | Text, optional | externe Positions-ID |
| `title` | Text | Produkt- oder Positionsname |
| `asin` | Text, optional | Amazon ASIN |
| `sku` | Text, optional | Händler-SKU |
| `quantity` | Decimal | Menge |
| `unit_price_minor` | Integer, optional | Einzelpreis |
| `total_price_minor` | Integer | Positionsgesamtpreis |
| `currency` | Text | ISO-Währungscode |
| `item_type` | Enum | `product`, `shipping`, `discount`, `tax`, `gift_card`, `refund`, `fee`, `unknown` |
| `created_at` | Timestamp | Erstellungszeitpunkt |
| `updated_at` | Timestamp | letzter Änderungszeitpunkt |

### OrderPayment

Beschreibt Zahlungsinformationen, die aus einer Bestellung bekannt sind. Diese Daten sind optional, aber hilfreich für Matching.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `order_id` | UUID | Bestellung |
| `payment_date` | Date, optional | Zahlungs- oder Belastungsdatum |
| `amount_minor` | Integer | positiver Zahlungsbetrag |
| `currency` | Text | ISO-Währungscode |
| `payment_method_hint` | Text, optional | zum Beispiel Kreditkarte, Bankeinzug, Gutschein |
| `external_payment_id` | Text, optional | externe Zahlungsreferenz |
| `created_at` | Timestamp | Erstellungszeitpunkt |

Eine Bestellung kann mehrere Zahlungen haben, zum Beispiel Gutschein plus Kreditkarte. Eine Zahlung kann später mit einer Banktransaktion gematcht werden.

### OrderAdjustment

Beschreibt nachträgliche Änderungen an einer Bestellung.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `order_id` | UUID | Bestellung |
| `kind` | Enum | `refund`, `discount`, `shipping`, `tax`, `fee`, `correction` |
| `amount_minor` | Integer | positiver Betrag |
| `currency` | Text | ISO-Währungscode |
| `adjustment_date` | Date, optional | Datum der Änderung |
| `description` | Text, optional | Beschreibung |
| `created_at` | Timestamp | Erstellungszeitpunkt |

## Matching

### TransactionOrderMatch

Verknüpft eine Banktransaktion mit einer Bestellung oder einer konkreten Bestellzahlung.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `bank_transaction_id` | UUID | Banktransaktion |
| `order_id` | UUID | Bestellung |
| `order_payment_id` | UUID, optional | konkrete Zahlung |
| `status` | Enum | `suggested`, `confirmed`, `rejected`, `manual`, `superseded` |
| `match_type` | Enum | `exact`, `partial`, `split`, `refund`, `manual` |
| `confidence_score` | Decimal | Wert von 0 bis 1 |
| `amount_delta_minor` | Integer | Differenz zwischen Transaktion und Bestellung |
| `date_delta_days` | Integer, optional | Abstand zwischen Buchungsdatum und Bestelldatum |
| `reason` | Text | menschenlesbare Begründung |
| `rules` | JSON | angewendete Regeln und Einzelbewertungen |
| `created_by` | Enum | `system` oder `user` |
| `created_at` | Timestamp | Erstellungszeitpunkt |
| `confirmed_at` | Timestamp, optional | Bestätigungszeitpunkt |
| `rejected_at` | Timestamp, optional | Ablehnungszeitpunkt |

Wichtige Regeln:

- Automatische Matches starten als `suggested`.
- Nutzerbestätigte Matches werden `confirmed` oder `manual`.
- Abgelehnte Matches bleiben als `rejected` erhalten, damit sie nicht erneut vorgeschlagen werden.
- Bei neu berechneten Vorschlägen können ältere Systemvorschläge `superseded` werden.

### MatchGroup

Optionales Gruppierungsmodell für komplexe Fälle.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `kind` | Enum | `single`, `split_payment`, `combined_order`, `refund` |
| `status` | Enum | `suggested`, `confirmed`, `rejected`, `manual` |
| `created_at` | Timestamp | Erstellungszeitpunkt |
| `updated_at` | Timestamp | letzter Änderungszeitpunkt |

Dieses Modell wird erst nötig, wenn eine Bankbuchung mehrere Bestellungen oder eine Bestellung mehrere Bankbuchungen sauber als fachliche Einheit abbilden soll.

## Kategorien

### Category

Kategorie für Auswertungen.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `parent_id` | UUID, optional | Oberkategorie |
| `name` | Text | Name |
| `slug` | Text | stabiler technischer Name |
| `color` | Text, optional | UI-Farbe |
| `icon` | Text, optional | UI-Icon |
| `created_at` | Timestamp | Erstellungszeitpunkt |
| `updated_at` | Timestamp | letzter Änderungszeitpunkt |

### CategoryAssignment

Ordnet eine Kategorie einem Zielobjekt zu.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `target_type` | Enum | `bank_transaction`, `order`, `order_item` |
| `target_id` | UUID | Zielobjekt |
| `category_id` | UUID | Kategorie |
| `source` | Enum | `manual`, `rule`, `import`, `system` |
| `confidence_score` | Decimal, optional | Sicherheit automatischer Zuordnungen |
| `reason` | Text, optional | Begründung |
| `created_at` | Timestamp | Erstellungszeitpunkt |
| `updated_at` | Timestamp | letzter Änderungszeitpunkt |

Für Auswertungen sollte die feinste sinnvolle Ebene genutzt werden. Bei Amazon ist das meistens `order_item`, bei reinen Banktransaktionen oft `bank_transaction`.

## Audit und Verarbeitung

### ProcessingJob

Beschreibt Hintergrundverarbeitung wie Import, Re-Matching oder Re-Kategorisierung.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `job_type` | Enum | `import`, `normalize`, `match`, `categorize`, `recalculate` |
| `status` | Enum | `pending`, `running`, `completed`, `failed` |
| `input` | JSON | Parameter |
| `result` | JSON, optional | Ergebnis |
| `error` | Text, optional | Fehler |
| `started_at` | Timestamp, optional | Startzeitpunkt |
| `finished_at` | Timestamp, optional | Abschlusszeitpunkt |
| `created_at` | Timestamp | Erstellungszeitpunkt |

### DecisionLog

Protokolliert manuelle oder automatische Entscheidungen, die fachliche Daten verändern.

Felder:

| Feld | Typ | Beschreibung |
| --- | --- | --- |
| `id` | UUID | interne ID |
| `target_type` | Text | betroffener Objekttyp |
| `target_id` | UUID | betroffenes Objekt |
| `action` | Text | Aktion, zum Beispiel `match_confirmed` |
| `actor` | Enum | `system` oder `user` |
| `before` | JSON, optional | Zustand vorher |
| `after` | JSON, optional | Zustand nachher |
| `created_at` | Timestamp | Zeitpunkt |

## Beziehungen

Wichtige Kardinalitäten:

| Beziehung | Kardinalität |
| --- | --- |
| `DataSource` zu `ImportRun` | 1:n |
| `ImportRun` zu `RawRecord` | 1:n |
| `ImportRun` zu `BankTransaction` | 1:n |
| `BankAccount` zu `BankTransaction` | 1:n |
| `Merchant` zu `Order` | 1:n |
| `Order` zu `OrderItem` | 1:n |
| `Order` zu `OrderPayment` | 1:n |
| `Order` zu `OrderAdjustment` | 1:n |
| `BankTransaction` zu `Order` | n:m über `TransactionOrderMatch` |
| `Category` zu `Category` | 1:n über `parent_id` |
| `Category` zu Zielobjekten | n:m über `CategoryAssignment` |

## Duplikaterkennung

Duplikate sollten auf mehreren Ebenen erkannt werden:

- Importdatei: `ImportRun.file_hash`
- Rohdatensatz: `RawRecord.payload_hash`
- Banktransaktion: `BankTransaction.fingerprint`
- Bestellung: `Order.fingerprint`
- Bestellposition: Kombination aus `order_id`, `asin`, Titel, Menge und Betrag

Externe IDs haben Vorrang, wenn sie stabil vorhanden sind. Bei CSV-Exporten fehlen sie oft, daher ist ein robuster Fingerprint wichtig.

## CSV-Import von Bankdaten

CSV-Profile sollten nicht direkt im Datenmodell hartcodiert werden. Stattdessen beschreibt `DataSource.config`, wie Spalten zugeordnet werden.

Beispielhafte Spalten:

- Buchungsdatum
- Valutadatum
- Betrag
- Währung
- Empfänger
- IBAN
- Verwendungszweck
- Referenz

Der Importer erzeugt daraus `RawRecord` und `BankTransaction`.

## Bank-API

Eine spätere Bank-API kann dasselbe Zielmodell verwenden.

Unterschiede zu CSV:

- stabilere externe IDs möglich
- inkrementelle Synchronisation möglich
- Kontoinformationen können automatisch angelegt werden
- Zugangsdaten und Tokens benötigen ein separates Sicherheitskonzept

Das Ziel bleibt gleich: API-Daten werden in `RawRecord`, `BankAccount` und `BankTransaction` normalisiert.

## Amazon-Import

Amazon-Daten werden auf das allgemeine Bestellmodell gemappt.

Das erste unterstützte Exportformat ist Amazons Datenschutz-Export
`Your Orders/Your Amazon Orders/Order History.csv`. Der Importer liest die
CSV-Kopfzeile, gruppiert mehrere Zeilen mit derselben `Order ID` zu einer
Bestellung und bewahrt die Amazon-Bestellnummer sowie ASINs für spätere
Nachvollziehbarkeit und Matching auf.

Typische Zuordnung:

| Amazon-Information | shopperino-Modell |
| --- | --- |
| Bestellnummer | `Order.external_order_id` |
| Bestelldatum | `Order.order_date` |
| Versanddatum | `Order.shipment_date` |
| Gesamtsumme | `Order.total_amount_minor` |
| Artikelname | `OrderItem.title` |
| ASIN | `OrderItem.asin` |
| Artikelpreis | `OrderItem.total_price_minor` |
| Zahlungsart | `OrderPayment.payment_method_hint` |
| Erstattung | `OrderAdjustment` oder `OrderItem` mit `item_type = refund` |

Das Modell heißt bewusst `Order` statt `AmazonOrder`, damit später weitere Shops ergänzt werden können.

Wiederholte oder überlappende Exporte sind erlaubt. Wenn zum Beispiel eine
Amazon-Datei `01/26 - 03/26` und die nächste Datei `02/26 - 04/26` enthält,
bleiben beide `ImportRun`-Einträge und ihre `RawRecord`-Spuren erhalten. Die
normalisierten `Order`-Datensätze werden aber über ihren Fingerprint
dedupliziert, sodass Februar und März nicht doppelt im Bestellbestand landen.

## Matching-Grundlage

Für den ersten Matching-Algorithmus sind diese Felder besonders wichtig:

- `BankTransaction.amount_minor`
- `BankTransaction.currency`
- `BankTransaction.booking_date`
- `BankTransaction.counterparty_name`
- `BankTransaction.description`
- `Order.total_amount_minor`
- `Order.currency`
- `Order.order_date`
- `Order.shipment_date`
- `Order.external_order_id`
- `OrderPayment.amount_minor`
- `OrderPayment.payment_date`
- `OrderPayment.payment_method_hint`

Ein guter Match ist im MVP meistens:

- gleiche Währung
- gleicher oder sehr ähnlicher Betrag
- Bankbuchung innerhalb weniger Tage nach Bestellung oder Versand
- Amazon-Hinweis im Buchungstext
- keine Nutzerentscheidung, die dagegen spricht

Amazon-Zahlungen können über Kreditkarten laufen und erscheinen dann nicht
zwingend als einzelne Amazon-Zeile im Bankexport. Wenn die Bestelldaten eine
Kreditkarten-Zahlungsart enthalten, darf eine Bestellung deshalb auch als
`partial`-Vorschlag zu einer größeren Kartenbuchung erscheinen. Der Match bleibt
ein Vorschlag mit niedrigerem Score und muss vom Nutzer bestätigt oder manuell
geordnet werden.

Wiederholte oder überlappende Bankexporte werden analog zum Amazon-Import
behandelt: jeder Import bleibt nachvollziehbar, aber identische normalisierte
`BankTransaction`-Datensätze werden anhand ihres Fingerprints nur einmal
gespeichert. Dadurch erzeugen wiederholte Imports auch keine neuen
Match-Vorschläge für dasselbe Transaktion-Bestellung-Paar.

Bereits bestätigte, manuelle oder abgelehnte Match-Entscheidungen bleiben
stabil. Automatische Vorschläge dürfen diese Entscheidungen nicht überschreiben,
und abgelehnte Kandidaten werden nicht erneut als neue Vorschläge angelegt.

## MVP-Datenmodell

Für den ersten lauffähigen Stand sollten diese Entitäten umgesetzt werden:

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

Später ergänzen:

- `OrderAdjustment`
- `MatchGroup`
- `ProcessingJob`
- `DecisionLog`

## Offene Entscheidungen

- Welche Bank ist die erste Referenz für CSV-Importe?
- In welchem Format werden Amazon-Bestellungen zuerst importiert?
- Wie streng soll die Duplikaterkennung beim Re-Import sein?
- Welche Standardkategorien bringt shopperino mit?
- Ab wann wird Authentifizierung verpflichtend?
