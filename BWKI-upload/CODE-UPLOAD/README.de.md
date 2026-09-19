# PhytoAI — KI-gestützte Pflanzenüberwachung und Klimasteuerung

PhytoAI ist ein DIY-Smart-Pot-System: Ein ESP32-Gerät misst Bodenfeuchte, Temperaturen, Luftfeuchte, Topfgewicht, Licht und Tankstand, ein selbst gehosteter n8n-Workflow entscheidet über Gießen und Heizen, Google Sheets dient als Datenbank der Pflanze, und ein statisches Web-Dashboard zeigt den Zustand — optional mit Kamera und einem lokalen Bildklassifikator für Krankheitsverdacht.

> Englische Fassung: **[README.md](README.md)**.

**Ehrlicher Status in einem Satz:** Das Gesamtsystem lief am **19.09.2026** live durch — Telemetrie-Entscheidungen steuerten die echte Pumpe unter den Code-Guardrails, Tagesfoto-Analyse und Wochenscan-Kette liefen im Produktivbetrieb, und alle fünf Geräte-Webhooks wurden live verifiziert. Siehe [Aktueller Status](#4-aktueller-status).

---

## 1. Projekttitel und Ein-Satz-Erklärung

**PhytoAI** überwacht eine Pflanze rund um die Uhr und trifft Pflegeentscheidungen — Gießen und Wassererwärmung — aus der Sensorhistorie statt nach festem Zeitplan, und zeigt alles in einem Web-Dashboard. Es ist ein Einzelprojekt von **Mohammad Abdin** (`MOs`).

## 2. Was PhytoAI macht — der komplette Datenfluss

```
ESP32-WROOM ── Sensor-JSON ──▶ n8n-Workflow ── Entscheidungs-JSON ──▶ WROOM (Pumpe / Heizung)
ESP32-CAM   ── Fotos      ──▶ n8n-Workflow ──▶ Google Drive (Fotos) + KI-Analyse
n8n         ── liest/schreibt ──▶ Google Sheets (Events, SystemConfig, DiseaseScans,
                                    Notifications, AgentNotes)
n8n         ── offene Zeilen / Antworten ──▶ Dashboard (statische Seite, Google-Login des Nutzers)
Dashboard   ── Resume-URL-Aufrufe ──▶ n8n (Antworten von Menschen)
```

1. **Messen:** Der WROOM wacht nach Plan auf, liest alle Sensoren und sendet ein JSON an den Workflow (`POST /webhook/core/sensor`).
2. **Entscheiden:** Der Workflow liest Historie und SystemConfig, ein KI-Agent schlägt aus der Historie eine Entscheidung vor, und eine deterministische Guardrails-Schicht (reiner Code, nie KI) erzwingt die Sicherheitsregeln. Das Entscheidungs-JSON geht in derselben HTTP-Antwort zurück; der WROOM führt nur aus und entscheidet nie lokal.
3. **Speichern:** Jedes Ereignis landet als Zeile in `Events`; Fotos gehen in Google Drive; Scan-Urteile, Arbeitsnotizen und Konfiguration liegen in eigenen Tabs.
4. **Analysieren (optional):** Eine zweite ESP32-CAM schickt täglich ein Foto und wöchentlich ein Scan-Foto. Ein Vision-Agent plus ein lokaler YOLOv8-Klassifikationsdienst erzeugen ein Urteil; der Besitzer bestätigt es im Dashboard (Human in the Loop).
5. **Anzeigen:** Das Dashboard liest Sheets/Drive direkt mit dem eigenen Google-Login und zeigt Status, Verlauf, Diagramme, Plant Doctor und den Assistenten. Optionale Browser-Hinweise spiegeln kritische Meldungen, solange der Tab offen ist.
6. **Menschen fragen:** Offene Fragen (z. B. „War dieses Gießen richtig?“) sind `Notifications`-Zeilen mit Resume-URL; Dashboard-Buttons setzen den pausierten Workflow fort.

Technische Details und Schemas liegen in `docs/Plan.md`; den aktuellen Stand führt `STATUS.md`; Hardware und Verkabelung stehen in `docs/SmartPot-Full-Engineering-Spec-PRD.md`.

## 3. Warum das wichtig ist

Zimmerpflanzen sterben meist an unregelmäßiger oder gedankenloser Pflege, nicht am Raum selbst. PhytoAI ist als günstige Nachrüstlösung gedacht, die eine Pflanze kontinuierlich beobachtet, rechtzeitig reagiert und Probleme von überall meldet — damit Pflanzen nicht still verloren gehen. Das Ziel ist ein bezahlbarer End-to-End-Aufbau statt eines Laboraufbaus.

## 4. Aktueller Status

Legende: **implementiert** (Code existiert und funktioniert in Tests) · **getestet** (geprüft, mit Methode) · **Prototyp** (funktioniert, aber roh) · **optional** · **nicht implementiert** · **besitzerspezifisch** (funktioniert nur in dieser Installation).

| Teil | Status |
|---|---|
| n8n-Workflow (`workflows/phytoai.json`, 233 Nodes) | **implementiert + getestet + live (19.09.2026)** — Telemetrie-Entscheidungen, Foto-Analyse, Wochenscan und die Sitzungs-Flag-Verkabelung liefen im Produktivbetrieb. **Besitzerspezifisch:** auf der Instanz des Besitzers aktiv; die Aktorik ist über `dry_run_mode` gegated. |
| Dashboard (`dashboard/`) | **implementiert + getestet** (Headless-End-to-End-Suiten: Startanfragen, Diagramme, Assistent, Benachrichtigungen — siehe `docs/dashboard-ux-v3.md`, `docs/dashboard-notifications.md`); vom Besitzer auf statischem Host deployt. |
| WROOM-Produktionsfirmware | **live verifiziert am 19.09.2026** — geflasht; Entscheidungen steuerten die echte Pumpe unter den Code-Guardrails. |
| WROOM-Kalibrierungs-/Bench-Sketch | **getestet**: geflasht und am 15.09.2026 am Bench gelaufen (Werte in `docs/hw-bench-2026-09-15.md`). |
| ESP32-CAM-Produktionsfirmware | **live verifiziert am 19.09.2026** — geflasht; sitzungsgesteuertes Tagesfoto und Wochenscan liefen im Produktivbetrieb. |
| ESP32-CAM-Testsketch | am Bench **getestet** (Kamerainit, WLAN, Webhook-Upload). |
| Lokaler Krankheits-Klassifikator (`yolo-service/`) | **implementiert + getestet**: auf dem Server des Besitzers mit trainiertem Modell im Einsatz (Validierungswerte unten). |
| Benachrichtigungszentrum in der App | **implementiert + getestet** (`docs/dashboard-notifications.md`). |
| Browser-Hinweise bei offenem Tab | **implementiert + getestet** (Berechtigung nur nach Klick). |
| Push bei geschlossener Seite | **nicht implementiert** (kein Service Worker, kein Web Push). |
| Dauerbetrieb an echter Pflanze | **live durchgelaufen am 19.09.2026** — Telemetrie → Entscheidung → echte Pumpen-Aktuierung unter Guardrails, Tagesfoto-Analyse und Wochenscan-Kette im Produktivbetrieb. |
| Kamerastrom | **besitzerspezifisch:** kabelgebunden; alte Batterie-Felder bleiben in Schema/Firmware und sind obsolet. |

Gemessenes Modellergebnis (nur Validierungssplit): **96,08 % Top-1 / 99,955 % Top-5**; kein separater Testsatz und kein Trainingsgenauigkeits-Messwert, daher wird keiner behauptet. Details: [Datenmodell](#14-datenmodell) und `docs/yolo-service-spec.md`.

## 5. Architektur — wer wofür verantwortlich ist

| Schicht | Verantwortung |
|---|---|
| **ESP32-WROOM-Firmware** (`firmware/wroom_production/`) | Liest Sensoren, sendet Telemetrie, führt das Entscheidungs-JSON aus (Pumpe/Heizung), erzwingt Hardware-Grenzen, entscheidet nie lokal. `GET /webhook/config` liefert Sonnenzeiten, Dry-Run- und Preheat-Kontext. |
| **Sensoren** | Kapazitiver Bodenfeuchtesensor, 2× DS18B20 (Boden- und Wassertemperatur an einem Bus), DHT22 (Lufttemperatur/-feuchte), 1-kg-Wägezelle + HX711 (Topfgewicht), LDR (Licht), XKC-Y25-Tanksensor. |
| **Kamera-Hardware** (`firmware/esp32cam_production/`) | Statische ESP32-CAM; Tagesfoto + wöchentliches Scan-Foto; kabelgebundene Stromversorgung; fest montiert (kein Positionierungsschritt). Der Wochenscan läuft vollautomatisch und nur bei aktiver Cloud-Sitzung (`scan_session_active`). |
| **Automatisierungs-Workflow** (n8n, `workflows/phytoai.json`) | Das Gehirn des Systems: orchestriert die Zweige A–E, spricht mit Sheets/Drive, betreibt KI-Agenten, HITL-Waits und Guardrails. |
| **Speicher** (Google Sheets + Drive) | Eine Tabelle (fünf Tabs, siehe Datenmodell) ist die Datenbank; Drive speichert die Fotos. |
| **KI/ML** | Cloud-Agenten über OpenRouter (`google/gemma-4-26b-a4b-it`, Temperatur 0,2) für Historie/Entscheidung/Vision/Behandlung; ein **lokaler** YOLOv8n-cls-Klassifikator (`yolo-service/`, FastAPI + Ultralytics, CPU) liefert eine niedrig gewichtete Zweitmeinung für Krankheits-Scans. |
| **Dashboard** (`dashboard/`) | Lese-UI für Menschen: Status, Diagramme, Plant Doctor, Assistent, Benachrichtigungszentrum; schreibt nur HITL-Antworten. |
| **Benachrichtigungen** | Zentrum in der App + optionale Browser-Hinweise, solange die Seite offen ist. Push bei geschlossener Seite ist **nicht** gebaut. |

## 6. Was man nachbauen kann

| Stufe | Du brauchst |
|---|---|
| **A. Reine Software-Demo** | n8n (Docker), ein Google-Konto mit der Fünf-Tab-Tabelle (Seed aus `test-data/dashboard-seed/`), einen OpenRouter-Schlüssel für die KI-Zweige und das lokal/statisch ausgelieferte Dashboard. Keine Hardware: Der Workflow lässt sich mit Test-Payloads ausführen, das Dashboard verhält sich real. |
| **B. Sensor-Aufbau** | Stufe A + ESP32-WROOM + Sensoren + Relaisplatine + Pumpe + Heizung (siehe Hardware). Erst `wroom_calibration` flashen, dann `wroom_production`. |
| **C. Kompletter Hardware-Aufbau** | Stufe B + ESP32-CAM (kabelgebunden) + Halterung. |
| **D. Optionaler Kamera-/KI-Zweig** | Stufe C + lokaler Klassifikationsdienst (`yolo-service/`, CPU-Server oder VPS) und optional ein kostenloser Perenual-Schlüssel für die beratende Arten-/Schädlingsschicht. |
| **E. Optionales Dashboard-Deployment** | `dashboard/` auf einem beliebigen HTTPS-Statikhost ausliefern (der Besitzer nutzt einen solchen Dienst). |

Die Stufen sind kumulativ. Stufe A braucht kein Gerät; in B–E ist nichts hinter einem Bezahldienst versteckt außer dem OpenRouter-Schlüssel (KI-Zweige) und dem eigenen Hosting.

## 7. Hardware-Anforderungen

Aus `Hardware/Hardware-list.txt` plus der bench-verifizierten Pin-Belegung in `docs/hw-bench-2026-09-15.md`:

**Kern:** ESP32-WROOM-Devboard (+ Expansion Board wie in der Liste) · 5-V-4-Kanal-Relaisplatine · DHT22 · kapazitiver Bodenfeuchtesensor · 2× DS18B20 (wasserdicht, ein OneWire-Bus) · 1-kg-Wägezelle + HX711 · 3–5-V-Tauchpumpe · 5-V-/10-W-USB-Aquarienheizung · XKC-Y25-Tanksensor · 5-V-USB-Netzteil und Verkabelung.

**Optional:** ESP32-CAM (mit eigener 5-V-Versorgung — nie über einen beliebigen GPIO versorgen), LDR-Modul (digitaler Ausgang genutzt), Status-LED.

**Pins (bench-verifiziert, `firmware/wroom_production/wroom_production.ino`):** Pumpe **13**, Heizung **16** (beide Relais active-low), HX711 **DT 26 / SCK 33**, OneWire **4**, Boden-ADC **34**, Tank **27** (LOW = leer), DHT22 **14**, LDR **25**, LED **2**.

**Sicherheitshinweise (verbindlich):** Heizung **nur untergetaucht** betreiben; die Firmware erzwingt 40,0 °C Abschaltung, verweigert den Start ab ≥ 39,5 °C und begrenzt jede durchgehende Ansteuerung auf eine zur Laufzeit einstellbare Grenze (Standard 120 s, harte Grenzen 5–600 s über Serienbefehl `l`); Relais sind beim Boot AUS. Ein früher Brief enthielt eine veraltete Pin-Belegung (Pumpe 4, HX711 5/25, OneWire 13, Boden 26) — sie ist überholt; nutze die Tabelle oben.

**Platzierung des DS18B20-Wasserfühlers (verbindlich):** Der wasserdichte Wasserfühler muss **frei im Tank schwimmen — rundum von Wasser umgeben** — und darf Tankwand, Tankboden oder andere Objekte **nicht berühren**. Kontakt leitet Fremdwärme und verfälscht die Wassertemperatur, die über die Heizung entscheidet.

## 8. Software-Anforderungen

- **Arduino IDE oder arduino-cli** mit **ESP32-Core 3.3.11**; Bibliotheken: ArduinoJson 7.4.2, HX711 0.7.5, OneWire 2.3.8, DallasTemperature 4.0.6, DHT 1.4.7 (Versionen aus dem Produktionsbuild).
- **n8n** (Docker empfohlen) — der Export `workflows/phytoai.json` ist importierbar.
- **Python 3** für Trainingsskripte und Klassifikationsdienst (`scripts/README.md`, `yolo-service/requirements.txt`).
- **Ein Browser** für das Dashboard — kein Build, keine npm-Abhängigkeiten.
- **Optional:** HTTPS-Statikhost für das Dashboard; kleiner CPU-Server/VPS für `yolo-service` (CPU genügt; das Modell wurde nur mit CPU trainiert).

## 9. Konten und externe Dienste (selbst anlegen)

| Dienst | Wofür | Hinweise |
|---|---|---|
| Google-Konto + Google-Cloud-Projekt | Sheets + Drive + OAuth-Login fürs Dashboard | **Google Sheets API** und **Google Drive API** aktivieren; OAuth-**Web**-Client anlegen; eigene Origins eintragen; das Client-**Secret** wird hier nie benutzt oder gespeichert. |
| Google-Sheets-Tabelle | Die Datenbank | Fünf Tabs mit den exakten Kopfzeilen anlegen oder die Seed-CSVs aus `test-data/dashboard-seed/` importieren. |
| n8n-Instanz | Führt den Workflow aus | Selbst gehostet (Docker) oder eigener Server. |
| OpenRouter-Konto + API-Schlüssel | Die KI-Agenten (Gemma) | Für die KI-Zweige nötig; deterministische Assistenten-Absichten funktionieren ohne LLM-Aufruf. |
| Statikhost (optional) | Dashboard | Beliebiger HTTPS-Host; der Besitzer nutzt ebenfalls einen. |
| VPS / kleiner Server (optional) | Lokaler Klassifikator (`yolo-service`) | Nur CPU, aus n8n im selben Docker-Netz erreichbar. |
| Perenual-Schlüssel (optional) | Beratende Arten-/Schädlingsreferenz für Scan-Behandlungen | Free Tier; der Workflow degradiert ohne ihn sauber. |

## 10. Konfiguration — Vorlagen und was privat bleibt

- **Dashboard:** [`dashboard/config.example.js`](dashboard/config.example.js) nach `dashboard/config.js` kopieren und Client-ID, Spreadsheet-ID und n8n-Host eintragen. Das Beispiel enthält nur `<PLACEHOLDER>`-Werte.
- **Firmware:** Jeder Sketch hat einen `secrets.h`-Abschnitt (`SECRET_WIFI_SSID`, `SECRET_WIFI_PASSWORD`, `SECRET_BASE_URL`, `SECRET_WEBHOOK_PREFIX`). `secrets.h` ist git-ignored — **niemals committen**. Für Produktion den Präfix `/webhook` nutzen; `/webhook-test` ist der n8n-**Editor-Testlistener** und antwortet nur einmal nach einem Klick auf „Execute workflow“. **Produktions-Webhooks registrieren sich nur bei AKTIVEM Workflow** — den Workflow in n8n aktivieren, bevor die Geräte geflasht oder betrieben werden.
- **Workflow:** Zugangsdaten werden **nur über Namen** referenziert; anlegen in der n8n-UI (siehe Workflow-Setup).

**Muss privat bleiben:** OAuth-Client-Secrets, WLAN-Zugangsdaten, OpenRouter-/Perenual-Schlüssel, n8n-API-Schlüssel, Bearer-Tokens, persönliche E-Mail-Adressen und alle Produktions-IDs, die nicht öffentlich sein sollen. Dieses Repository enthält bewusst **keine** Geheimnisse; ein Pre-Push-Key-Scan ist in Abschnitt 20 dokumentiert.

## 11. Empfohlene Reihenfolge

1. **Repository klonen.**
2. **Hardware vorbereiten** (Sensoren, Relais, Pumpe, Heizung nach Abschnitt 7).
3. **Abhängigkeiten installieren** (Arduino-Core + Bibliotheken, n8n, Python für Dienst/Skripte).
4. **Dienste konfigurieren**: Google-Cloud-APIs + OAuth-Client; n8n-Instanz; OpenRouter-Schlüssel.
5. **Speicher-Schema anlegen**: fünf Tabs mit exakten Kopfzeilen (oder `test-data/dashboard-seed/*.csv` zuerst in eine *Test*-Tabelle importieren).
6. **Workflow konfigurieren**: `workflows/phytoai.json` importieren, Zugangsdaten per Name anlegen, Sheet-/Ordner-IDs in SystemConfig setzen.
7. **Firmware flashen**: zuerst `firmware/wroom_calibration/` (Bench, kalibrieren, Werte notieren), dann `firmware/wroom_production/` nach Ausfüllen von `secrets.h` und den Bench-Konstanten.
8. **Gerätedaten testen**: Seriellen Monitor beobachten, dann Zeilen in `Events` prüfen.
9. **Dashboard deployen**: Konfiguration kopieren, statisch ausliefern, anmelden, Daten prüfen.
10. **Benachrichtigungen testen**: zuerst das Zentrum in der App, dann optional die Browser-Hinweise in den Einstellungen.
11. **Fehlersuche** mit Abschnitt 20.

## 12. Firmware-Einrichtung

- **Board:** ESP32-WROOM-Devmodul (FQBN `esp32:esp32:esp32`; die CAM nutzt `esp32:esp32:esp32cam`).
- **Bibliotheken:** siehe Abschnitt 8.
- **Pins:** Tabelle in Abschnitt 7 (während WLAN keine ADC2-Pins für Analogsensoren nutzen — deshalb liegt Boden auf GPIO34).
- **WLAN / Server:** `secrets.h` ausfüllen. `SECRET_BASE_URL` ist die HTTPS-Basis deiner n8n-Instanz; `SECRET_WEBHOOK_PREFIX` = `/webhook` für Produktion.
- **Kalibrierung (`firmware/wroom_calibration/`):** Serienmenü bei 115200; `t` tariert, `w` startet die Zwei-Punkt-Kalibrierung (leere Plattform → bekannte Gramm; Faktor = offset-kompensierter Rohwert / Gramm), `e` ist der Bench-Heizungstest (nur untergetaucht). Referenzwerte: Skalenfaktor `1068.335`, `SOIL_ADC_DRY 4095`, `SOIL_ADC_WET 1964`, Pumpenfluss `9.706 ml/s`, Tank LOW = leer, Relais active-low. Der historische Faktor `305.070f` wurde mit einem fehlerhaften Auslesen berechnet und **darf nicht wiederverwendet werden**.
- **Sicheres Neustartverhalten:** Relais beim Boot AUS; 8-s-Watchdog; harte Aktuatorgrenze 120 s (Serienbefehl `l`, 5–600 s, in NVS gespeichert); Heizung 40,0 °C Abschaltung / 39,5 °C Verweigerung; `dry_run_mode` in SystemConfig nullt alle Aktuatorfelder, ein frisches System bewegt also nichts, bis du es bewusst abschaltest.
- **Ausgabe prüfen:** Serielles Log zeigt WLAN + NTP + Sensorwerte; `Events`-Zeilen erscheinen nach einem Sensorzyklus; die Entscheidungsantwort wird von der Firmware ausgegeben.

## 13. Kamera-Einrichtung

- **Strom:** Die Kamera ist im Aufbau des Besitzers **kabelgebunden** (besitzerverifiziert). Gib der ESP32-CAM eine eigene stabile 5-V-Versorgung; versorge sie nicht über einen freien GPIO oder den Regler des WROOM-Boards. Alte Batteriefelder (`camera_battery_percent`, `camera_battery_min_percent`, Batterietest in `PRODUCTION-TESTS.md`) sind Überreste eines früheren Entwurfs und obsolet.
- **Optional:** Ja — Stufen A und B aus Abschnitt 6 funktionieren ohne Kamera.
- **Bildweg:** Die CAM sendet das Tagesfoto an `POST /webhook/core/photo` und das wöchentliche Scan-Foto an `POST /webhook/yolo-scan` — aber **nur bei aktiver Cloud-Sitzung** (`scan_session_active=true` aus `GET /config`); danach schließt `/webhook/yolo-scan/done` die Sitzung. Der Wochenscan ist vollautomatisch (Montags-Trigger öffnet die Sitzung, CAM scannt beim nächsten Aufwachen; eine einzige informative Benachrichtigung, kein Warten auf Eingaben). Fotos landen in Google Drive; der Workflow analysiert sie (Vision-Agent + lokaler YOLO-Dienst) und schreibt das Ergebnis in `DiseaseScans`.
- **Grenzen:** Eine Kamera kann nicht alle Blätter einer großen Pflanze sehen (vom Besitzer genannte Schwäche); die Ausrichtung ist fest (kein Positionierungsschritt); Aufnahme-Grund und Lichtbedingung werden **nicht persistiert**; das Vision-Urteil ist eine unbestätigte KI-Hypothese, bis der Besitzer es bestätigt (informativ — blockiert den nächsten Zyklus nicht).

## 14. Datenmodell

Eine Tabelle, **fünf Tabs** (Kopfzeilen exakt wie in `test-data/dashboard-seed/`):

**`Events`** — eine Zeile pro Sensor-/Foto-Ereignis:
`EventID, Timestamp, EventType, MoisturePercent, SoilTempC, WaterTempC, AirTempC, AirHumidityPercent, WeightGrams, LightLevel, TankEmpty, WateringTriggered, WaterDurationSeconds, HeaterUsed, HeaterDurationSeconds, SpeciesGuess, SpeciesConfidence, PhotoFileID, AnomalyDetected, AnomalyDescription, AI_Notes, ReasoningSummary, WateringAborted, FinalWaterTempC, WaterAddedGrams`

**`SystemConfig`** — Key/Value-Speicher. Referenzschlüssel (Seed): `pot_latitude`, `pot_longitude`, `last_watered_utc`, `last_species_guess`, `species_confidence`, `next_sunrise_utc`, `next_sunset_utc`, `last_tank_empty_alert_sent`, `dry_run_mode`, `min_rewater_interval_hours`, `scan_session_active`, `scan_next_utc`, `scan_auto` (Default true; false = kein automatischer Session-Start), `max_pump_seconds`, `max_water_temp_c`, `preheat_margin_c`, `preheat_lead_minutes`, `heater_hysteresis_c`, `flash_dark_threshold`, optional `camera_battery_*`, `drive_*_folder_id`, `push_vapid_public_key` (heute ungenutzt).

**`DiseaseScans`** — Scan-Ergebnisse:
`timestamp, drive_links, vision_opinion, yolo_opinion, judge_verdict, judge_reasoning, treatment_plan, user_verdict, treatment_outcome, ai_notes`

**`Notifications`** — Human-in-the-Loop-Warteschlange:
`timestamp, type, title, message, response_options, status, response, resume_url, context_ref` (Status: `pending` → `done`/`expired`)

**`AgentNotes`** — Arbeitsgedächtnis der Agenten:
`timestamp, agent, note, context_ref, status`

Vollständige Schemas und Seeds: `docs/Plan.md` §2 und `test-data/dashboard-seed/`.

## 15. Wichtige Semantik

- **Gemessen vs. geschätzt:** `ml_est` im Dashboard ist eine **Schätzung** aus Laufzeit × kalibriertem Fluss (`9.706 ml/s` Referenz) und wird so gekennzeichnet. Das **gemessene** Gewichtsdelta wird getrennt behandelt; es ist derzeit **nur Gerätelog** — der Workflow persistiert es nicht, die Spalte `WaterAddedGrams` bleibt bewusst leer.
- **NICHT persistiert:** gemessenes Wasserdelta (nur Log), Aufnahme-Grund und Lichtbedingung pro Foto, rohe Resume-Texte außer `Notifications.resume_url`.
- **Zeitstempel:** UTC ISO-8601, alle enden auf `Z`.
- **Einheiten:** Feuchte %, Temperaturen °C, Gewicht g, Licht roh digital (0/1), Dauern s, Fluss ml/s.
- **Kalibrierwerte:** Skalenfaktor, Boden-ADC trocken/nass, Pumpenfluss, DS18B20-Adressen, Relaispolarität, Tanklogik — alles am Bench gemessen (`docs/hw-bench-2026-09-15.md`); für eigene Hardware neu kalibrieren.
- **Sicherheitsgrenzen:** Firmware-Grenzen (40,0 °C, 39,5 °C, Laufzeit-Aktuatorgrenze — Standard 120 s, einstellbar 5–600 s, 8 s WDT) sind allem übergeordnet; die Workflow-Guardrails (Tank leer erzwingt Gießen aus, `min_rewater_interval_hours`, `max_pump_seconds`, `max_water_temp_c`, `dry_run_mode`) sind der KI übergeordnet; die KI ist nur beratend. Keine KI-Ausgabe kann die Code-Guardrails übersteuern.

## 16. Dashboard

- **Deployment:** beliebiger statischer HTTPS-Host (kein Build). Lokal: `npx serve dashboard` oder `python -m http.server` im Ordner `dashboard/`.
- **Google-Client:** Web-OAuth-Client anlegen, exakte Origin eintragen, Client-ID in `config.js` kopieren (siehe `dashboard/config.example.js`).
- **Produktion vs. Testtabelle:** `?sheet=<SPREADSHEET_ID>` schaltet auf eine Testtabelle um (im Browser gemerkt, Banner sichtbar, Button „Back to production sheet“). Siehe `docs/dashboard-test-data.md`.
- **Routen:** Overview, Timeline, Assistant, Doctor, Photos, Insights, Settings.
- **Browser-Berechtigung:** wird **nur** nach Klick auf „Enable browser alerts“ in den Einstellungen angefragt — nie beim Laden. Zustände unsupported / not requested / granted / denied werden angezeigt; eine Ablehnung lässt das Zentrum in der App voll funktionsfähig; die Berechtigung ist nie eine Backend-Autorisierung.
- **Zentrum in der App:** Der Timeline-Screen listet alle `Notifications`-Zeilen mit Schweregrad, Quelle, Zeit, Pflanzenkontext und Antwortbuttons. Es gibt keinen erfundenen Gelesen-Status — der Status kommt aus dem Sheet.
- **Grenze des Pollings:** Benachrichtigungen werden einmal pro Minute nur bei **sichtbarem Tab** abgefragt; versteckte oder geschlossene Tabs bekommen nichts.
- **Push bei geschlossener Seite ist nicht implementiert** — kein Service Worker, kein Web Push. `SystemConfig.push_vapid_public_key` ist ungenutzt. Details: `docs/dashboard-notifications.md`.

## 17. Workflow-Einrichtung

1. `workflows/phytoai.json` in die eigene n8n-Instanz importieren.
2. Zugangsdaten **in der n8n-UI** anlegen (der Export referenziert sie nur per Name): Google Sheets (OAuth2), Google Drive (OAuth2), eine OpenRouter-Zugangsdaten für die Gemma-Nodes und — optional — Perenual (Query Auth, Parameter `key`).
3. Spreadsheet- und Ordner-IDs in `SystemConfig` setzen (`drive_daily_photos_folder_id`, `drive_scan_photos_folder_id`).
4. Geräte auf die eigene HTTPS-Basis zeigen lassen (`secrets.h`) und den Produktionspräfix `/webhook` nutzen (Produktions-Webhooks antworten nur bei AKTIVEM Workflow — den Workflow vorher in n8n aktivieren).
5. Zuerst mit dem n8n-Editor-/Test-Webhook testen (die Flows tolerieren `dry_run_mode=TRUE` durchgehend).
6. **Datenschutz:** Das Workflow-JSON enthält keine Geheimnisse — vor dem Teilen eines geänderten Exports prüfen (`Select-String -Path workflows\phytoai.json -Pattern 'key=|api[_-]?key|bearer\s|sk-'`).

## 18. Test- und Prüf-Checkliste

**Hardware**
- [ ] WROOM bootet, serielles Log zeigt WLAN + NTP + Sensorwerte.
- [ ] Sensorwerte plausibel (mit Multimeter/Referenz vergleichen; Boden trocken vs. nass).
- [ ] Kalibrierung: `t` und `w` ausführen; eigene Faktor-/Trocken-/Nasswerte notieren.
- [ ] Tanksensor: LOW = leer bestätigt; Relaispolarität bestätigt (Dry-Run löst nichts aus).

**Workflow + Speicher**
- [ ] Ein Test-Sensor-POST erzeugt Entscheidungsantwort und `Events`-Zeile.
- [ ] `dry_run_mode=TRUE` nullt die Aktuatorfelder in der Antwort.
- [ ] Guardrails getestet (Tank leer erzwingt Gießen aus; Re-Water-Abstand eingehalten).
- [ ] HITL: Eine `Notifications`-Zeile entsteht, ihr Resume setzt sie auf `done`.

**Dashboard**
- [ ] Lädt auf dem eigenen Host; Anmeldung von der eigenen Origin funktioniert.
- [ ] Daten erscheinen (keine Fake-Zeilen) und der Testtabellen-Override zeigt sein Banner.
- [ ] Diagramme rendern auf Handy- und Desktopbreite.
- [ ] Browser-Berechtigung fragt nur nach dem Klick in den Einstellungen; granted/denied/unsupported werden angezeigt.
- [ ] Eine neue kritische Meldung erzeugt höchstens einen Systemhinweis und wiederholt sich nach Refresh nicht.
- [ ] Fehlerbehandlung ist ehrlich: Quota zeigt einen Countdown, nie erfundene Daten.

**Kamera (optional, nach dem Flashen)**
- [ ] `firmware/esp32cam_production/PRODUCTION-TESTS.md` abarbeiten (14 Tests; mehrere brauchen Hardware und End-to-End).

## 19. WROOM-Serienbefehle (Diagnose)

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

### ESP32-CAM-Serienbefehle (Diagnose)

Die Produktions-CAM (`firmware/esp32cam_production/`) nimmt am seriellen Monitor (**115200 Baud**)
Einzelbefehle entgegen (auch im Boot-Banner und über `h`). Die CAM ist fest montiert — kein
Positionierungsschritt; der wöchentliche Scan läuft vollautomatisch und nur bei aktiver Cloud-Sitzung.

| Taste | Befehl | Verwendung | Sicherheitsgrenzen |
|---|---|---|---|
| `s` | Foto jetzt senden | `GET /config`, dann ein Tagesfoto über denselben Codepfad wie das geplante Foto (`POST /core/photo`); zeigt HTTP-Status + Antwort-Body und danach die nächsten Termine. | Normaler Codepfad; löst nie einen Scan aus. |
| `c` | Scan jetzt (Test) | `GET /config`; ist `scan_session_active` false, kommt `[scan] cloud session not active - scan would be rejected` und es wird **ohne Uploads abgebrochen**. Ist sie true, läuft der komplette Sweep (`POST /yolo-scan`, dann `/yolo-scan/done`) plus die nächsten Termine. | Nur bei aktiver Cloud-Sitzung; ein manueller Test erzeugt nie einen Wochen-Fehlschlag. |
| `i` oder `t` | Status | Letzte/nächste Termine, `scan_session_active` zuletzt gesehen, Blitzmodus, freier Heap/PSRAM. | — |
| `h` | Hilfe | Listet alle Befehle auf. | — |
| `w` / `n` / `g` | WLAN / NTP / Config holen | Diagnose. | — |
| `b` / `d` / `f` / `r` | Batterie / Scan-Done-Test / Blitz-Torch / Reboot | Diagnose. | — |

## 20. Fehlersuche

Bestätigte Probleme und Lehren:

- **Über API erzeugte Sheets-Nodes können leere/legacy „Column to match on“ haben** — nach programmatischen Änderungen immer visuell in der n8n-UI prüfen.
- **Eine veraltete Pin-Belegung kursierte in einem frühen Brief** (Pumpe 4, HX711 5/25, OneWire 13, Boden 26). Sie ist falsch; nutze Abschnitt 7.
- **Der alte HX711-Faktor `305.070f` ist ungültig** (mit fehlerhaftem, nicht offset-kompensiertem Auslesen berechnet). Eigenen kalibrierten Faktor verwenden (Referenz: `1068.335`).
- **Die Heizung lief zunächst nicht**, weil die Relaisspule zu wenig Strom bekam — der Besitzer ergänzte eine eigene Versorgung. Bleibt die Heizung aus: Relaisstrom, Polarität und die Verweigerungs-/Abschaltbedingungen der Firmware prüfen.
- **Häufige HTTPS-Testaufrufe wurden vom Heimrouter blockiert**; wenn Geräte-Uploads scheitern, obwohl der Server erreichbar ist, die Sicherheits-/DoS-Einstellungen des Routers prüfen.
- **Dashboard-API-Aufrufe scheitern trotz vorhandener Daten** — das angemeldete Google-Konto muss Zugriff auf Tabelle und Drive-Ordner haben; dieses Teilen ist die Zugriffsgrenze.
- **Workflow-Webhook liefert 404** — der Workflow muss aktiv sein (oder Testlistener + `/webhook-test`-Präfix nutzen).
- **Erster Lauf mit leeren Sheets ist gültig:** `Events`, `AgentNotes`, `DiseaseScans` und `Notifications` dürfen im ersten Zyklus leer sein. Der Workflow hat für diese Verlaufs-/Log-Reads „Always Output Data“ aktiviert; leere Historie liefert trotzdem eine normale Entscheidung (z. B. Gießen verweigert bei leerem Tank). Nur `SystemConfig` muss vor der Aktivierung die Seed-Schlüssel enthalten — ist sie leer, ist das ein echter Einrichtungsfehler (der Workflow schlägt bewusst laut fehl). **Eine leere 200-Antwort eines Webhooks heißt: der Workflow wurde vorzeitig gestoppt** — im n8n-Executions-View prüfen, welcher Node die Kette beendet hat. „Always Output Data“ ist jetzt Teil der Workflow-Konfiguration; keine manuelle Aktion nötig.
- *Noch zu verifizieren:* `STATUS.md` §5/§6 listet offene Hardware-Fragen (Relaisplatine, Netzteil, freie GPIOs); bis zur eigenen Messung als offen behandeln.

## 21. Datenschutz und Sicherheit

- **Keine Geheimnisse in diesem Repository.** `secrets.h`, `opencode.json`, `mcp-auth.json`, `.env*`, `client_secret_*.json`, `*.pem`, `*.key` und `yolo-service/models/` sind git-ignored.
- **OAuth-Client-ID vs. Secret:** Die ID ist öffentlich; das Secret wird nie benutzt — das Dashboard macht nur Nutzer-OAuth.
- **Tabellen-Freigabe:** Der Datenzugriff wird durch die Freigabe von Tabelle/Drive für das angemeldete Konto bestimmt; das Dashboard kann nichts lesen, was nicht geteilt wurde.
- **Webhook-URLs:** Behandle deine n8n-Basis-URL als private Infrastruktur. Diese README nutzt `<PLACEHOLDER>`; keine Live-Webhook-URLs in Issues posten.
- **Persönliche Daten:** Das System speichert Pflanzendaten, keine Personenprofile. Keine persönlichen E-Mail-Adressen in öffentliche Konfigurationen schreiben (das Login-Hinweisfeld ist leer).
- **Test vs. Produktion:** Für Experimente eine zweite Tabelle nutzen (`?sheet=`-Override); der Seed in `test-data/dashboard-seed/` ist sichere Testdaten.

## 22. Grenzen und Zukunftsmusik

Bekannte Grenzen (vom Besitzer eingeschätzt): WLAN und ein Server sind nötig; eine Kamera deckt sehr große Pflanzen nicht ab; die Sensorkalibrierung kostet Zeit; das System lief noch nicht durchgehend an einer echten Pflanze; Push bei geschlossener Seite fehlt.

Geplant/Ideen (vom Besitzer ausgewählt, nicht implementiert): peristaltische Dosierpumpe für KI-gesteuerte Nährstoff-/Behandlungszugabe · Wasserkühlmodul (Lüfter + Peltier) für heiße Sommer · Akku-Paket aus gebrauchten Vape-Zellen · Standalone-WLAN-Variante für Orte ohne Internet · mehrere ESP32-CAMs für große Pflanzen · Garten- und Mehrpflanzen-Skalierung.

## 23. Lizenz und Attribution

- **Lizenz:** MIT — siehe [LICENSE](LICENSE). © 2026 Mohammad Abdin.
- **Datensatz:** PlantVillage-Farbbilder von spMohanty (`spMohanty/PlantVillage-Dataset`). Vor Weitergabe die eigenen Bedingungen des Datensatzes prüfen.
- **Modell/Bibliotheken:** Ultralytics YOLOv8 (Lizenzbedingungen für den eigenen Fall prüfen), FastAPI, n8n, Google APIs — jeweils unter eigener Lizenz.
- **Illustrationen:** unDraw-SVGs in `dashboard/assets/` (unDraw-Lizenz).

## 24. Mitmachen / selbst bauen

Dies ist ein Solo-Lern-/Wettbewerbsprojekt; es ist geteilt, damit andere ihre eigene Version bauen können. Sinnvolle Beiträge: reproduzierbare Bugs melden, Dokumentation verbessern oder den Workflow für andere Pflanzen anpassen. Bitte keine Zugangsdaten oder persönlichen Daten in Issues/Pull-Requests, und die genutzte Baustufe (Abschnitt 6) nennen. Es gibt keine Support-Garantie; nichts hiervon ist produktionszertifiziert.
