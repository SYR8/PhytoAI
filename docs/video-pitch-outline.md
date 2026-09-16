# Video-Pitch — Skizze (2–4 Minuten)

Vorgaben des BWKI: 2–4 Minuten, allgemein verständlich, Team vorstellen, Motivation und Ziel nennen,
zeigen was geleistet wurde und worin die technische Raffinesse liegt, finales Ergebnis präsentieren —
**die ersten 30 Sekunden sind am wichtigsten**.

Aufnahmeformat (vom Besitzer gewählt): Solo; gesprochene Segmente von Mohammad Abdin, dazwischen
Bildschirm-/Hardwareaufnahmen, mit **Floating-Cam-Einblendung** (Sprecher klein im Bild), die kommentiert,
was der Zuschauer gerade sieht — wie ein Erklär-Overlay.

Tonalität: sachlich, ehrlich, begeistert für das Problem — keine Werbesprache; Grenzen offen nennen.

---

## Zeitplan und Inhalt

### 0:00–0:30 — Hook (die ersten 30 Sekunden)

**Bild:** Nahaufnahme einer welken Zimmerpflanze → schnell wechselnd: Freunde, die „nur mal Wasser
drauf“ gießen; Schnitt auf das eigene System, das ein Foto macht und eine Entscheidung anzeigt.
**Sprecher (Vorschlag, in eigenen Worten):** „Pflanzen sterben selten am Raum — sie sterben, weil niemand
rechtzeitig hinsieht. Genau das habe ich automatisiert: PhytoAI überwacht meine Pflanze, entscheidet selbst
über Gießen und Heizen und meldet sich, wenn etwas nicht stimmt.“
**Ziel:** Problem in einem Satz + Lösung in einem Satz.

### 0:30–0:50 — Team und Motivation

**Bild:** Sprecher mit Floating-Cam; darunter kurz der Projektname als Einblendung.
**Inhalt:** Solo-Projekt von Mohammad Abdin (BWKI-Benutzername `MOs`); Motivation: viele Pflanzen im
Umfeld gingen trotz „Pflege“ ein; Recherche zeigte: es liegt meist am Gießen und am fehlenden Verständnis,
nicht an der Wohnung. Keine erfundene Story — nur diese Motivation aus den freigegebenen BWKI-Antworten.

### 0:50–1:10 — Das Ziel

**Bild:** Skizze/Animation des Datenflusses (Sensor → Workflow → Datenbank → Dashboard).
**Inhalt:** Ziel = günstige, nachrüstbare Lösung für Zimmer-, Balkon- und Gartenpflanzen, die den Zustand
jederzeit zeigt und Entscheidungen aus der Historie trifft statt nach festem Zeitplan.

### 1:10–1:50 — Live-Demo des Systems

**Bild (Bildschirm + Hardware):**
1. Dashboard: Overview mit Pflanzenstatus, Trenddiagramm, drei Vitals — kurz zeigen, wie eine Meldung
   aussieht (Timeline/Benachrichtigungszentrum).
2. Hardware am Bench: WROOM + Sensoren + Relais/Pumpe; serielles Log mit Sensorwerten.
3. Workflow in n8n: ein simulierter Sensor-POST → Entscheidungsantwort → neue Zeile in Sheets.
**Floating-Cam:** erklärt jeweils in einem Satz, was gerade zu sehen ist.

### 1:50–2:30 — Technische Raffinesse

**Bild:** n8n-Workflow-Branches, Guardrails-Code, Plant Doctor / Scan-Ergebnis, lokal laufender
Klassifikator (Konsole).
**Inhalt (Kernbotschaften):**
- Multi-Agenten-Workflow (Historie → Entscheidung → Sicherheits-Guardrails) — **die KI ist beratend, die
  Guardrails sind Code und nie KI-übersteuerbar**.
- Lokaler YOLOv8n-cls-Klassifikator (CPU) als Zweitmeinung; Anbindung über HTTP an n8n.
- Human-in-the-Loop: offene Fragen landen als `Notifications`-Zeile im Dashboard, Buttons setzen den
  Workflow fort (Resume-URLs).
- Zahlen nur, wenn belegt: Validierung 96,08 % Top-1 / 99,955 % Top-5, **kein** Testsatz behauptet.

### 2:30–3:00 — Was selbst gebaut wurde

**Bild:** Collage: Wiring/Aufbau, Firmware-Code, Kalibrierungs-Serienausgabe, Dashboard-Code, Trainingsskript.
**Inhalt:** Hardware-Aufbau, Verkabelung, Firmware, Kalibrierung, Workflow, Dashboard, Training und Tests
stammen vom Besitzer; KI-Werkzeuge (opencode, Perplexity) waren nur Assistenten, alles wurde selbst
geprüft und getestet (exakt wie in den BWKI-Antworten).

### 3:00–3:30 — Finales Ergebnis und Grenzen (ehrlich)

**Bild:** Dashboard final + Hardware; danach kurz schwarze Karte mit Grenzen als Liste.
**Inhalt:** Software-Kette getestet, Hardware einzeln am Bench geprüft, Modell auf dem Server im Einsatz;
**Dauerbetrieb an einer echten Pflanze steht noch aus**. Grenzen: WLAN + Server nötig; eine Kamera deckt
große Pflanzen nicht ab; Kalibrierung kostet Zeit; Push bei geschlossener Seite nicht implementiert.

### 3:30–4:00 — Abschluss

**Bild:** Sprecher mit Floating-Cam, letzte Einstellung: das System neben der Pflanze.
**Inhalt:** Ausblick (die freigegebenen Ideen: peristaltische Dosierpumpe, Wasserkühlung, Vape-Zellen-Akku,
Standalone-WLAN, mehrere Kameras, Garten-/Mehrpflanzenbetrieb) + Einladung: „Baut es nach — die Bauanleitung
steht im Repository.“ Kein Versprechen, keine Garantien.

---

## Produktions-Checkliste

- [ ] Gesprochene Segmente (Kamera auf Stativ) zuerst aufnehmen, dann Bildschirmaufnahmen.
- [ ] Floating-Cam-Overlay nur dort, wo es erklärt — nicht durchgehend.
- [ ] Bricht die 4-Minuten-Grenze nicht; lieber 3:30 als 4:05.
- [ ] Keine personenbezogenen Daten, keine Tokens, keine Spreadsheet-IDs und keine Webhook-URLs im Bild
      (Browser-Zoom prüfen; Konten/Emails ausblenden).
- [ ] Zahlen nur aus den freigegebenen BWKI-Antworten sprechen.
- [ ] Untertitel (Deutsch) hinzufügen; Ton normalisiert.

Regel: Dieser Pitch zeigt nur, was im Repository steht und vom Besitzer freigegeben wurde — nichts wird
zugespitzt, keine erfundenen Ergebnisse, keine fremden Personen als Mitwirkende.
