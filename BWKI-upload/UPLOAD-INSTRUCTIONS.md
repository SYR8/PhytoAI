# Upload-Anleitung — BWKI-Einreichung (PhytoAI)

Stand: lokal vorbereitetes Paket. Es wurde **nichts** veröffentlicht, committed oder gepusht.

## Was wohin hochgeladen wird

1. **„Code“-Feld:** `BWKI-upload/PhytoAI-BWKI-code.zip` hochladen (max. 100 MB).
   Das ZIP enthält den öffentlichen Projektstand (Code + Dokumentation). Die private
   Deployment-Konfiguration (`dashboard/config.js`), private Kennungen und die
   BWKI-Formularunterlagen sind **nicht** enthalten. **Neu enthalten (ZIP vor dem Upload neu bauen):**
   `SETUP-GUIDE.md` / `SETUP-GUIDE.de.md` (Einrichtungs- und Testanleitung für Gutachter) sowie
   `test-data/PhytoAI-demo-data.xlsx` (Demo-Tabelle mit exakten Kopfzeilen und Seed-Zeilen).
2. **„Zusätzliche Dateien“:** die einzelnen Dateien aus
   `BWKI-upload/ADDITIONAL-FILES/` hochladen (max. 5 Dateien, max. 20 MB pro Datei).
   Die Slots sind in `ADDITIONAL-FILES/README.md` beschrieben; echte Bilder/Diagramme
   bitte vor dem Upload dort ablegen und die README ergänzen.
3. **`UPLOAD-INSTRUCTIONS.md` selbst** muss **nicht** hochgeladen werden (nur interne Anleitung).
4. **Video-Pitch:** separat morgen im Video-Feld hochladen (max. 500 MB, 2–4 Minuten).

## Checkliste vor dem Absenden

- [ ] **Code-ZIP < 100 MB** — aktuelle Größe siehe Manifest unten (nach dem Erstellen prüfen:
      `Get-Item BWKI-upload\PhytoAI-BWKI-code.zip`).
- [ ] **ZIP vor dem Upload neu bauen**, damit `SETUP-GUIDE.md`, `SETUP-GUIDE.de.md` und
      `test-data/PhytoAI-demo-data.xlsx` enthalten sind.
- [ ] **Jede zusätzliche Datei < 20 MB** und höchstens 5 Dateien.
- [ ] **Keine privaten Formularantworten im ZIP** — geprüft: die Dateien
      `docs/bwki-answers-draft.md` und `docs/video-pitch-outline.md` sowie alle
      sonstigen lokalen Entwürfe sind nicht enthalten.
- [ ] **GitHub-Link im Code-README vorhanden** — geprüft:
      `https://github.com/SYR8/PhytoAI` steht in der ersten Zeile des ZIP-README.
- [ ] **Keine Zugangsdaten/Kennungen im ZIP** — geprüft mit einem rekursiven
      Secret-/Privacy-Scan (Ergebnis unten).
- [ ] Zusätzliche Bilder auf private Details geprüft (siehe Regeln in
      `ADDITIONAL-FILES/README.md`).
- [ ] Video-Pitch fertig und < 500 MB.

## Erstelltes Paket (Manifest)

- **Code-ZIP:** `BWKI-upload/PhytoAI-BWKI-code.zip` — 3.139.537 Bytes (2,99 MB); 72 Einträge
  (dashboard, docs, firmware, Hardware, scripts, test-data, workflows, yolo-service + Root-Dateien).
- **Zusätzliche Dateien:** `01-system-overview.png` (137 KB, Diagramm), `04-ml-results.png`
  (83 KB, Ergebnis-Visualisierung), `05-wiring-diagram.png` (107 KB, Diagramm) — alle < 20 MB.
- **Noch offen (Besitzer):** `02-dashboard.png` (eigener Screenshot), `03-hardware.jpg` (eigenes Foto).
  Beide vor dem Upload auf private Details prüfen (siehe `ADDITIONAL-FILES/README.md`).
- **Privacy-Scan:** keine Zugangsdaten, privaten Kennungen oder persönlichen Daten im Paket oder ZIP
  (nur die Platzhalter `YOUR_SPREADSHEET_ID`, `YOUR-N8N-HOST`, `CHANGE_ME`).
- **GitHub-Link im ZIP-README:** vorhanden (`https://github.com/SYR8/PhytoAI`, Zeile 5).

## Rechtliches / Inhalt

- Lizenz: MIT (siehe `LICENSE` im ZIP). © 2026 Mohammad Abdin.
- Der Datensatz PlantVillage selbst ist **nicht** enthalten (nur Skripte).
- Das Modell `yolo-service/models/model.pt` ist der trainierte, eingesetzte Checkpoint
  und im ZIP enthalten; dokumentiert im Code-README (Abschnitt „Das eingesetzte Modell“).
- Push bei geschlossener Seite ist nicht implementiert; Browser-Hinweise funktionieren
  nur bei offener Seite und erteilter Berechtigung — so auch im Code-README beschrieben.
