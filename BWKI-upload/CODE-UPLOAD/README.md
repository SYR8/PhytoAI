# PhytoAI — Code-Paket für die BWKI-Einreichung

**Projekt:** PhytoAI: KI-gestützte Pflanzenüberwachung & Klimasteuerung
**Einzelprojekt von:** Mohammad Abdin (BWKI-Benutzername: `MOs`), 2026
**Vollständiger öffentlicher Quellcode und Dokumentation:** **https://github.com/SYR8/PhytoAI**

Dieses ZIP enthält den öffentlichen Projektstand (Code + Dokumentation) für die Begutachtung.
Es ist kein Video und keine Formularantwort — nur das nachbaubare Projekt.

---

## 1. Was in diesem ZIP enthalten ist

| Ordner / Datei | Inhalt |
|---|---|
| `firmware/` | ESP32-Firmware: Produktions-Sketch für WROOM und ESP32-CAM, Kalibrierungs-/Bench-Sketch, Testpläne. |
| `dashboard/` | Das komplette Web-Dashboard (statisches HTML/CSS/JS, kein Build-Schritt) inkl. `config.example.js`. |
| `workflows/` | Der importierbare n8n-Workflow `phytoai.json` (das Gehirn des Systems). |
| `scripts/` | Trainings-/Datensatz-Skripte (PlantVillage-Bootstrap und Flywheel) inkl. Anleitung. |
| `yolo-service/` | Lokaler Bildklassifikator-Dienst (FastAPI + Ultralytics, CPU) inkl. `models/model.pt`. |
| `docs/` | Technische Dokumentation: Plan/Schemas, Hardware-Bench-Werte, Dashboard-Verträge, Benachrichtigungen, Firmware-Briefs, Specs. |
| `Hardware/` | Hardware-Liste (Bauteile). |
| `test-data/` | Sichere Beispieldaten (Seed-CSV) für eine Test-Tabelle — keine echten Pflanzen- oder Personendaten. |
| `README.md` | Diese Datei (Übersicht für die Begutachtung). |
| `README.de.md` | Deutsche Projekt-README (Newcomer-Bauanleitung). |
| `STATUS.md` | Aktueller Projektstatus inkl. offener Punkte. |
| `LICENSE` | MIT-Lizenz. |

## 2. Was absichtlich NICHT enthalten ist

- **Keine Zugangsdaten oder privaten Kennungen:** keine Passwörter, Tokens, OAuth-Client-Secrets, WLAN-Zugangsdaten, API-Schlüssel, persönliche E-Mail-Adressen.
- **Keine private Deployment-Konfiguration:** In dieser Kopie wurden die Produktions-Spreadsheet-ID und der private n8n-Host durch Platzhalter (`YOUR_SPREADSHEET_ID`, `YOUR-N8N-HOST`) ersetzt. `dashboard/config.js` (mit den echten Werten) ist nicht enthalten; stattdessen liegt `dashboard/config.example.js` bei.
- **Kein PlantVillage-Datensatz** (nur die Download-/Trainings-Skripte).
- **Keine Trainings-Caches oder Build-Artefakte** (z. B. `runs/`, Split-Ordner, Replay-Datensätze).
- **Keine BWKI-Formularantworten, kein Video-Pitch-Entwurf** und keine sonstigen Einreichungsunterlagen.
- **Keine privaten Webhook-URLs** (nur Pfade wie `/webhook/core/sensor`, die jeder selbst an seine Basis-URL hängt).

## 3. Projektstruktur — wer was macht

1. **ESP32-WROOM-Firmware** (`firmware/wroom_production/`): liest alle Sensoren, sendet Telemetrie per HTTPS an den Workflow, führt das zurückgegebene Entscheidungs-JSON aus (Pumpe/Heizung) und erzwingt Hardware-Sicherheitsgrenzen (40,0 °C Abschaltung, 39,5 °C Verweigerung, 120 s Aktuatorgrenze, 8 s Watchdog). Entscheidet nie lokal.
2. **Sensoren & Hardware:** kapazitiver Bodenfeuchtesensor, 2× DS18B20 (Boden/Wasser, ein OneWire-Bus), DHT22 (Luft), 1-kg-Wägezelle + HX711 (Gewicht), LDR (Licht), Tank-Sensor, Relais, Pumpe, Heizung. Pin-Belegung und Messwerte: `docs/hw-bench-2026-09-15.md`. Der wasserdichte DS18B20-Wasserfühler muss **frei im Tank schwimmen — rundum von Wasser umgeben** und darf Tankwand, Tankboden oder andere Objekte **nicht berühren**: Kontakt leitet Fremdwärme und verfälscht die Wassertemperatur, die über die Heizung entscheidet.
3. **Kamera:** ESP32-CAM (`firmware/esp32cam_production/`) sendet Tagesfotos und wöchentliche Scan-Fotos; kabelgebunden (keine Batterie).
4. **n8n-Workflow** (`workflows/phytoai.json`): orchestriert alle Zweige, ruft KI-Agenten (Gemma über OpenRouter) auf, hält Sicherheits-Guardrails als Code vor, verwaltet Human-in-the-Loop-Waits.
5. **Google Sheets/Drive:** fünf Tabs als Datenbank (`Events`, `SystemConfig`, `DiseaseScans`, `Notifications`, `AgentNotes`); Drive speichert Fotos.
6. **PlantVillage-YOLO-Modell/-Dienst** (`yolo-service/`): lokaler 38-Klassen-Bildklassifikator als Zweitmeinung für Scan-Fotos; Details unten.
7. **Dashboard** (`dashboard/`): statische Web-App; liest Sheets/Drive direkt mit dem Google-Login des Nutzers; schreibt nur Antworten auf offene Fragen zurück.
8. **Benachrichtigungen:** Zentrum in der App (Timeline); optionale Browser-Hinweise nur bei **offenem Tab** und erteilter Berechtigung. Push bei geschlossener Seite ist **nicht** implementiert.

## 4. Nachbau-/Reproduzierbarkeits-Reihenfolge

1. **Abhängigkeiten installieren:** Arduino IDE/arduino-cli + ESP32-Core 3.3.11 und die im Sketch-Header genannten Bibliotheken; n8n (Docker); Python 3 für `scripts/` und `yolo-service/` (siehe `scripts/README.md`, `yolo-service/README.md`).
2. **Externe Dienste vorbereiten:** Google-Cloud-Projekt (Sheets- und Drive-API aktivieren, OAuth-Web-Client anlegen), n8n-Instanz, OpenRouter-Konto/-Schlüssel; optional Perenual (Free Tier) und ein CPU-Server/VPS für den Klassifikator.
3. **Platzhalter konfigurieren:** `dashboard/config.example.js` → `config.js` kopieren und Client-ID, Spreadsheet-ID, n8n-Basis-URL eintragen; Firmware-`secrets.h` (WLAN, Basis-URL, Webhook-Präfix) ausfüllen. Siehe Abschnitt 6.
4. **Fünf-Tab-Schema anlegen:** Tabs mit exakten Kopfzeilen (siehe `docs/Plan.md` §2) — oder die Seed-CSVs aus `test-data/dashboard-seed/` in eine **Test**-Tabelle importieren.
5. **Workflow importieren:** `workflows/phytoai.json` in n8n importieren; Zugangsdaten in der n8n-UI **per Name** anlegen (Google Sheets, Google Drive, OpenRouter, optional Perenual).
6. **Firmware flashen:** zuerst `firmware/wroom_calibration/` (kalibrieren, Werte notieren), dann `firmware/wroom_production/` mit den eigenen Bench-Werten.
7. **Messwerte verifizieren:** Serielles Log prüfen, dann das Erscheinen von Zeilen in `Events`.
8. **Inferenzdienst starten:** `yolo-service/` per Docker/uvicorn starten (`yolo-service/README.md`); das mitgelieferte `models/model.pt` wird automatisch geladen.
9. **Dashboard deployen/öffnen:** `dashboard/` statisch über HTTPS ausliefern und mit dem Google-Konto anmelden, das Zugriff auf Tabelle/Drive hat.
10. **Benachrichtigungen testen:** zuerst das In-App-Zentrum (Timeline), dann optional „Enable browser alerts“ in den Einstellungen (Berechtigung wird nur nach Klick angefragt).

## 5. WROOM-Serienbefehle (Diagnose)

Die Produktions-Firmware (`firmware/wroom_production/`) nimmt am seriellen Monitor (**115200 Baud**)
Einzelbefehle entgegen. `dry_run` blockiert weiterhin **jede** GPIO-Aktuierung — auch beim
Diagnose-Sendezyklus.

| Taste | Befehl | Verwendung | Sicherheitsgrenzen |
|---|---|---|---|
| `t` | INSTALLATIONS-Tare | `t` drücken, dann mit `y` bestätigen. Plattform muss **LEER** sein; speichert den Offset der leeren Plattform in NVS — nie im Normalbetrieb. | Nur leere Plattform; der HX711 wird niemals automatisch getared. |
| `l` | Aktuatorgrenze zur Laufzeit | `l` drücken, neue Grenze in Sekunden eingeben, Enter. Gilt für Pumpe und Heizung und wird in NVS gespeichert (übersteht Reboots). | Harte Grenzen **5–600 s**; nicht-numerische oder außerhalb liegende Eingaben werden mit Begründung abgelehnt; Standard `120 s`. |
| `s` | Diagnose-Senden | `s` drücken — führt sofort einen vollständigen Telemetrie-Zyklus aus: `GET /webhook/config`, dann derselbe 12-Feld-`POST /webhook/core/sensor` wie beim geplanten Lauf; zeigt HTTP-Status und Entscheidungs-Schlüssel, danach den nächsten geplanten Termin. | Nutzt den normalen Codepfad; `dry_run` blockiert weiterhin alle Aktuierung. |
| `i` | Status | Uptime, WLAN, Dry-Run, HX711-Offset/Faktor, Aktuatorgrenze, Tank-/Wasserzustand. | — |
| `h` oder `?` | Hilfe | Listet die Befehle auf. | — |

## 6. Platzhalter, die Nutzer selbst konfigurieren müssen

- `dashboard/config.js`: `clientId`, `spreadsheetId`, `assistantBase` (eigener n8n-Host) sowie optional `GOOGLE_LOGIN_HINT`.
- Firmware-`secrets.h`: `SECRET_WIFI_SSID`, `SECRET_WIFI_PASSWORD`, `SECRET_BASE_URL`, `SECRET_WEBHOOK_PREFIX` (Produktion: `/webhook`; `/webhook-test` ist der n8n-Editor-Testlistener und antwortet nur einmal nach „Execute workflow“). **Produktions-Webhooks registrieren sich nur bei AKTIVEM Workflow** — den Workflow in n8n vor dem Flashen/Betrieb aktivieren.
- n8n: eigene Zugangsdaten (per Name: Google Sheets OAuth2, Google Drive OAuth2, OpenRouter, optional Perenual Query-Auth `key`).
- `SystemConfig`-Tabelle: `drive_daily_photos_folder_id`, `drive_scan_photos_folder_id`, Standort (`pot_latitude`, `pot_longitude`).
- `workflows/phytoai.json`: enthält in dieser Kopie `YOUR_SPREADSHEET_ID` als Platzhalter — die eigene Sheet-ID in den Google-Sheets-Nodes bzw. in SystemConfig setzen.

## 7. Zugangsdaten und private Kennungen

In diesem ZIP sind **keine** Zugangsdaten, Tokens, Passwörter, OAuth-Secrets, persönlichen E-Mail-Adressen, privaten Webhook-URLs oder Produktions-IDs enthalten. Alle derartigen Werte wurden entfernt oder durch Platzhalter ersetzt. Die Lizenz und Urheberangaben sind in `LICENSE` bzw. unten dokumentiert.

## 8. Das eingesetzte Modell (exakt wie dokumentiert)

- Datensatz: **PlantVillage** (Farbversion, spMohanty/PlantVillage-Dataset), **38 Klassen**.
- Methode: **YOLOv8n-cls** (Ultralytics), **Bootstrap-Feintuning** (Transfer Learning) auf PlantVillage.
- Training: **12 Epochen**, Bildgröße **160 × 160**, **Batch-Größe 32**, **CPU-Training**, fester Seed.
- Vorbereitung: maximal **300 Bilder pro Klasse** für den Bootstrap (das vollständige PlantVillage umfasst rund 54.000 Bilder); **80/20 Trainings-/Validierungs-Split** pro Klasse (reproduzierbar, siehe `scripts/README.md` und `scripts/prepare_plantvillage.py`).
- Gemessenes Ergebnis (nur Validierung): **96,08 % Top-1** und **99,955 % Top-5**.
- Es gibt **keinen separaten Testsatz** und keinen Trainingsgenauigkeits-Messwert; eine Testgenauigkeit wird daher **nicht** behauptet.
- `yolo-service/models/model.pt` **ist der trainierte, aktuell eingesetzte Checkpoint** (identisch mit dem im Container des Betreibers laufenden Modell). Das Modell wird geladen, sobald der Dienst startet; es muss nicht und sollte nicht ersetzt werden, um den dokumentierten Zustand zu prüfen. Das Training kann mit `scripts/train.py` (Bootstrap/Flywheel) reproduziert werden.
- Der Klassifikator ist im Workflow eine **niedrig gewichtete Zweitmeinung**; die endgültige Entscheidung kombinieren Vision-Agent und Judge, der Besitzer bestätigt (Human-in-the-Loop).

## 9. Benachrichtigungen — was gilt und was nicht

- **Nicht implementiert:** Push bei geschlossener Seite (kein Service Worker, kein Web Push). Es wird nichts behauptet, was es nicht gibt.
- **Implementiert:** Benachrichtigungszentrum in der App (Timeline-Route) mit Schweregrad, Quelle, Zeit, Pflanzenkontext und Antwortbuttons für offene Fragen.
- **Browser-Hinweise:** nur wenn (a) die Seite **geöffnet** ist und (b) die Berechtigung im Browser **erteilt** wurde — die Abfrage erfolgt ausschließlich nach Klick auf „Enable browser alerts“ in den Einstellungen, nie beim Laden. Hinweise gibt es nur für neue, offene kritische Meldungen und ausgewählte Warnungen (visuelle Anomalie, Scan-Urteil); doppelte Hinweise werden verhindert. Details: `docs/dashboard-notifications.md`.
- Hinweis zur Umgebungsgrenze: Benachrichtigungen werden nur bei sichtbarem Tab abgefragt (einmal pro Minute); geschlossene Tabs erhalten nichts.

## 10. Lizenz und Attribution

- **MIT-Lizenz** — siehe `LICENSE` (© 2026 Mohammad Abdin). Der Code darf unter den MIT-Bedingungen verwendet, verändert und weitergegeben werden.
- **Datensatz:** PlantVillage (spMohanty) — vor Weitergabe die Bedingungen des Datensatzes prüfen; der Datensatz selbst ist nicht enthalten.
- **Bibliotheken/Dienste:** Ultralytics YOLOv8, FastAPI, n8n, Google APIs — jeweils unter eigener Lizenz (Lizenzbedingungen prüfen).
- **Illustrationen:** unDraw-SVGs im Dashboard.

## 11. Noch einmal: vollständige Quelle

Alle Dateien, die Historie und die englische Projekt-README sind öffentlich:
**https://github.com/SYR8/PhytoAI**
