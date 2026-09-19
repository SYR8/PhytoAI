# PhytoAI — Einrichtungs- und Testanleitung (für Gutachter)

Diese Anleitung führt der Reihe nach durch die komplette Einrichtung: Google-Tabelle → n8n →
Firmware → Inbetriebnahme → Live-Tests. Alles hier wurde am **19.09.2026** am Live-System ausgeführt.

**Einfachster Start:** `test-data/PhytoAI-demo-data.xlsx` als Tabelle importieren (Google Sheets:
*Datei → Importieren → Tabelle ersetzen*). Sie enthält die exakten Tab-Namen, exakten Kopfzeilen,
die nötigen `SystemConfig`-Seed-Zeilen und einen kleinen, zusammenhängenden Ausschnitt echter
Demo-Zeilen (ein Gießereignis, eine Tagesfoto-Analyse, ein Scan-Urteil, zwei Benachrichtigungen,
Agenten-Notizen).

---

## 1. Google-Tabelle (die Datenbank)

Eine Tabelle mit diesen **sechs Tabs** und den **exakten Kopfzeilen** anlegen (wörtlich übernehmen;
der Workflow ordnet sie über die Namen zu):

| Tab | Kopfzeilen |
|---|---|
| `Events` | `EventID, Timestamp, EventType, MoisturePercent, SoilTempC, WaterTempC, AirTempC, AirHumidityPercent, WeightGrams, LightLevel, TankEmpty, WateringTriggered, WaterDurationSeconds, HeaterUsed, HeaterDurationSeconds, SpeciesGuess, SpeciesConfidence, PhotoFileID, AnomalyDetected, AnomalyDescription, AI_Notes, ReasoningSummary, WateringAborted, FinalWaterTempC, WaterAddedGrams` |
| `SystemConfig` | `Key, Value, LastUpdated` |
| `Notifications` | `timestamp, type, title, message, response_options, status, response, resume_url, context_ref` |
| `DiseaseScans` | `timestamp, drive_links, vision_opinion, yolo_opinion, judge_verdict, judge_reasoning, treatment_plan, user_verdict, treatment_outcome, ai_notes` |
| `AgentNotes` | `timestamp, agent, note, context_ref, status` |
| `PushSubscriptions` | `timestamp, endpoint, p256dh, auth, expiration_time, user_agent, status` (darf leer bleiben) |

### Nötige `SystemConfig`-Seed-Zeilen

Die Demo-xlsx enthält sie bereits. Minimales Set für einen sicheren Start:

| Key | Wert | Bedeutung |
|---|---|---|
| `dry_run_mode` | `TRUE` | Fail-Safe-Standard: keine GPIO-Aktuierung, bis bewusst `FALSE` gesetzt wird |
| `scan_session_active` | `FALSE` | Scan-Sitzungsflag; nur `true` lässt die CAM den Sweep senden |
| `scan_auto` | `TRUE` | `false` deaktiviert den automatischen Wochenscan-Start |
| `scan_next_utc` | *(leer)* | Wird beim Öffnen einer Scan-Sitzung automatisch gesetzt |
| `perenual_species_id` | *(leer)* | Optionaler Perenual-Cache (wird lazy gefüllt) |
| `drive_daily_photos_folder_id` | *(leer)* | Wird vom One-Time-Setup-Zweig gesetzt (Schritt 2) |
| `drive_scan_photos_folder_id` | *(leer)* | Wird vom One-Time-Setup-Zweig gesetzt (Schritt 2) |
| `pot_latitude` / `pot_longitude` | z. B. `49.9886` / `8.5958` | Für die Sonnenzeiten-Berechnung |
| `next_sunrise_utc` / `next_sunset_utc` | *(leer ok)* | Sonnenzeiten werden bei Veralterung automatisch berechnet |
| `max_pump_seconds` | `60` | Entscheidungsgrenze (die Firmware hat zusätzlich ihre Laufzeitgrenze) |
| `max_water_temp_c` | `28` | Standard-Zieltemperatur der Heizungs-Policy |
| `min_rewater_interval_hours` | `6` | Guardrail: Mindestabstand zwischen Gießvorgängen |

`Events`, `Notifications`, `DiseaseScans`, `AgentNotes` dürfen leer starten — der Workflow behandelt
leere Historie als gültigen Erststart-Zustand („Always Output Data" ist für diese Reads gesetzt).

---

## 2. n8n

1. **Import:** `workflows/phytoai.json` in die eigene n8n-Instanz importieren.
2. **Zugangsdaten per Name anlegen** und den Nodes zuordnen:
   - **Google Sheets OAuth2** (die Sheets-Nodes)
   - **Google Drive OAuth2** (die Drive-Nodes)
   - **OpenRouter API** (Modell-Node `OpenRouter Gemma`)
   - optional: **Perenual** (Query Auth, Parameter `key`) für die Artenreferenz
3. **One-Time-Setup-Zweig ausführen:** Workflow öffnen, manuellen Trigger `One-Time Setup` →
   *Execute workflow* klicken. Er legt die Drive-Ordner an (`SmartPot / DailyPhotos / ScanPhotos`)
   und schreibt beide Ordner-IDs in `SystemConfig`.
4. **Workflow aktivieren.** Produktions-Webhooks (`/webhook/...`) registrieren sich nur bei
   **AKTIVEM** Workflow. Der Editor-Testlistener (`/webhook-test/...`) antwortet nur einmal nach
   *Execute workflow* — für Geräte `/webhook` verwenden.
5. Spreadsheet-ID in den Sheets-/Drive-Nodes setzen (bzw. auf die importierte Tabelle zeigen).

---

## 3. Firmware

| Board | Sketch | FQBN |
|---|---|---|
| ESP32-WROOM | `firmware/wroom_production/` | `esp32:esp32:esp32` |
| ESP32-CAM (AI-Thinker) | `firmware/esp32cam_production/` | `esp32:esp32:esp32cam` |

Eine `secrets.h` neben dem Sketch anlegen (oder die gemeinsame `firmware/esp32cam/secrets.h` nutzen):

```cpp
#pragma once
#define SECRET_WIFI_SSID       "dein-wlan"
#define SECRET_WIFI_PASSWORD   "dein-passwort"
#define SECRET_BASE_URL        "https://dein-n8n-host"   // https://, KEIN abschließender Slash
#define SECRET_WEBHOOK_PREFIX  "/webhook"                // Produktionspräfix
```

**Erster Boot:** Der WROOM schaltet beide Relais AUS und startet fail-safe (`dry_run` blockiert
alle GPIO); die CAM öffnet ein 15-Sekunden-Fenster für die serielle Diagnose, läuft sonst einen
autonomen Durchlauf und geht in Deep Sleep.

---

## 4. WROOM-Inbetriebnahme

1. WROOM flashen und den Serial Monitor öffnen (**115200 Baud, Zeilenende „No line ending"**).
2. **Mit LEERER Plattform** `t` senden, dann mit `y` bestätigen (INSTALLATIONS-Tare). Der
   Offset der leeren Plattform wird in NVS gespeichert (danach nie automatisch getared; Gewicht
   bleibt brutto).
3. Topf, Pflanze, Untersetzer und Schläuche wieder auf die Plattform stellen.
4. `i` für den Status senden: Uptime, WLAN, `dry_run`, HX711-Offset/Faktor, Aktuatorgrenze,
   Tank-/Wasserzustand sowie Relaislogik + GPIO-Pegel (`relay_logic=ACTIVE_LOW ... pump_gpio13=...`)
   zum Abgleich mit dem physischen Relaismodul.
5. Optional: `l` ändert die Laufzeit-Aktuatorgrenze (harte Grenzen **5–600 s**, Standard 120 s,
   in NVS gespeichert). Zahl eingeben und Enter drücken.

---

## 5. ESP32-CAM-Inbetriebnahme

Nach Boot/Reset wartet die CAM **15 Sekunden** auf eine serielle Taste; kommt eine, bleibt sie im
Diagnosemodus (kein Deep Sleep), sonst läuft der geplante Durchlauf und sie schläft tief.

| Taste | Befehl | Verwendung |
|---|---|---|
| `s` | Foto jetzt senden | `GET /config`, ein Foto aufnehmen, `POST /core/photo` über den geplanten Pfad; zeigt HTTP-Status + Body und danach die nächsten Termine |
| `c` | Scan jetzt (Test) | `GET /config`; ist `scan_session_active=false`, kommt `[scan] cloud session not active - scan would be rejected` und es wird **ohne Uploads abgebrochen**; ist sie true, läuft der Sweep (`/yolo-scan`, dann `/yolo-scan/done`) |
| `i` / `t` | Status | Letzte/nächste Termine, `scan_session_active` zuletzt gesehen, Blitzmodus, freier Heap/PSRAM |
| `h` | Hilfe | Listet alle Befehle auf |
| `w` / `n` / `g` | WLAN / NTP / Config holen | Diagnose |
| `b` / `d` / `f` / `r` | Batterie / Scan-Done-Test / Blitz-Torch / Reboot | Diagnose |

Außerhalb des Fensters schläft die CAM tief; **Reset** drücken und eine Taste senden, um wieder in
die Diagnose zu kommen.

---

## 6. Live-Test-Rezept

1. **WROOM `s`** (ein vollständiger Telemetrie-Zyklus): erwartet werden `[config] ok ...`, dann
   `[http] awaiting decision (timeout 300 s)...`, `[decision] HTTP 200, N Bytes...` und explizite
   `[actuate] water:`- / `[actuate] heater:`-Urteile — `RUNNING`, wenn Aktuierung erlaubt ist;
   `SIMULATED - dry_run blocks...` bei `dry_run_mode=TRUE`; `BLOCKED because tank is empty` usw.
   Der Decision-POST kann bis zu **~2–4 Minuten** dauern (LLM-Kette); die Firmware wartet bis 300 s.
2. **CAM `s`**: GET `/config` → Foto-POST `/core/photo` → HTTP-Status + Body; die Analyse läuft
   **asynchron** nach der sofortigen 200-Antwort. In Google Drive das Foto prüfen und die
   `Events`-Zeile (`event_id` = `cam-<YYYYMMDD>`) mit den Analysefeldern.
3. **CAM `c`** (Scan-Test): zuerst eine Sitzung öffnen (`scan_session_active=true` in
   `SystemConfig` setzen oder den Montags-Trigger abwarten). Dann `c` senden: erwartet werden
   `[scan] cloud session ACTIVE - running the sweep now`, Upload-Status/Body, `/yolo-scan/done`
   und eine neue `DiseaseScans`-Zeile. Bei geschlossener Sitzung bricht `c` ohne Uploads ab —
   das ist das beabsichtigte Gate.
4. **`l`** am WROOM: Aktuatorgrenze ändern (z. B. `30`) und den bestätigten neuen Wert prüfen;
   sie übersteht Reboots.
5. **Erwartetes Guardrail-Verhalten:** Tank leer → Pumpe blockiert/verweigert;
   `dry_run_mode=TRUE` → überhaupt kein GPIO; Heizung startet nicht ab ≥ 39,5 °C und schaltet bei
   40,0 °C ab; jede Aktuierung wird durch Entscheidungs- und Laufzeitgrenze gekappt.

**Wichtige Serial-Monitor-Einstellungen:** **115200 Baud** und **„No line ending"**. Mit
angehängtem Zeilenumbruch liest die `t`-Bestätigung den Umbruch statt `y` und bricht ab.

---

## 7. Erwartete Zeiten

- Decision-POST (`/core/sensor`): bis zu **~2–4 Minuten** (LLM-Agenten); Firmware-Timeout 300 s,
  ein Versuch, kein Retry-Sturm.
- Tagesfoto (`/core/photo`): Webhook antwortet sofort (`{"status":"received"}`); die Analyse läuft
  asynchron weiter.
- Scan: Der Sweep lädt ein Foto zu `/yolo-scan`, dann schließt `/yolo-scan/done` die Sitzung;
  Vision → YOLO → Judge → `DiseaseScans` läuft danach. Urteils-Benachrichtigungen sind informativ
  und blockieren den nächsten Zyklus nie.
