<div align="center">

# 🌱 PhytoAI

**ESP32-Sensoren + Kamera-Blick + n8n + KI + Dashboard = eine Pflanze, die sagen kann, wann sie Aufmerksamkeit braucht.**

[![ESP32](https://img.shields.io/badge/ESP32-WROOM-informational)](https://www.espressif.com/en/products/socs/esp32)
[![ESP32-CAM](https://img.shields.io/badge/ESP32--CAM-Kamera-blueviolet)](https://www.espressif.com/en/products/socs/esp32)
[![n8n](https://img.shields.io/badge/n8n-Workflow-orange)](https://n8n.io/)
[![Google Sheets](https://img.shields.io/badge/Google%20Sheets-Speicher-34a853)](https://developers.google.com/sheets/api)
[![Google Drive](https://img.shields.io/badge/Google%20Drive-Bilder-4285f4)](https://developers.google.com/drive)
[![YOLOv8](https://img.shields.io/badge/YOLOv8n--cls-PlantVillage-red)](https://docs.ultralytics.com/)
[![License: MIT](https://img.shields.io/badge/Lizenz-MIT-success)](LICENSE)
[![Status](https://img.shields.io/badge/Status-erster%20Echtpflanzen--Lauf%20geplant-yellow)](#aktueller-status)

</div>

Die meisten Pflanzenprojekte enden bei einer Zahl wie der Bodenfeuchte. PhytoAI verbindet diese Werte
mit Kameraaufnahmen, Verlauf, KI-Interpretation und einem Dashboard, damit der Besitzer versteht, was
die Pflanze wirklich braucht.

> Englische Fassung: **[README.md](README.md)**

**Ehrlicher Status in einem Satz:** Die Softwarekette ist implementiert und mit Simulationen und
Testdaten getestet. Die Hardwarekomponenten wurden einzeln auf dem Prüfstand getestet; der erste
kontinuierliche End-to-End-Lauf mit einer echten Pflanze ist für heute geplant.

## Inhalt

1. [Überblick](#überblick)
2. [Was PhytoAI kann](#was-phytoai-kann)
3. [Warum dieses Projekt spannend ist](#warum-dieses-projekt-spannend-ist)
4. [Aktueller Status](#aktueller-status)
5. [Systemfluss](#systemfluss)
6. [Repository-Karte](#repository-karte)
7. [Was man nachbauen kann](#was-man-nachbauen-kann)
8. [Benötigte Hardware](#benötigte-hardware)
9. [Benötigte Software und Dienste](#benötigte-software-und-dienste)
10. [Kamera und KI-Pflanzeninspektion](#kamera-und-ki-pflanzeninspektion)
11. [Daten und Projektgedächtnis](#daten-und-projektgedächtnis)
12. [PlantVillage und YOLO-Modell](#plantvillage-und-yolo-modell)
13. [Dashboard und Benachrichtigungen](#dashboard-und-benachrichtigungen)
14. [Auf n8n gebaut: fast jeder Dienst ist austauschbar](#auf-n8n-gebaut-fast-jeder-dienst-ist-austauschbar)
15. [Workflow-Karte](#workflow-karte)
16. [Aufbauanleitung](#aufbauanleitung)
17. [Test und Verifikation](#test-und-verifikation)
18. [Fehlersuche](#fehlersuche)
19. [Datenschutz und Sicherheit](#datenschutz-und-sicherheit)
20. [Grenzen und Zukunftsideen](#grenzen-und-zukunftsideen)
21. [Lizenz und Attribution](#lizenz-und-attribution)
22. [Mitmachen und selbst bauen](#mitmachen-und-selbst-bauen)

## Überblick

Pflanzen sterben selten, weil ein einzelner Wert für eine Minute falsch war. Sie leiden, wenn die
Pflege unregelmäßig wird: Gießen nach Gefühl, keine Erinnerung an letzte Woche, und niemand bemerkt
das erste kleine Warnzeichen.

Genau darauf ist PhytoAI gebaut. Ein ESP32-WROOM misst Pflanze und Umgebung, eine Kamera sieht sie
an, n8n koordiniert alles, Google Sheets und Drive bilden ein transparentes Gedächtnis, ein lokaler
YOLOv8-Klassifikator und Cloud-KI-Agenten interpretieren die Beobachtungen, und ein Dashboard zeigt
den Zustand und fragt bei wichtigen Entscheidungen einen Menschen.

**Positionierung:** ein KI-gestütztes Pflanzenpflege-System, das beobachtet, misst, erinnert, erklärt
und bei der Pflege hilft. Es ist keine Blackbox, die heimlich entscheidet — jede KI-Ausgabe ist
beratend, und zwischen jedem KI-Vorschlag und jedem Aktor liegen deterministische Code-Guardrails.

**Schichten des Systems:**

- **ESP32/WROOM** misst Pflanze und Umgebung.
- **Die Kamera ist ein zentraler Bestandteil des vollständigen Systems** — sie liefert den visuellen Beleg, nicht nur einen Zusatzwert.
- **n8n** koordiniert die Datenpipeline und alle Integrationen.
- **Google Sheets/Drive** sind das transparente Gedächtnis und der Speicher.
- **Der PlantVillage/YOLO-Dienst** liefert die visuelle Pflanzengesundheits-Analyse.
- **Die KI-Assistenzschicht** interpretiert und erklärt Beobachtungen.
- **Das Dashboard** zeigt Status, Trends, Bilder, Hinweise und Empfehlungen.
- **Wiederholte Beobachtungen und Besitzer-Bestätigungen bilden einen künftigen Lernkreislauf** (siehe Datensatz-Flywheel).

## Was PhytoAI kann

Hier stehen nur implementierte oder klar entworfene Funktionen.

- **Pflanze und Umgebung messen** — Bodenfeuchte, Boden-/Wasser-/Lufttemperatur, Luftfeuchte,
  Topfgewicht, Licht und Tankstand, nach der am Prüfstand verifizierten Pin-Belegung.
- **Pflegeentscheidungen sicher ausführen** — der WROOM steuert Pumpe und Heizung aus dem
  Entscheidungs-JSON; Firmware-Grenzen kann keine KI-Ausgabe übersteuern.
- **Pflanzenbilder aufnehmen** — die ESP32-CAM macht Tagesfotos und wöchentliche Scan-Fotos (Kabelstrom).
- **Visuelle Gesundheitssignale analysieren** — ein lokaler YOLOv8n-cls-Klassifikator plus Vision- und
  Behandlungs-Agenten erzeugen eine unbestätigte Hypothese, bis der Besitzer sie bestätigt.
- **Beobachtungen und Bilder speichern** — Zeilen in Google Sheets, Fotos in Google Drive, Zeitstempel in UTC.
- **Trends zeigen** — das Dashboard zeichnet Feuchte, Gewicht und Temperaturen aus echten Ereignisdaten.
- **Hinweis-Einträge erzeugen** — Benachrichtigungszentrum im Dashboard, optional Browser-Hinweise bei offener Seite.
- **Antworten und unterstützen** — der implementierte Assistenten-Pfad antwortet aus gespeicherten
  Daten (deterministische Absichten) oder aus begrenzten KI-Zusammenfassungen.
- **Beobachtungen für spätere Verbesserung sammeln** — geplantes Datensatz-Flywheel: bestätigte Scans
  können später exportiert und zur Feinabstimmung des Modells auf die echten Wohnbedingungen genutzt werden.

## Warum dieses Projekt spannend ist

- **Hardware + IoT + Automation + KI-Vision + Dashboard in einem Aufbau.** Vom Wägezellen-Signal bis
  zur KI-Zusammenfassung im Browser — ein durchgängiges Projekt.
- **Kamera- und Sensor-Fusion.** Eine Feuchte-Zahl allein kann nicht sagen „diese Blätter haben sich
  seit letzter Woche verändert". Zahlen plus Bilder ergeben Kontext, den keines allein liefert.
- **Pflanzengedächtnis.** Die Geschichte der Pflanze liegt in einer Tabelle, die man selbst öffnen
  kann — kein Lock-in, keine versteckte Datenbank.
- **Künftiges Datensatz-Flywheel.** Scans, Modellausgaben und Besitzer-Urteile sammeln sich als
  menschlich bestätigte Labels, damit das Modell später für echte Wohnbedingungen verbessert wird.
- **Menschliche Kontrolle und Sicherheit.** Offene Fragen warten auf eine Antwort (mit Timeout), die
  KI ist beratend, und Code-Guardrails (Tank leer, Gießabstand, Pumpen-/Wärmegrenzen, Dry-Run) kann
  kein Modell übersteuern.

## Aktueller Status

Die Softwarekette ist implementiert und mit Simulationen und Testdaten getestet. Die
Hardwarekomponenten wurden einzeln auf dem Prüfstand getestet; der erste kontinuierliche
End-to-End-Lauf mit einer echten Pflanze ist für heute geplant.

| Teil | Status |
|---|---|
| n8n-Workflow (`workflows/phytoai.json`, 224 Nodes) | **implementiert + mit Simulationen/Testdaten getestet** (Pinned-Data- und Simulationsläufe). **Besitzerspezifisch:** auf der Instanz des Besitzers ggf. deaktiviert; `dry_run_mode` ist `TRUE`, bis die Aktorik bewusst aktiviert wird. |
| Dashboard (`dashboard/`) | **implementiert + getestet** (Headless-End-to-End-Suiten: Startanfragen, Diagramme, Assistent, Benachrichtigungen — siehe `docs/dashboard-ux-v3.md`, `docs/dashboard-notifications.md`); vom Besitzer auf einem statischen Host deployt. |
| WROOM-Produktionsfirmware | **implementiert**; nur kompiliert — noch nicht geflasht. |
| WROOM-Kalibrierungs-/Bench-Sketch | **auf dem Prüfstand getestet** am 15.09.2026 (Werte in `docs/hw-bench-2026-09-15.md`). |
| ESP32-CAM-Produktionsfirmware | **implementiert**; nur kompiliert — noch nicht geflasht; 14-Test-Plan in `firmware/esp32cam_production/PRODUCTION-TESTS.md`. |
| ESP32-CAM-Testsketch | **auf dem Prüfstand getestet** (Kamerainit, WLAN, Webhook-Upload). |
| Lokaler Krankheits-Klassifikator (`yolo-service/`) | **implementiert + getestet**: auf dem Server des Besitzers mit trainiertem Modell im Einsatz (Validierungswerte unten). |
| Hinweiszentrum in der App + Browser-Hinweise bei offenem Tab | **implementiert + getestet** (`docs/dashboard-notifications.md`). |
| Push bei geschlossener Seite (Web Push / Service Worker) | **nicht implementiert**. |
| Dauerbetrieb an echter Pflanze | **für heute geplant** — der erste kontinuierliche End-to-End-Lauf ist geplant und noch nicht verifiziert. |
| Kamerastrom | **kabelgebunden** (verifiziert); alte Batteriefelder bleiben in Schema/Firmware und sind obsolet. |

Gemessenes Modellergebnis (nur Validierungssplit): **96,08 % Top-1 / 99,955 % Top-5**; es gibt keinen
separaten Testsatz und keinen Trainingsgenauigkeits-Messwert, daher wird keiner behauptet. Details:
[PlantVillage und YOLO-Modell](#plantvillage-und-yolo-modell).

## Systemfluss

```text
Sensoren + Kamera -> WROOM/ESP32-Gerät -> n8n-Workflow -> Sheets/Drive
      -> YOLO/KI-Analyse -> Dashboard/Benachrichtigungen -> Besitzer
```

1. **Messen:** Der WROOM wacht nach Plan auf, liest alle Sensoren und sendet JSON an den Workflow
   (`POST /webhook/core/sensor`). Die Kamera sendet ein Tagesfoto (`/webhook/core/photo`) und ein
   wöchentliches Scan-Foto (`/webhook/yolo-scan`).
2. **Entscheiden:** Der Workflow liest Historie und SystemConfig, ein KI-Agent schlägt aus der
   Historie eine Entscheidung vor, und deterministische Guardrails (Code, nie KI) erzwingen die
   Sicherheitsregeln. Der WROOM führt nur das Entscheidungs-JSON aus — er entscheidet nie lokal.
3. **Speichern:** Ereignisse landen in `Events`; Fotos gehen in Google Drive; Scans, Notizen und
   Konfiguration liegen in eigenen Tabs.
4. **Analysieren:** Der lokale YOLOv8-Klassifikator plus Vision-/Judge-/Behandlungs-Agenten erzeugen
   ein Urteil, das der Besitzer bestätigt (Human in the Loop).
5. **Anzeigen und fragen:** Das Dashboard liest Sheets/Drive mit dem eigenen Google-Login; offene
   Fragen werden `Notifications`-Zeilen mit Resume-URL, und Dashboard-Buttons setzen den pausierten
   Workflow fort.

## Repository-Karte

- `dashboard/` — das statische Web-Dashboard (`index.html`, `styles.css`, `app.js`, `config.example.js`, Assets).
- `firmware/` — Produktions- und Bench-Firmware: `wroom_production/`, `wroom_calibration/`, `esp32cam_production/`, `esp32cam/` (mit Testplänen).
- `workflows/` — der importierbare n8n-Workflow (die annotierte Kopie ist in der [Workflow-Karte](#workflow-karte) beschrieben).
- `scripts/` — Datensatz-Vorbereitung und YOLO-Trainingspipeline (Bootstrap + Flywheel).
- `yolo-service/` — lokaler CPU-Klassifikator-Dienst (FastAPI + Ultralytics) inkl. eingesetztem trainierten Checkpoint.
- `Hardware/` — Bauteilliste; Verkabelung in `docs/SmartPot-Full-Engineering-Spec-PRD.md` und `docs/hw-bench-2026-09-15.md`.
- `test-data/` — sichere Beispielzeilen für eine Test-Tabelle (keine echten Pflanzendaten).
- `docs/` — Engineering-Plan und Schemas (`Plan.md`), Status- und Audit-Dokumente, Dashboard- und Benachrichtigungs-Verträge.
- `STATUS.md` — aktueller Projektstand mit offenen Punkten.
- `LICENSE` — MIT.

## Was man nachbauen kann

PhytoAI lässt sich in Stufen bauen — aber nur der vollständige Aufbau ist das vollständige System.

| Aufbau | Was es ist | Mit Kamera? |
|---|---|---|
| **Vollständiges PhytoAI** | Der ganze Kreislauf: Sensoren, Kamera, Workflow, Speicher, KI-Analyse, Dashboard, Benachrichtigungen | **Ja — die Kamera gehört zum vollständigen System** |
| **Sensor-Aufbau** | WROOM + Sensoren + Relais/Pumpe/Heizung, Workflow und Speicher; ohne Bildanalyse | Nein |
| **Kamera + Dashboard-Aufbau** | Kamera, Bildpfad im Workflow, Speicher, Dashboard und Benachrichtigungen; Sensoren können später folgen | Ja, aber ohne Sensorik fehlt den Pflegeentscheidungen die Eingabe |
| **Reine Software-/Dashboard-Demo** | Keine Hardware: Workflow importieren, Testtabelle befüllen, Pipeline mit Test-Payloads üben, Dashboard lokal starten | Nein |

Ein reduzierter Aufbau ist ein guter Einstieg, aber nicht dasselbe wie das vollständige PhytoAI —
zum Beispiel sind Scan-Urteile am aussagekräftigsten, wenn Kamera-Bilder und Sensorhistorie
zusammen vorhanden sind.

## Benötigte Hardware

Aus `Hardware/Hardware-list.txt` plus der am Prüfstand verifizierten Pin-Belegung in
`docs/hw-bench-2026-09-15.md`:

**Kern:** ESP32-WROOM-Devboard (+ Expansion Board wie in der Liste) · 5-V-4-Kanal-Relaisplatine ·
DHT22 · kapazitiver Bodenfeuchtesensor · 2× DS18B20 (wasserdicht, ein OneWire-Bus) ·
1-kg-Wägezelle + HX711 · 3–5-V-Tauchpumpe · 5-V-/10-W-USB-Aquarienheizung ·
XKC-Y25-Tanksensor · 5-V-USB-Netzteil und Verkabelung.

**Kamera (Teil des vollständigen Aufbaus):** ESP32-CAM mit **eigener stabiler 5-V-Versorgung** —
niemals über einen beliebigen GPIO versorgen.

**Optionale Extras:** LDR-Modul (digitaler Ausgang genutzt), Status-LED.

**Pins (am Prüfstand verifiziert, `firmware/wroom_production/wroom_production.ino`):** Pumpe **13**,
Heizung **16** (beide Relais active-low), HX711 **DT 26 / SCK 33**, OneWire **4**, Boden-ADC **34**,
Tank **27** (LOW = leer), DHT22 **14**, LDR **25**, LED **2**.

**Sicherheitshinweise (verbindlich):** Heizung **nur untergetaucht** betreiben; die Firmware erzwingt
40,0 °C Abschaltung, verweigert den Start ab ≥ 39,5 °C und begrenzt durchgehende Ansteuerung auf
120 s; Relais sind beim Boot AUS. Ein früher Brief enthielt eine veraltete Pin-Belegung (Pumpe 4,
HX711 5/25, OneWire 13, Boden 26) — sie ist überholt; nutze die Tabelle oben.

## Benötigte Software und Dienste

- **Arduino IDE oder arduino-cli** mit **ESP32-Core 3.3.11**; Bibliotheken: ArduinoJson 7.4.2,
  HX711 0.7.5, OneWire 2.3.8, DallasTemperature 4.0.6, DHT 1.4.7 (Versionen aus dem Produktionsbuild).
- **n8n** (Docker empfohlen) — `workflows/phytoai.json` importieren.
- **Python 3** für Trainingsskripte und Klassifikationsdienst (`scripts/README.md`,
  `yolo-service/requirements.txt`).
- **Ein Browser** für das Dashboard — kein Build, keine npm-Abhängigkeiten.
- **Optional:** HTTPS-Statikhost für das Dashboard; kleiner CPU-Server/VPS für `yolo-service`.

Konten, die man selbst anlegt (nur Platzhalter — niemals echte Zugangsdaten committen):

| Dienst | Wofür | Hinweise |
|---|---|---|
| Google-Konto + Google-Cloud-Projekt | Sheets + Drive + OAuth-Login fürs Dashboard | **Google Sheets API** und **Google Drive API** aktivieren; OAuth-**Web**-Client anlegen; das Client-**Secret** wird hier nie benutzt oder gespeichert. |
| Google-Sheets-Tabelle | Die Datenbank | Fünf Tabs mit den exakten Kopfzeilen aus [Daten und Projektgedächtnis](#daten-und-projektgedächtnis) anlegen oder die Seed-CSVs aus `test-data/dashboard-seed/` importieren. |
| n8n-Instanz | Führt den Workflow aus | Selbst gehostet (Docker) oder eigener Server. |
| OpenRouter-Konto + API-Schlüssel | Die KI-Agenten (Gemma) | Für KI-Zweige nötig; deterministische Assistenten-Absichten funktionieren ohne LLM-Aufruf. |
| Statikhost (optional) | Dashboard | Beliebiger HTTPS-Host. |
| VPS/kleiner Server (optional) | Lokaler Klassifikator (`yolo-service`) | Nur CPU, aus n8n im selben Docker-Netz erreichbar. |
| Perenual-Schlüssel (optional) | Beratende Arten-/Schädlingsreferenz | Free Tier; der Workflow degradiert ohne ihn sauber. |

**Konfiguration:** [`dashboard/config.example.js`](dashboard/config.example.js) nach
`dashboard/config.js` kopieren und Client-ID, Spreadsheet-ID und n8n-Host eintragen. Jeder
Firmware-Sketch hat einen `secrets.h`-Abschnitt (`SECRET_WIFI_SSID`, `SECRET_WIFI_PASSWORD`,
`SECRET_BASE_URL`, `SECRET_WEBHOOK_PREFIX`); `secrets.h` ist git-ignored — niemals committen. In
Produktion den Präfix `/webhook` nutzen (`/webhook-test` gehört zum n8n-Testlistener).

## Kamera und KI-Pflanzeninspektion

Das ist der Teil, der PhytoAI mehr macht als einen Sensor-Logger.

- **Visuelle Beobachtung:** Die ESP32-CAM nimmt ein Tagesfoto und ein wöchentliches Scan-Foto auf
  (manuelles Umstellen, feste Standardansicht). Der Kamerastrom ist **kabelgebunden** — es gibt kein
  Batterieverhalten, das man erfinden oder erwarten könnte.
- **Upload:** Die Kamera sendet Bilder per HTTPS an den Workflow (Tagesfoto- und Scan-Pfad),
  Fire-and-Forget mit Wiederholungen; Zeitstempel in UTC.
- **Speicher:** Bilder landen in Google-Drive-Ordnern, referenziert aus `SystemConfig`.
- **Analyse:** Ein lokaler YOLOv8n-cls-Klassifikator (CPU) liefert eine niedrig gewichtete
  Zweitmeinung; Vision-, Judge- und Behandlungs-Agenten bewerten das Bild zusammen mit der Historie
  und erzeugen eine **unbestätigte Hypothese** mit Begründung.
- **Besitzer-Bestätigung:** Das Urteil wird eine offene Benachrichtigung; der Besitzer antwortet im
  Dashboard mit Bestätigt / Falsch / Unsicher, und eine Nachfrage prüft, ob das Problem behoben ist.
- **Warum das wichtig ist:** Sensorzahlen sagen, *wie nass* der Boden ist; Bilder zeigen, *ob die
  Pflanze gesund aussieht* — Gelbfärbung, Flecken oder Schäden, die kein Feuchtewert erfasst.
  Zusammen ergeben sie mehr Kontext als Sensoren allein, und die bestätigten Antworten ermöglichen
  erst das künftige Datensatz-Flywheel.

## Daten und Projektgedächtnis

Eine Tabelle, **fünf Tabs** (Kopfzeilen exakt wie in `test-data/dashboard-seed/`):

**`Events`** — eine Zeile pro Sensor-/Foto-Ereignis:
`EventID, Timestamp, EventType, MoisturePercent, SoilTempC, WaterTempC, AirTempC, AirHumidityPercent, WeightGrams, LightLevel, TankEmpty, WateringTriggered, WaterDurationSeconds, HeaterUsed, HeaterDurationSeconds, SpeciesGuess, SpeciesConfidence, PhotoFileID, AnomalyDetected, AnomalyDescription, AI_Notes, ReasoningSummary, WateringAborted, FinalWaterTempC, WaterAddedGrams`

**`SystemConfig`** — Key/Value-Speicher. Referenzschlüssel: `pot_latitude`, `pot_longitude`,
`last_watered_utc`, `last_species_guess`, `species_confidence`, `next_sunrise_utc`, `next_sunset_utc`,
`last_tank_empty_alert_sent`, `dry_run_mode`, `min_rewater_interval_hours`, `scan_session_active`,
`max_pump_seconds`, `max_water_temp_c`, `preheat_margin_c`, `preheat_lead_minutes`,
`heater_hysteresis_c`, `flash_dark_threshold`, optional `camera_battery_*`, `drive_*_folder_id`,
`push_vapid_public_key` (heute ungenutzt).

**`DiseaseScans`** — Scan-Ergebnisse:
`timestamp, drive_links, vision_opinion, yolo_opinion, judge_verdict, judge_reasoning, treatment_plan, user_verdict, treatment_outcome, ai_notes`

**`Notifications`** — Human-in-the-Loop-Warteschlange:
`timestamp, type, title, message, response_options, status, response, resume_url, context_ref`
(Status: `pending` -> `done`/`expired`)

**`AgentNotes`** — Arbeitsgedächtnis der Agenten:
`timestamp, agent, note, context_ref, status`

- **Zeitstempel:** UTC ISO-8601, alle enden auf `Z`.
- **Dashboard-Trends:** Diagramme entstehen aus `Events`-Zeilen (ein Punkt pro Zyklus), nie aus erfundenen Daten.
- **Späteres Modelltraining:** `scripts/export_dataset.py` kann besitzerbestätigte `DiseaseScans`-Zeilen
  in ein Trainingsset verwandeln; `scripts/train.py --mode flywheel` ist der geplante Weg zur
  Feinabstimmung auf die echten Wohnbedingungen dieser Pflanze.

**Wichtige Semantik:** `ml_est` ist eine **Schätzung** aus Laufzeit × kalibriertem Fluss
(`9.706 ml/s` Referenz). Das **gemessene** Gewichtsdelta ist derzeit **nur Gerätelog** — der Workflow
persistiert es nicht, daher bleibt `WaterAddedGrams` bewusst leer. Aufnahme-Grund und Lichtbedingung
pro Foto sind **nicht persistiert**. Firmware-Grenzen (40,0 °C, 39,5 °C, 120 s, 8 s Watchdog) sind
allem übergeordnet; Workflow-Guardrails (Tank leer erzwingt Gießen aus, `min_rewater_interval_hours`,
`max_pump_seconds`, `max_water_temp_c`, `dry_run_mode`) sind der KI übergeordnet; die KI ist nur
beratend.

## PlantVillage und YOLO-Modell

- **Datensatz:** PlantVillage (Farbversion, spMohanty/PlantVillage-Dataset), **38 Klassen**; das
  vollständige Dataset umfasst rund 54.000 Bilder. Für den Bootstrap wurden **maximal 300 Bilder pro
  Klasse** verwendet (ca. 11.000 pro Epoche), weil das Training nur mit CPU läuft. Die exakte Zahl
  der tatsächlich verwendeten Bilder lässt sich nicht mehr nachvollziehen (der vorbereitete Datensatz
  wurde vom Server des Besitzers gelöscht).
- **Aufbereitung:** Ein Skript lädt per sparse Checkout und baut eine `train/<Klasse>` +
  `val/<Klasse>`-Struktur mit **80/20-Split pro Klasse** und festem Seed (reproduzierbar); die
  Standard-Augmentierung von Ultralytics bleibt aktiv.
- **Methode:** **YOLOv8n-cls Bootstrap-Feintuning** (Transfer Learning), **12 Epochen**,
  **160 × 160** Pixel, **Batch-Größe 32**, **CPU-Training**, fester Seed.
- **Gemessenes Ergebnis (nur Validierungssplit):** **96,08 % Top-1** und **99,955 % Top-5**.
- Es wurde **kein separater Testsatz** zurückgelegt und es gibt keinen Trainingsgenauigkeits-Messwert —
  daher wird **keine Testgenauigkeit behauptet**.
- **Eingesetzter Checkpoint:** `yolo-service/models/model.pt` ist der trainierte Checkpoint des
  laufenden Dienstes; der Dienst lädt automatisch neu, wenn die Datei sich ändert.
- **Rolle im Workflow:** Der Klassifikator ist eine **niedrig gewichtete Zweitmeinung** neben
  Vision-Agent und Judge; der Besitzer bestätigt Urteile, bevor sie als Labels zählen.

## Dashboard und Benachrichtigungen

- **Deployment:** beliebiger statischer HTTPS-Host (kein Build). Lokal: `npx serve dashboard` oder
  `python -m http.server` im Ordner `dashboard/`.
- **Routen:** Overview, Timeline, Assistant, Doctor, Photos, Insights, Settings.
- **Zweck:** Zustand, Trends, Bilder, Scan-Urteile und offene Fragen zeigen — mit dem eigenen
  Google-Login liest das Dashboard Sheets/Drive direkt (keine Server-Secrets im Browser).
- **Benachrichtigungszentrum (in der App):** Der Timeline-Screen listet alle `Notifications`-Zeilen
  mit Schweregrad, Quelle, Zeit, Pflanzenkontext und Antwortbuttons; es gibt keinen erfundenen
  Gelesen-Status (der Status kommt aus dem Sheet).
- **Browser-Hinweise:** optional; sie erfordern einen Klick auf „Enable browser alerts“ in den
  Einstellungen und die erteilte Browser-Berechtigung — die Berechtigung wird **nie automatisch beim
  Laden** angefragt.
- **Bei offenem, pollendem Dashboard:** Hinweise werden einmal pro Minute geprüft und nur bei
  sichtbarem Tab; versteckte oder geschlossene Tabs bekommen nichts.
- **Push bei geschlossener Seite ist nicht implementiert:** kein Service Worker, kein Web Push;
  `SystemConfig.push_vapid_public_key` ist ungenutzt. Details: `docs/dashboard-notifications.md`.

## Auf n8n gebaut: fast jeder Dienst ist austauschbar

n8n ist der Integrations-Hub von PhytoAI. ESP32-Gerät, Sensoren, Kamera, Speicher, KI-Analyse,
Dashboard und Benachrichtigungen müssen nicht jeden anderen Dienst direkt kennen — der Workflow
verbindet sie. Man kann Sheets durch eine Datenbank, Drive durch einen anderen Dateispeicher oder das
Benachrichtigungsziel durch den bevorzugten Dienst ersetzen, indem man den jeweiligen Workflow-Zweig
anpasst.

| Systemverantwortung | Aktuelle Umsetzung | Mögliche Alternative |
|---|---|---|
| Ereignis-/Datenspeicher | Google Sheets | PostgreSQL, MySQL, Supabase, Airtable, CSV oder ein anderer Datenbank-Node |
| Bildspeicher | Google Drive | S3-kompatibler Speicher, Dropbox, Nextcloud, lokales Dateisystem oder ein anderer Datei-Node |
| Benachrichtigungen | Dashboard/In-App und Browser-Hinweise bei offener Seite | Telegram, Discord, E-Mail, Matrix, Slack, Web Push oder ein anderer Dienst |
| Vision-Analyse | PlantVillage/YOLO-Dienst + KI-Analyse | Ein anderes lokales Modell, Cloud-Vision-API, OpenAI-kompatibler Vision-Endpunkt oder eigener Dienst |
| Assistenten-Antwort | n8n/KI-Workflow | Anderer LLM-Anbieter, lokales Modell oder eigener Agent |
| Dashboard-Quelle | Aktuelle Dashboard/Sheets-Integration | Konnektor ersetzen und das normalisierte Antwortformat beibehalten |
| Automatisierungs-Engine | n8n | n8n als Integrations-Hub behalten und einzelne Nodes nach Bedarf ersetzen |

**Vor dem Austauschen lesen:**

- Das sind **Anpassungspfade, keine bereits getesteten Alternativen**.
- Man muss **eigene Zugangsdaten** anlegen und Node-Einstellungen anpassen.
- Ersatz-Nodes sollten den **Ein-/Ausgabe-Vertrag des Workflows erhalten**.
- Die **Standard-Implementierung bleibt der verifizierte Pfad** — alles andere ist das eigene Experiment.

## Workflow-Karte

- Der Workflow enthält **Navigations-Sticky-Notes**, damit man ihn nach dem Import Zweig für Zweig
  verfolgen kann (Eingang, Normalisieren, Sicherheit/Validierung, Speicher, Bildspeicher,
  Vision-Spezialist, KI-Assistent, Benachrichtigungen, Dashboard-Quelle, Besitzer-Konfiguration).
- Eine **annotierte Kopie** des Workflows liegt in `workflows/` zum Lesen und Lernen; das Original
  `workflows/phytoai.json` bleibt der bewährte Produktions-Export.
- Die Sticky-Notes markieren, **wo Speicher, Bildspeicher, Benachrichtigungen und KI-Anbieter
  ersetzt werden können** (siehe Tabelle oben).
- Nodes und Zugangsdaten, auf die die Dokumentation verweist, sollten **nicht umbenannt werden** —
  das hält Anleitungen, Dashboard-Verträge und Resume-URLs funktionsfähig.
- Anpassungshinweise: siehe [Auf n8n gebaut](#auf-n8n-gebaut-fast-jeder-dienst-ist-austauschbar).

## Aufbauanleitung

Empfohlene Reihenfolge:

```text
klonen -> Hardware -> Abhängigkeiten -> Dienste -> Fünf-Tab-Schema -> Workflow-Zugangsdaten per Name
      -> Firmware flashen -> Messwerte prüfen -> Dashboard deployen -> Benachrichtigungen testen -> Fehlersuche
```

1. **Repository klonen.**
2. **Hardware vorbereiten** (Sensoren, Relais, Pumpe, Heizung, Kamera nach dem Hardware-Abschnitt).
3. **Abhängigkeiten installieren** (Arduino-Core + Bibliotheken, n8n, Python für Dienst/Skripte).
4. **Dienste konfigurieren**: Google-Cloud-APIs + OAuth-Client; n8n-Instanz; OpenRouter-Schlüssel.
5. **Speicher-Schema anlegen**: fünf Tabs mit exakten Kopfzeilen (oder `test-data/dashboard-seed/*.csv`
   zuerst in eine *Test*-Tabelle importieren).
6. **Workflow konfigurieren**: `workflows/phytoai.json` importieren, Zugangsdaten **per Name** in der
   n8n-UI anlegen, Sheet-/Ordner-IDs in `SystemConfig` setzen.
7. **Firmware flashen**: zuerst `firmware/wroom_calibration/` (Prüfstand, kalibrieren, Werte
   notieren), dann `firmware/wroom_production/` nach Ausfüllen von `secrets.h` und den
   Bench-Konstanten; danach die Kamera-Firmware (`firmware/esp32cam_production/`) mit eigener
   5-V-Versorgung.
8. **Messwerte prüfen**: Seriellen Monitor beobachten, dann Zeilen in `Events` bestätigen.
9. **Dashboard deployen**: Konfiguration kopieren, statisch ausliefern, anmelden, Daten prüfen.
10. **Benachrichtigungen testen**: zuerst das Zentrum in der App, dann optional die Browser-Hinweise.
11. **Fehlersuche** mit dem Abschnitt unten.

## Test und Verifikation

**Simulations- und Testdaten-Tests (erledigt):** Der Workflow wurde mit Pinned-Data- und
simulierten Ausführungen geübt; das Dashboard mit Headless-End-to-End-Suiten (Startverhalten,
Diagramme, Assistenten-Pfade, Benachrichtigungs-Steuerung); Testtabellen nutzen die sicheren
Seed-Daten aus `test-data/`.

**Hardware-Prüfstand-Tests (erledigt):** Der Kalibrierungs-Sketch wurde geflasht und ausgeführt; die
gemessenen Konstanten (Skalenfaktor `1068.335`, Boden trocken/nass `4095`/`1964`, Pumpenfluss
`9.706 ml/s`, Tank LOW = leer, Relais active-low, DS18B20-Adressen) stehen in
`docs/hw-bench-2026-09-15.md`. Der Kamera-Testsketch wurde am Prüfstand getestet (Init, WLAN, Upload).

**Als Nächstes geplant:** Der **erste kontinuierliche End-to-End-Lauf mit einer echten Pflanze ist
für heute geplant**. Er gilt nicht als erfolgreich, bis der Besitzer die Ergebnisse bestätigt.

**Was ein neuer Nachbauer testen sollte:**

- [ ] WROOM bootet; serielles Log zeigt WLAN + NTP + Sensorwerte.
- [ ] Sensorwerte sind plausibel (mit Referenz vergleichen); eigene Werte kalibrieren und notieren.
- [ ] Tanksensor: LOW = leer bestätigt; Relaispolarität bestätigt (Dry-Run löst nichts aus).
- [ ] Ein Test-Sensor-POST erzeugt Entscheidungsantwort und `Events`-Zeile.
- [ ] `dry_run_mode=TRUE` nullt die Aktuatorfelder in der Antwort.
- [ ] Guardrails: Tank leer erzwingt Gießen aus; der Gießabstand wird eingehalten.
- [ ] HITL: Eine `Notifications`-Zeile erscheint, ihr Resume setzt sie auf `done`.
- [ ] Dashboard lädt und zeigt die eigenen Daten; Testtabellen-Override funktioniert (`?sheet=`).
- [ ] Browser-Berechtigung wird nur nach dem Klick in den Einstellungen angefragt; alle Zustände erscheinen.
- [ ] Kamera: `firmware/esp32cam_production/PRODUCTION-TESTS.md` abarbeiten (14 Tests; mehrere brauchen Hardware).

## Fehlersuche

Bestätigte Probleme und Lehren:

- **Über API erzeugte Sheets-Nodes können leere/legacy „Column to match on“ haben** — nach
  programmatischen Änderungen visuell in der n8n-UI prüfen.
- **Eine veraltete Pin-Belegung kursierte in einem frühen Brief** (Pumpe 4, HX711 5/25, OneWire 13,
  Boden 26). Sie ist falsch; nutze die verifizierte Pin-Belegung oben.
- **Der alte HX711-Faktor `305.070f` ist ungültig** (mit fehlerhaftem, nicht offset-kompensiertem
  Auslesen berechnet). Eigenen kalibrierten Faktor verwenden (Referenz: `1068.335`).
- **Die Heizung lief zunächst nicht**, weil die Relaisspule zu wenig Strom bekam — eine eigene
  Versorgung löste das. Bleibt die Heizung aus: Relaisstrom, Polarität und die
  Verweigerungs-/Abschaltbedingungen der Firmware prüfen.
- **Häufige HTTPS-Testaufrufe wurden vom Heimrouter blockiert**; wenn Geräte-Uploads scheitern,
  obwohl der Server erreichbar ist, die Sicherheits-/DoS-Einstellungen des Routers prüfen.
- **Dashboard-API-Aufrufe scheitern trotz vorhandener Daten** — das angemeldete Google-Konto muss
  Zugriff auf Tabelle und Drive-Ordner haben; dieses Teilen ist die Zugriffsgrenze.
- **Workflow-Webhook liefert 404** — der Workflow muss aktiv sein (oder Testlistener mit
  `/webhook-test`-Präfix nutzen).
- *Eigene Verifikation nötig:* offene Hardware-Fragen in `STATUS.md` (Relaisplatine, Netzteil, freie
  GPIOs) bleiben offen, bis sie am eigenen Aufbau gemessen sind.

## Datenschutz und Sicherheit

- **Keine Geheimnisse in diesem Repository.** `secrets.h`, `opencode.json`, `mcp-auth.json`, `.env*`,
  `client_secret_*.json`, `*.pem`, `*.key` und `yolo-service/models/` sind git-ignored.
- **Nur Platzhalter.** `dashboard/config.example.js` enthält `YOUR_...`-Platzhalter; niemals echte
  Spreadsheet-IDs, private Webhook-Hosts oder Tokens committen.
- **Eigene Zugangsdaten:** Google-, OpenRouter- und n8n-Zugangsdaten legt man selbst an; das
  OAuth-Client-**Secret** wird von diesem Projekt überhaupt nicht benutzt.
- **Kamera- und Überwachungs-Datenschutz:** Fotos von Pflanzen sind auch Fotos der eigenen Wohnung.
  Drive-Ordner privat halten und bei Screenshots Kontonamen, IDs und Hosts ausblenden.
- **Aktor- und Sensorsicherheit:** Heizung niemals ohne Wasser betreiben; Firmware-Grenzen
  respektieren; im `dry_run_mode` starten; die KI umgeht die Code-Guardrails nie.
- **Keine persönlichen oder Produktions-Kennungen committen** — persönliche E-Mails, Spreadsheet-IDs,
  OAuth-Secrets, Webhook-Hosts oder n8n-Tokens. Ein Pre-Push-Key-Scan ist in der Repository-Historie
  dokumentiert (`Select-String -Path workflows\phytoai.json -Pattern 'key=|api[_-]?key|bearer\s|sk-'`).

## Grenzen und Zukunftsideen

**Bekannte Grenzen (ehrliche Liste):**

- Der kontinuierliche End-to-End-Betrieb mit echter Pflanze ist **für heute geplant** — noch nicht verifiziert.
- Das System braucht WLAN und einen Server; ohne Internet läuft es nicht.
- Eine Kamera deckt sehr große Pflanzen nicht ab; die Ausrichtung ist fest und nur manuell verstellbar.
- Die Sensorkalibrierung kostet Zeit, und Push bei geschlossener Seite (Web Push) ist **nicht implementiert**.

**Zukunftsideen (vom Besitzer ausgewählt, nicht implementiert):**

- **Echtpflanzen-End-to-End-Tests** als feste Routine statt eines einmaligen Ereignisses.
- **Datensammlung im echten Zuhause** — mehr reale Bilder mit besitzerbestätigten Labels sammeln.
- **Besitzerbestätigte Labels** für das geplante Flywheel: regelmäßige Feinabstimmung mit
  `scripts/train.py --mode flywheel`, sobald genügend bestätigte Bilder vorliegen.
- **Künftiges Web Push / Service Worker** für Hinweise bei geschlossener Seite (Architekturplan liegt
  in `docs/dashboard-notifications.md`; gebaut ist nichts).
- **Stärkerer Continuous-Learning-Workflow** — ein klarerer, menschlich geprüfter Kreislauf von
  bestätigten Scans zur nächsten Modellgeneration.
- Peristaltische Dosierpumpe für KI-dosierte Nährstoffe/Behandlungen · Wasserkühlmodul (Lüfter +
  Peltier) für heiße Sommer · Akku-Paket aus gebrauchten Vape-Zellen · Standalone-WLAN-Variante ·
  mehrere ESP32-CAMs für große Pflanzen · Garten- und Mehrpflanzen-Skalierung.

## Lizenz und Attribution

- **Lizenz:** MIT — siehe [LICENSE](LICENSE). © 2026 Mohammad Abdin.
- **Datensatz:** PlantVillage-Farbbilder von spMohanty (`spMohanty/PlantVillage-Dataset`) — vor
  Weitergabe die eigenen Bedingungen des Datensatzes prüfen.
- **Modell/Bibliotheken:** Ultralytics YOLOv8 (Lizenzbedingungen für den eigenen Fall prüfen),
  FastAPI, n8n, Google APIs — jeweils unter eigener Lizenz.
- **Illustrationen:** unDraw-SVGs in `dashboard/assets/` (unDraw-Lizenz).

## Mitmachen und selbst bauen

Dies ist ein Solo-Lern-/Wettbewerbsprojekt, geteilt, damit andere ihre eigene Version bauen können.
Sinnvolle Beiträge: reproduzierbare Bugs melden, Dokumentation verbessern oder den Workflow für
andere Pflanzen anpassen. Bitte keine Zugangsdaten oder persönlichen Daten in Issues/Pull-Requests,
und die genutzte Baustufe nennen. Es gibt keine Support-Garantie; nichts hiervon ist
produktionszertifiziert.

**Vollständiger Quellcode, Historie und Dokumentation:** <https://github.com/SYR8/PhytoAI>
