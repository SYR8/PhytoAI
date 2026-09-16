# BWKI-Antworten — Entwurf (vom Besitzer freigegeben)

Status: **Owner-approved (2026-09-16)** — alle Antworten wurden vom Besitzer geprüft und freigegeben.
Diese Datei ist ein Entwurf für das BWKI-Formular; es wurde **nichts** eingereicht.
Grundlage der Fragen und Zeichenlimits: `docs/BWKI Questions.txt`. Zeichenzahlen inkl. Leerzeichen, exakt gezählt.

Projektname (Formularfeld): **PhytoAI: KI-gestützte Pflanzenüberwachung & Klimasteuerung**

---

## Team

**Frage:** Alle Mitglieder des Teams mit vollem Namen und Benutzernamen (kein Zeichenlimit im Formular angegeben)

**Antwort:**

> BWKI-Benutzername: MOs — Realname: Mohammad Abdin (Einzelprojekt)

**Zeichenzahl:** 65 — Status: **Owner-approved**

## Ziel des Projekts

**Frage:** Was ist das Ziel des Projekts? (max. 400 Zeichen inkl. Leerzeichen)

**Antwort:**

> Meine Pflanzen – und die von Freunden – gingen trotz Pflege ständig ein. Meist liegt es nicht an der Wohnung, sondern an unregelmäßigem Gießen und fehlendem Wissen. PhytoAI übernimmt das: Sensoren messen Bodenfeuchte, Temperaturen, Gewicht und Tankstand, eine KI entscheidet über Gießen und Heizen, ein Dashboard zeigt alles – eine günstige Lösung für Zimmer-, Balkon- und Gartenpflanzen.

**Zeichenzahl:** 388 / 400 — Status: **Owner-approved**

## Anwendungsfall

**Frage:** Wer kann eure Ergebnisse verwenden? Was ist der Anwendungsfall? (max. 260 Zeichen inkl. Leerzeichen)

**Antwort:**

> Gedacht ist PhytoAI für Menschen, die ihre Pflanzen lieben, aber wenig Zeit haben oder unsicher sind, ob sie richtig gießen. Sie stellen das System neben die Pflanze, füllen den Wassertank und sehen im Dashboard, was gerade passiert – auch aus dem Urlaub.

**Zeichenzahl:** 255 / 260 — Status: **Owner-approved**

## Was wurde entwickelt

**Frage:** Was habt ihr entwickelt? (max. 400 Zeichen inkl. Leerzeichen)

**Antwort:**

> PhytoAI ist ein Nachrüstsystem: Ein ESP32-WROOM misst Bodenfeuchte, Temperaturen, Gewicht, Licht und Tankstand und steuert Pumpe und Heizung. Ein ESP32-CAM liefert Fotos; ein n8n-Workflow mit KI-Agenten (Gemma) entscheidet und dokumentiert in Google Sheets. Dazu ein Web-Dashboard mit Assistent, Diagrammen und Benachrichtigungen sowie ein lokaler YOLOv8-Bildklassifikator für Krankheitsverdacht.

**Zeichenzahl:** 396 / 400 — Status: **Owner-approved**

## Eigenanteil und Unterstützung

**Frage:** Welchen Umfang hat der Eigenanteil in eurem Projekt und welche Form der Unterstützung habt ihr erfahren? (max. 400 Zeichen inkl. Leerzeichen)

**Antwort:**

> Alle Entwürfe, Hardware-Aufbau, Verkabelung, Firmware, Kalibrierung, der n8n-Workflow, das Dashboard, Training und Tests stammen von mir. Unterstützt wurde ich nur von KI-Werkzeugen: opencode zum Programmieren, Perplexity für Recherche; die Aufgaben habe ich vorgegeben, jeden Vorschlag geprüft und alles selbst getestet. Personen, Lehrer oder Mentoren haben nicht mitgewirkt.

**Zeichenzahl:** 376 / 400 — Status: **Owner-approved**

## Datensatz

**Frage:** Beschreibung eures Datensatzes (Herkunft, Größe, Klassen...) (max. 600 Zeichen inkl. Leerzeichen)

**Antwort:**

> Verwendet wurde der öffentlich verfügbare PlantVillage-Datensatz in der Farbversion von spMohanty (GitHub) mit 38 Klassen von Pflanzenkrankheiten und gesunden Blättern. Vollständig enthält er rund 54.000 Bilder; ich habe pro Klasse maximal 300 Bilder verwendet (ca. 11.000 pro Epoche), weil das Training auf dem Server nur mit CPU läuft. Die exakte Zahl der tatsächlich verwendeten Bilder lässt sich nicht mehr nachvollziehen, da der vorbereitete Datensatz auf dem Server gelöscht wurde.

**Zeichenzahl:** 487 / 600 — Status: **Owner-approved**

## Datenaufbereitung

**Frage:** Aufbereitung der Daten und sonstige Vorbereitungen (max. 600 Zeichen inkl. Leerzeichen)

**Antwort:**

> Die Farbbilder werden mit einem eigenen Skript geladen (sparse Checkout) und automatisch in die Klassifizierungs-Struktur train/<Klasse> und val/<Klasse> aufgeteilt: 80/20 pro Klasse mit festem Zufallswert, also reproduzierbar. Trainiert wird bei 160×160 Pixeln; die Standard-Augmentierung von Ultralytics bleibt dabei aktiv. Eigene Bilder aus dem Betrieb (DiseaseScans mit bestätigtem Urteil) bringt ein Export-Skript in dasselbe Format und mischt sie später dem Training bei.

**Zeichenzahl:** 477 / 600 — Status: **Owner-approved**

## Methoden

**Frage:** Beschreibung eurer Methoden (Aufbau neuronales Netz, machine learning model, trainieren und testen der Daten...) (max. 600 Zeichen inkl. Leerzeichen)

**Antwort:**

> Das Modell ist ein 38-Klassen-Bildklassifikator (kein Detektor): ein Feintuning (Transfer Learning) des öffentlichen YOLOv8n-cls von Ultralytics, 12 Epochen, Bildgröße 160×160 Pixel, Batch-Größe 32, reines CPU-Training, fester Seed. Es läuft lokal in einem Docker-Container (FastAPI) auf einem Server und wird von n8n per HTTP abgefragt. Im Workflow kombiniert ein KI-Agent (Gemma) das Bildurteil mit Sensorhistorie und gewichtet den Klassifikator zunächst niedrig; ein geplantes Flywheel trainiert mit bestätigten eigenen Bildern weiter.

**Zeichenzahl:** 538 / 600 — Status: **Owner-approved**

## Ergebnis / Auswertung

**Frage:** Wie habt ihr euer Projekt ausgewertet? Welche Genauigkeit habt ihr auf den Trainingsdaten und auf den Testdaten erreicht? (max. 1000 Zeichen inkl. Leerzeichen)

**Antwort:**

> Ausgewertet wurde auf dem Validierungssplit (20 % der vorbereiteten Farbbilder). Dort erreicht das Modell 96,08 % Top-1- und 99,955 % Top-5-Genauigkeit. Ein separater Testsplit wurde nicht zurückgelegt, und eine Trainingsgenauigkeit liegt nicht als Messwert vor – deshalb nenne ich keine Testgenauigkeit. Zusätzlich habe ich die Komponenten praktisch geprüft: Sensorwerte und Kalibrierung am Bench-Aufbau, den Workflow und das Dashboard in Tests mit Testdaten und simulierten Ausführungen. Ein Dauerbetrieb am echten Pflanzensystem steht noch aus: Die Hardware ist aufgebaut und einzeln getestet, das Gesamtsystem läuft noch nicht im Alltag.

**Zeichenzahl:** 641 / 1000 — Status: **Owner-approved**

## Anforderungen

**Frage:** Gibt es besondere Anforderungen, um euer Projekt zu nutzen? (z.B. Hardware, Speicherkapazität, API, ..) (max. 400 Zeichen inkl. Leerzeichen)

**Antwort:**

> Nachbau braucht: ESP32-WROOM mit Sensoren (kapazitiver Bodenfeuchtesensor, 2× DS18B20, DHT22, HX711 mit 1-kg-Wägezelle, LDR, Tank-Sensor), Relais, 3-V-Pumpe, 5-V-/10-W-Heizung, WLAN und Strom. Optional: ESP32-CAM. Software: n8n (Docker), kostenloses Google-Konto (Sheets/Drive), OpenRouter-Schlüssel (Gemma), optional Server für den Klassifikator (CPU) und statisches Hosting fürs Dashboard.

**Zeichenzahl:** 391 / 400 — Status: **Owner-approved**

## Probleme

**Frage:** Auf welche Probleme seid ihr gestoßen? (max. 400 Zeichen inkl. Leerzeichen)

**Antwort:**

> Die Heizung bekam am Relais zu wenig Strom; erst eine eigene Stromversorgung löste das. Die Wägezelle zeigte dauerhaft etwa das 2,5-Fache des echten Gewichts – die Ursache lag im Auslesecode, nicht in der Verkabelung. Lange blockierte mich die Serververbindung: HTTPS-Aufrufe wurden abgelehnt, bis ich fand, dass mein WLAN-Router die vielen Testanfragen blockierte.

**Zeichenzahl:** 365 / 400 — Status: **Owner-approved**

## Größtes Potential

**Frage:** Was ist das größte Potential eures Projekts? (max. 260 Zeichen inkl. Leerzeichen)

**Antwort:**

> Günstig, fast vollautomatisch und über einen Server statt lokales WLAN erreichbar: Man kann die Pflanze eine Woche allein lassen, muss nur den Tank füllen – und erfährt überall, wenn etwas nicht stimmt. Erweiterbar auf viele Pflanzen und Gärten.

**Zeichenzahl:** 245 / 260 — Status: **Owner-approved**

## Größte Schwachstelle

**Frage:** Was ist die größte Schwachstelle eures Projekts? (max. 260 Zeichen inkl. Leerzeichen)

**Antwort:**

> PhytoAI braucht WLAN und einen Server; ohne Internet läuft es nicht. Für sehr große Pflanzen reicht eine Kamera nicht, um alle Blätter zu sehen – hier wären mehrere ESP32-CAMs nötig. Auch die Kalibrierung der Sensoren kostet am Anfang Zeit.

**Zeichenzahl:** 240 / 260 — Status: **Owner-approved**

## Unendlich Ressourcen

**Frage:** Wie würdet ihr euer Projekt vorantreiben, wenn ihr unendlich viele Ressourcen und Zeit hättet? (max. 400 Zeichen inkl. Leerzeichen)

**Antwort:**

> Mit unbegrenzten Mitteln würde ich eine peristaltische Pumpe ergänzen, damit die KI bei Bedarf Nähr- oder Behandlungsflüssigkeit dosieren kann. Dazu ein Wasserkühlsystem mit Lüfter und Peltier-Element für heiße Sommer, einen eigenen Topf als fertiges Gehäuse und ein Akku-Paket aus gebrauchten Vape-Zellen für den Betrieb ohne Steckdose. Langfristig: mehrere Kameras und Mehrpflanzen-/Gartenbetrieb.

**Zeichenzahl:** 399 / 400 — Status: **Owner-approved**

## Quellen und Eigenleistung

**Frage:** Gib wichtige Quellen an ... Wenn du generative KIs genutzt hast, gib bitte hier an, welche. ... Schreibt hier einen Satz zur Bestätigung eurer Eigenleistung. (kein Zeichenlimit im Formular angegeben)

**Antwort:**

> Quellen: PlantVillage-Datensatz (spMohanty/PlantVillage-Dataset auf GitHub), Ultralytics-YOLOv8-Dokumentation, n8n-Dokumentation, Google-Sheets-/Drive-API-Dokumentation. Generative KI: opencode als Programmier-Assistent und Perplexity für Recherche. Alle Ideen, Entscheidungen, Aufgabenstellungen, Tests und die Prüfung der Ergebnisse stammen von mir; die genannten Werkzeuge haben mich beim Umsetzen und Suchen unterstützt.

**Zeichenzahl:** 424 — Status: **Owner-approved**

---

Hinweis: Die Genauigkeitswerte stammen ausschließlich aus der Validierung des Modells (96,08 % Top-1 / 99,955 % Top-5). Es gibt keinen separaten Testsatz und keinen Trainingsgenauigkeits-Messwert; beides wird nicht behauptet.
