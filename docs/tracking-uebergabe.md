# Tracking-Übergabe — Format für KI-ausgewertete Spiele

Dieses Dokument ist der **Vertrag zwischen zwei Claude-Sitzungen**:

- **Sitzung A („Auswerter")** — läuft dort, wo das Videomaterial liegt (Mac, Google Drive,
  DaVinci-Ordner). Sie schaut die Bilder/Clips an und schreibt **eine Datei** in genau dem
  Format unten.
- **Sitzung B („Einpfleger")** — läuft im HeroLeague-Repo. Sie liest die Datei, stellt
  Rückfragen zu Offenem und übernimmt die Werte ins Statistics Center.

Beide Seiten lesen **dieses** Dokument. Damit versteht B ohne Nachfragen, was A getrackt hat.

---

## 1. Grundregel: Tracklets statt Namen

Eine Trikotnummer ist selten durchgehend sichtbar (Spieler weggedreht, Gedränge, Weitwinkel).
Deshalb wird **nie Bild für Bild identifiziert**. Stattdessen:

1. Jeder Spieler bekommt beim ersten Auftauchen eine **anonyme Clip-ID**:
   `A1, A2, …` = Heimteam · `B1, B2, …` = Auswärtsteam.
   Ist die Team-Zugehörigkeit **nicht** eindeutig sichtbar (gemischte Trikotfarben), werden
   neutrale IDs `P1, P2, …` mit `"team": null` verwendet — siehe Abschnitt 5.
   **Eine einmal vergebene ID wird nie umbenannt.** Sie ist der Schlüssel, an dem die Events
   hängen — sie umzubenennen würde jedes Event anfassen und widerspricht der Regel
   „Korrektur an einer Stelle".
2. Verankert wird an dem, was **von hinten und in Bewegung** sichtbar ist — in dieser
   Reihenfolge der Verlässlichkeit: **Schuhfarbe → Stutzen/Socken → Haare/Frisur → Statur**.
   *Nicht* am Gesicht, *nicht* an der Nummer.
3. Ereignisse hängen **an der Clip-ID**, nicht am Namen.
4. **Auflösung zum Namen — der Normalfall ist die Rückfrage, nicht die Nummer.**
   Die meisten Trikots haben **keine Nummer**. Deshalb gilt diese Rangfolge:
   - **a) Frage-Runde (Regelfall):** Vor dem Tracking werden alle Tracklets einmal dem Menschen
     vorgelegt — ID, Merkmale, erster Auftritt. Er nennt die Namen. Danach läuft die Auswertung
     mit echten Namen durch.
   - **b) Nummer (Glücksfall):** Ist bei jemandem eine Nummer lesbar, löst sie die ID sofort
     auf — und **alle früheren Ereignisse dieser ID gelten rückwirkend**. Ein Blick genügt.
   - **c) Steckbrief (nur als Vorschlag):** Passt ein Tracklet klar auf einen gespeicherten
     Steckbrief, darf es vorgeschlagen werden — aber mit `konfidenz` ≤ 0.7 und trotzdem als
     Rückfrage. Niemals still zuordnen.
5. Reißt die Kette (Spieler kreuzen sich, verlässt das Bild, fliegender Wechsel), wird eine
   **neue** Clip-ID angelegt. Niemals raten. Nicht aufgelöste IDs landen unter `offeneFragen`
   und werden von einem Menschen beantwortet — sie werden **nie verworfen**.

---

## 2. Erlaubte Aktionen — NUR diese 21 Schlüssel

`action` muss **exakt** einer dieser Werte sein. Keine eigenen Namen, keine deutschen Labels.

| Schlüssel | Bedeutung |
|---|---|
| `pass_ok` | Pass kommt an |
| `pass_fail` | Fehlpass |
| `key_pass` | Schlüsselpass (leitet Torchance ein) — zusätzlich `pass_ok`, wenn angekommen |
| `assist` | Vorlage zum Tor — zusätzlich `pass_ok` |
| `shot_on` | Schuss aufs Tor |
| `shot_miss` | Schuss daneben/drüber/Pfosten |
| `shot_blocked_off` | eigener Schuss wird geblockt |
| `goal` | Tor (zählt automatisch als Schuss — **nicht** zusätzlich `shot_on`) |
| `dribble_won` | Dribbling gelungen |
| `dribble_lost` | Dribbling misslungen |
| `duel_won` | Zweikampf gewonnen |
| `duel_lost` | Zweikampf verloren |
| `interception` | Pass abgefangen |
| `shot_blocked_def` | gegnerischen Schuss geblockt |
| `turnover` | Ball vertändelt (ohne Pass/Zweikampf) |
| `own_goal` | Eigentor |
| `penalty_goal` | verwandelter Elfmeter — zusätzlich `goal` |
| `save` | Parade (nur Torwart) |
| `gk_goal_against` | Gegentor (nur Torwart) |
| `gk_position_save` | Standparade, ungefährlich (nur Torwart) |
| `penalty_save` | gehaltener Elfmeter (nur Torwart) |

### Zählweise
- Jede Taste ist ein **eigener Zähler, nur nach oben**. `delta` ist immer **positiv**, fast immer `1`.
- Ein misslungenes Dribbling zieht **nichts** von `dribble_won` ab — es ist `dribble_lost +1`.
- Gegensatz-Paare (`pass_ok`↔`pass_fail`, `duel_won`↔`duel_lost`, `shot_on`↔`shot_miss`)
  werden **getrennt** hochgezählt, nie gegeneinander verrechnet.
- Pro Einzelaktion ein eigener Eintrag. Kein Zusammenfassen, kein negatives `delta`.

### Automatische Fußball-Logik (ableiten, auch wenn nicht ausgesprochen)
- `goal` / `penalty_goal` → zusätzlich `gk_goal_against` beim **gegnerischen** Torwart
- `own_goal` → `gk_goal_against` beim **eigenen** Torwart
- Schuss, den der Keeper hält → `shot_on` beim Schützen **und** `save` beim Torwart
- „X dribbelt Y aus" → `dribble_won` für X **und** `duel_lost` für Y
- „X erobert den Ball von Y" → `duel_won` für X **und** `duel_lost` für Y
- „X fängt den Pass von Y ab" → `interception` für X **und** `pass_fail` für Y
- „Y blockt X' Schuss" → `shot_blocked_off` für X **und** `shot_blocked_def` für Y

> **Achtung:** Welche Liga-Regeln das Zählen verändern (Torwart, Netzberührung, Freistöße,
> Feldverweis), steht in **Abschnitt 8**. Ohne das entstehen Phantom-Ereignisse.

### Nicht doppelt zählen
Ein Ballverlust ist **entweder** `pass_fail` **oder** `duel_lost` **oder** `turnover` — nie mehreres
für dieselbe Situation. Eine Interception ist kein Zweikampf. Ein gehaltener Schuss (`save`)
ist kein feldspielerseitig geblockter Schuss (`shot_blocked_def`).

---

## 3. Das Dateiformat

Eine JSON-Datei pro Spiel. Name: `<datum>_<block>_<heim>-vs-<auswaerts>.json`

```json
{
  "formatVersion": 1,
  "spiel": {
    "datum": "2026-09-13",
    "block": "Block 3",
    "art": "testspiel",
    "heim":     { "name": "New Way",    "trikot": "grau" },
    "auswaerts":{ "name": "Trossingen", "trikot": "blau" },
    "clip": "block3_newway_trossingen.mp4",
    "dauerSek": 420,
    "fps": 3
  },

  "tracklets": [
    {
      "id": "A1",
      "team": "New Way",
      "merkmale": "rote Schuhe, blonder Dutt, eher klein, weiße Stutzen kurz",
      "ersterAuftritt": "0:04",
      "aufgeloestAls": "Max Müller",
      "aufloesungBasis": "nummer",
      "aufloesungBei": "3:40",
      "nummer": 7,
      "konfidenz": 0.95
    },
    {
      "id": "A6",
      "team": "New Way",
      "merkmale": "schwarze Schuhe, dunkle Locken, groß",
      "ersterAuftritt": "4:10",
      "aufgeloestAls": null,
      "aufloesungBasis": null,
      "konfidenz": 0.4,
      "hinweis": "Fragment nach Wechsel bei 4:08, Nummer nie sichtbar"
    }
  ],

  "events": [
    {
      "t": "2:14",
      "tracklet": "A1",
      "action": "pass_ok",
      "delta": 1,
      "gegner": null,
      "konfidenz": 0.9,
      "begruendung": "flacher Pass in den Lauf von A2, kommt an"
    },
    {
      "t": "2:16",
      "tracklet": "A2",
      "action": "dribble_won",
      "delta": 1,
      "gegner": "B3",
      "konfidenz": 0.85,
      "begruendung": "Haken nach innen, B3 steigt ins Leere"
    },
    {
      "t": "2:16",
      "tracklet": "B3",
      "action": "duel_lost",
      "delta": 1,
      "gegner": "A2",
      "konfidenz": 0.85,
      "begruendung": "Folge-Ereignis zu dribble_won von A2"
    }
  ],

  "offeneFragen": [
    {
      "art": "tracklet_unaufgeloest",
      "tracklet": "A6",
      "frage": "A6 — New Way, schwarze Schuhe, dunkle Locken, groß. 3 Aktionen zwischen 4:10 und 5:02. Wer war das?",
      "betroffeneEvents": 3
    },
    {
      "art": "aktion_unklar",
      "t": "5:31",
      "tracklet": "B2",
      "frage": "5:31 B2 verliert den Ball — Fehlpass (pass_fail) oder im Zweikampf (duel_lost)? Bild nicht eindeutig.",
      "vorschlag": "turnover"
    }
  ],

  "statistik": {
    "eventsGesamt": 128,
    "tracklets": 17,
    "davonAufgeloest": 15,
    "eventsMitKonfidenzUnter07": 11
  }
}
```

### Feldregeln
- `t` — `m:ss` ab Clip-Start. Immer angeben; darüber prüft der Mensch gegen.
- `tracklet` — die Clip-ID, **nicht** der Name. Die Auflösung steht ausschließlich in `tracklets`.
  So lässt sich eine falsche Namenszuordnung an **einer** Stelle korrigieren, statt in 40 Events.
- `gegner` — Clip-ID des zweiten Beteiligten, sonst `null`. Der Unterlegene gehört **immer** zum
  gegnerischen Team.
- `konfidenz` — 0..1. Alles **unter 0,7** muss in `offeneFragen` auftauchen.
- `begruendung` — ein Halbsatz, was im Bild zu sehen war. Kein Roman, aber prüfbar.
- `aufloesungBasis` — `"mensch"` (Regelfall: vom Menschen benannt), `"nummer"` (Nummer gelesen,
  der zuverlässigste Fall), `"merkmal"` (nur über Steckbrief geraten — dann Konfidenz ≤ 0.7 und
  zusätzlich als Rückfrage ausgeben).
- Nichts erfinden. Kein Ereignis ohne sichtbaren Anlass. Lieber `offeneFragen` als geraten.

---

## 4. Steckbriefe — zwei Schichten

Wichtig für die Erwartung: **einmal anlegen und für immer fertig gibt es nicht.**

| Schicht | Inhalt | Haltbarkeit |
|---|---|---|
| **Stabil** | Statur/Größe, Hautton, Frisurtyp, Brille, Tattoo, auffälliger Laufstil | Wochen/Monate |
| **Pro Spieltag** | **Schuhfarbe**, Stutzen, Stirnband, Haare heute, Trikot | nur dieser Spieltag |

Die zweite Schicht macht die eigentliche Unterscheidung — und muss **jeden Spieltag neu erfasst**
werden. Beste Methode: ein Foto pro Team in einer Reihe, Namen einmal von links nach rechts
durchsagen. Zwei Minuten pro Team.

> **Datenschutz:** Personenbeschreibungen echter Spieler gehören **nicht** in dieses öffentliche
> Repo. Ablage in einem privaten Repo oder in der Neon-DB (Staff-geschützt). Hier steht nur das
> Format, nie echte Daten.

---

## 5. Ablauf pro Spiel: erst fragen, dann tracken

Weil Nummern fehlen, läuft jedes Spiel in **zwei Durchgängen**:

**Durchgang 1 — Aufstellung erkennen und erfragen.**
Aus den ersten Bildern (oder einem Aufstellungs-Clip) wird pro Spieler ein Tracklet mit
Merkmalen angelegt. Das Ergebnis geht als Liste an den Menschen:

```
A1  0:04  graues Shirt · rote Schuhe · blonder Dutt · eher klein   → wer?
A2  0:06  graues Shirt · weiße Schuhe · dunkle Locken · groß       → wer?
B1  0:09  blaues Shirt · schwarze Schuhe · kahl                    → wer?
```

**Zu jeder Zeile gehört ein Bildausschnitt** des Spielers (lokale Übersichtsdatei, z. B.
`tracking/<spiel>/frageliste.html` mit den Crops). Ein Mensch erkennt jemanden auf einem Bild
sofort, aus „rote Schuhe, eher klein" dagegen kaum. Der Ausschnitt ist nicht Kür, sondern der
Grund, warum die Frage-Runde in zwei Minuten statt in zwanzig erledigt ist.

Der Mensch beantwortet das **einmal** — bei 2 Teams sind das ~12–16 Zeilen. Erst danach beginnt
die eigentliche Auswertung. Das ist kein Notbehelf, sondern der vorgesehene Weg: Der Mensch löst
die Identität, die KI übernimmt das Mitzählen.

### Sonderfall: Trikotfarbe sagt nichts über das Team

Solange keine einheitlichen Trikots existieren, tragen Spieler desselben Teams **verschiedene
Farben**. Dann darf die Farbe **nicht** zur Team-Zuordnung benutzt werden:

- Tracklets werden als `P1, P2, P3 …` mit `"team": null` angelegt und **behalten diese ID für
  immer**. Steht das Team fest, wird **nur das Feld `team` gesetzt** — kein Umbenennen in
  `A…`/`B…`. Sitzung B liest ohnehin `team`, nicht das Präfix.
- Die Frage-Runde fragt **beides** ab: `P1 → wer, und welches Team?`
- **Querprobe aus dem Spielverlauf:** Wer gegeneinander spielt, verrät die Teams. Bei
  „P4 dribbelt P9 aus" sind P4 und P9 zwangsläufig in **verschiedenen** Teams, bei einem
  angekommenen Pass im **gleichen**. Diese Paarungen als Constraints sammeln und dem Menschen
  als Vorschlag zeigen (`P4 und P9 sind sicher gegnerisch`) — das halbiert die Rückfragen.
- Erst wenn alle Teams stehen, greift die automatische Fußball-Logik aus Abschnitt 2 (sie setzt
  voraus, dass „der Unterlegene gehört zum Gegner" gilt).

> **Ehrliche Grenze:** Sehen sich zwei Spieler wirklich zum Verwechseln ähnlich (gleiche Statur,
> gleiche Haare, gleiche Schuhe), trennt sie **kein** Verfahren zuverlässig. Dann werden beide
> als ein gemeinsames, ausdrücklich unsicheres Tracklet geführt und in `offeneFragen` gemeldet —
> nicht geraten und nicht stillschweigend aufgeteilt.

**Durchgang 2 — Ereignisse erfassen.**
Ab hier tragen die Tracklets echte Namen. Ein- und Auswechslungen erzeugen **neue** Tracklets,
die am Ende als Rückfrage nachgereicht werden.

> Faustregel: **Identität = Mensch. Vollständigkeit = KI.** Beides zu verlangen, funktioniert
> ohne Nummern nicht zuverlässig.

---

## 6. Der Weg der Datei

1. Sitzung A wertet aus und schreibt die JSON-Datei (Drive/lokal).
2. Übergabe an Sitzung B — eine der drei Wege:
   - **privates Repo** (empfohlen): A committet die Datei, B liest sie direkt. Versioniert,
     kein Copy-Paste, überlebt jeden Kontext-Reset.
   - **Upload** in den Chat von B.
   - **Einfügen** als Text in den Chat von B (JSON ist kompakt genug für ein Spiel).
3. B prüft: Schlüssel gültig? Folge-Ereignisse vollständig? Doppelzählungen? Summen plausibel?
4. B stellt die `offeneFragen` — kurz und einzeln, damit sie schnell zu beantworten sind.
5. Erst nach den Antworten werden die Werte ins Statistics Center übernommen.

---

## 7. Ablauf für Sitzung A: Häppchen mit Zustandsdatei

Ein ganzes Spiel passt **nicht** in einen Kontext. 7 Min bei 3 fps = ~1.260 Bilder. Deshalb wird
in Abschnitten gearbeitet, und der Zustand lebt in einer **Datei**, nicht im Gedächtnis.

### Ordner
```
tracking/<spiel>/
  frames/        f_00001.jpg …   (Proxy-Bilder, 960 px)
  state.json     laufender Zustand — Tracklets + Events + Fortschritt
  ergebnis.json  Endergebnis im Format aus Abschnitt 3
```

### Bilder erzeugen
```bash
ffmpeg -i "<video>" -vf "fps=3,scale=960:-1" -q:v 4 frames/f_%05d.jpg
```
960 px genügt für Schuh-/Trikotfarbe und Statur. Nur wenn eine **Nummer** gelesen werden soll,
zusätzlich einen hochauflösenden Ausschnitt ziehen:
```bash
ffmpeg -ss <sek> -i "<video>" -frames:v 1 -vf "crop=iw/3:ih/3:<x>:<y>,scale=1280:-1" crop.jpg
```

### Die Schleife
Pro Durchgang **90 Bilder** (= 30 Sekunden bei 3 fps).

**Gemessene Kosten** (nicht geschätzt): ein Bild mit 960 px ≈ **930 Tokens**, mit 1280 px ≈
**1.650**. 90 Bilder à 960 px sind damit ~**84.000 Tokens**. Ein ganzes Spiel (1.260 Bilder)
wären ~1,17 Mio. Tokens — passt in **keinen** Kontext, die Verdichtung käme sicher und würde
mitten im Spiel fast alles wegwerfen.

**Warum 90 und nicht das technische Maximum:** Selbst wo mehr hineinpasst, ist nicht messbar, ob
Bild 12 und Bild 800 im selben langen Kontext noch gleich genau verglichen werden. Darauf wird
keine Spielerstatistik gewettet.

**Zeitbedarf** (Erfahrungswert, am ersten Häppchen zu prüfen): normales Häppchen 15–25 Min,
erstes Häppchen 30–40 Min (Tracklets, Crops, Frageliste entstehen zusätzlich), ganzes Spiel
also **4–5 Stunden**. Die Häppchen laufen zwingend nacheinander, weil jedes auf den Tracklets
des vorigen aufbaut.

1. **`state.json` lesen.** Immer zuerst. Nie aus dem Gedächtnis weiterarbeiten.
2. **Tracklets wiedererkennen.** Jedes Tracklet aus `state.json` in den neuen Bildern anhand der
   gespeicherten Merkmale suchen. Passt keines eindeutig → **neues** Tracklet anlegen und in
   `offeneFragen` eintragen. **Niemals raten, niemals stillschweigend gleichsetzen.**
3. **Die 90 Bilder auswerten** und Ereignisse nach Abschnitt 2 und 3 erzeugen.
4. **`state.json` zurückschreiben** — Tracklets, alle Events bisher, `letztesBild`.
5. Nächster Durchgang. Am Ende alles zu `ergebnis.json` zusammenfassen.

### `state.json`
```json
{
  "letztesBild": 270,
  "standSek": 90,
  "tracklets": [
    { "id": "A1", "team": "New Way", "merkmale": "rote Schuhe, blonder Dutt, klein",
      "ersterAuftritt": "0:04", "aufgeloestAls": "Max Müller",
      "aufloesungBasis": "mensch", "konfidenz": 0.9 }
  ],
  "events": [
    { "t": "0:12", "tracklet": "A1", "action": "pass_ok", "delta": 1,
      "gegner": null, "konfidenz": 0.9, "begruendung": "Ablage nach links, kommt an" }
  ],
  "offeneFragen": []
}
```

### Bei unklaren Stellen nachziehen statt raten
3 fps heißt 0,33 s Abstand — ein Pass ist in 1–2 Bildern vorbei. Ist eine Stelle unklar, **erst
nachziehen, dann entscheiden**. Aber **nur den Bildbereich um die Szene und nur 1,5–2 s** —
nicht das ganze Bild über 3 s:
```bash
ffmpeg -ss <sek> -t 2 -i "<video>" \
  -vf "fps=10,crop=iw/2:ih/2:<x>:<y>,scale=1280:-1" -q:v 3 zoom/z_%03d.jpg
```
Das kostet **5.000–10.000 Tokens** statt ~50.000 für einen Vollbild-Zoom über 3 s — und ist auf
die Szene bezogen sogar **schärfer**, weil die Auflösung im Ausschnitt landet statt im Publikum.
Erst wenn es **danach** noch unklar ist, kommt die Stelle in `offeneFragen`.

### Die Häppchen-Grenze ist die Gefahrenstelle
Dort verrutscht die Zuordnung. Deshalb gilt: **Merkmale sind der Anker, nicht die Reihenfolge.**
Ein Tracklet darf nur fortgeführt werden, wenn die Merkmale passen — sonst neue ID und Rückfrage.
Eine ehrliche Rückfrage kostet zwei Sekunden, eine falsche Zuordnung verdirbt eine ganze
Spielerstatistik.

### Zu messen und zu berichten
Nach dem **ersten** 30-Sekunden-Durchgang drei Zahlen nennen: Bilder verarbeitet, Dauer,
Kontext verbraucht. Daraus lässt sich der Aufwand für ein ganzes Spiel (×14) abschätzen,
**bevor** eines komplett durchläuft.

---

## 8. Liga-Regeln, die das Zählen beeinflussen

Aus dem *Regelwerk für Schiedsrichter* der Hero League. Nur die Punkte, die sich auf die
Erfassung auswirken — nicht das ganze Regelwerk.

### Spieldauer: 7 Minuten
Ein Spiel dauert **7 Minuten**. Ein Zeitstempel jenseits von `7:00` ist ein Fehler, kein
Ereignis. Bei 30-Sekunden-Häppchen sind das genau **14 Durchgänge**.

### Der Torwart ist nicht an seiner Position erkennbar
- Er darf den Strafraum verlassen und sich über das **ganze Feld** bewegen, auch über die
  Mittellinie.
- Er darf **selbst Tore schießen**.

Folgen für die Auswertung:
- **Wer der Torwart ist, muss in der Frage-Runde erfragt werden.** Nie aus der Position
  ableiten — ein Spieler in der gegnerischen Hälfte kann der Torwart sein.
- Die Tasten `save`, `gk_goal_against`, `gk_position_save`, `penalty_save` gelten **nur** für
  das ausdrücklich als Torwart benannte Tracklet.
- Ein `goal` kann vom Torwart kommen. Nicht als Fehler behandeln.

### Netzberührung = Aus → Spiel ist tot
Jede Berührung des Netzes (**Decke oder Seite**) gilt als Aus. Ab diesem Moment ist das Spiel
unterbrochen: **bis zur Fortsetzung keine Ereignisse erfassen.** Wer den Ball dann aufnimmt oder
weitergibt, macht keinen Pass und keinen Ballverlust. Das ist die häufigste Quelle für
Phantom-Ereignisse in der Halle.

### Spielfortsetzungen erkennen (= Anfang einer neuen Sequenz)
- **Anstoß:** vom Tor aus, Gegner muss in der eigenen Hälfte stehen
- **Seitenaus:** Ball wird eingerollt oder eingeschossen
- **Toraus:** Ecke oder Abstoß

Diese Momente markieren den Beginn einer Sequenz — nützlich, um totes Spiel von laufendem zu
trennen.

### Alle Freistöße sind indirekt
Ein **direktes** Freistoßtor ist nach diesen Regeln unmöglich. Wird eines "gesehen", ist die
Auswertung falsch — eine kostenlose Plausibilitätsprobe.

### Grätschen sind erlaubt
Eine saubere Grätsche ist ein **gewonnener Zweikampf** (`duel_won`), kein Foul. Nicht
verwerfen, nur weil der Spieler rutscht. Bestraft werden nur **harte** Fouls und übermäßiges
Einsteigen.

### Feldverweis: Rot gilt für das restliche Spiel
Bei hartem Foul bzw. übermäßigem Einsteigen wird der Spieler für das **restliche Spiel** vom
Feld verwiesen. Für das Tracking: Das Tracklet verschwindet **endgültig** und die Mannschaft
spielt in Unterzahl weiter. Nicht als Häppchen-Fehler deuten — als Hinweis in `offeneFragen`
melden (`"A4 ab 4:12 nicht mehr auf dem Feld — Feldverweis?"`).

### Tore von jeder Position
Tore dürfen von überall erzielt werden. Kein Schuss ist "zu weit weg", um zu zählen.

### Handspiel: entscheidet der Schiedsrichter
Jede Handberührung ist ein Foul und führt zu einem **indirekten Freistoß** — ob Hand vorlag,
**entscheidet der Schiedsrichter**, nicht die Bildanalyse. Bewertet wird nicht, ob es Hand war,
sondern nur die Folge: Spiel unterbrochen, keine Ereignisse bis zur Fortsetzung.

### Lücke im Katalog: Fouls und Karten werden NICHT getrackt
Die 21 Tasten aus Abschnitt 2 enthalten **kein** Foul, **kein** Handspiel und **keine** Gelb-/
Rote Karte. (`card` im Code ist der FIFA-**Kartenwert** eines Spielers, nicht eine Verwarnung.)

**Deshalb: niemals einen eigenen Schlüssel dafür erfinden.** Ein Foul erzeugt kein Ereignis. Was
davon sichtbar ist, gehört in `begruendung` oder `offeneFragen` — nie in `action`.

---

## 9. Betriebsregeln für den Auswerter

Erprobte Vorgaben, damit ein langer Lauf nicht auf halber Strecke wertlos wird.

### Ein Hilfs-Agent pro Häppchen
Jedes Häppchen wird von einem **eigenen Agenten mit leerem Kontext** ausgewertet (~120.000
Tokens, weit unter jeder Grenze). Die Hauptsitzung verteilt nur die Arbeit und sammelt die
Ergebnisse (~3.000–5.000 Tokens je Häppchen). So läuft der Kontext gar nicht erst voll, statt
ihn zu verwalten.

Preis dafür: Der Hilfs-Agent kann den Menschen **nicht** direkt fragen. Er schreibt seine Fragen
in `offeneFragen`, die Hauptsitzung reicht sie weiter.

### Ein Häppchen zählt ganz oder gar nicht
`state.json` wird **nie** direkt beschrieben. Der Agent schreibt `state.neu.json`, die erst nach
einer Prüfung übernommen wird:

- nur die 21 erlaubten Schlüssel, `delta` positiv
- Folge-Ereignisse vorhanden (Tor ⇒ Gegentor beim Keeper usw.)
- alles unter `konfidenz` 0,7 steht in `offeneFragen`
- keine Doppelzählung, keine Team-Widersprüche
- kein Tracklet und kein Event verschwunden, `letztesBild` springt nicht zurück

Erst wenn das durchläuft: alten Stand als **Snapshot** sichern, dann tauschen. Bricht ein
Durchgang ab (Kontext voll, Absturz, Mac zugeklappt), bleibt nur eine halbe `state.neu.json`
liegen — die wird gelöscht und das Häppchen ab `letztesBild` **komplett neu** gerechnet. Halb
gezählte Ereignisse gibt es damit nicht.

### Drei Anker an der Häppchen-Grenze statt Erinnerung
1. **Position:** Für jedes Tracklet steht die Stelle im letzten Bild in `state.json`. Jeder
   Durchgang startet mit **6 Bildern Überlappung** (2 s) — dort muss der Spieler dort stehen.
2. **Aussehen:** Vor dem ersten neuen Bild sieht der Agent die **Crops** aller Tracklets an. Er
   vergleicht Bild mit Bild, nicht Text mit Bild.
3. **Mensch:** Pro Häppchen kommt ein neuer Crop je Tracklet dazu. Die Frageliste zeigt sie als
   Reihe (`P4` bei 0:30, 1:00, 1:30) — ein Verrutschen ist in 20 Sekunden zu sehen.

Passen **Position und Aussehen nicht beide**, gibt es eine neue ID und eine Rückfrage.

### Reparierbar bleiben
Ein vertauschter Spieler erzeugt meist Widersprüche in der Team-Querprobe (z. B. angekommener
Pass zu einem früheren Gegenspieler) — dann lehnt die Prüfung die Übernahme ab. Fällt erst bei
Häppchen 6 auf, dass ID `P4` schon ab Häppchen 4 falsch ist, wird der **Snapshot** von dort
zurückgeholt und ab da neu gerechnet.

### Projektwissen gehört in Dateien, nicht ins Gedächtnis
Teams, Kader, Steckbriefe, beantwortete Rückfragen und getroffene Entscheidungen stehen in
Dateien (`state.json`, `ABLAUF.md`, Steckbrief-Datei) — **nie nur im Sitzungsgedächtnis.** Nach
einer Verdichtung wird weitergearbeitet, indem die Dateien gelesen werden und bei `letztesBild`
fortgesetzt wird. Was nur im Gedächtnis stand, ist verloren.

---

## 10. Pilot-Modus: Technik prüfen ohne echte Namen

Bevor ein Spiel mit echten Kadern ausgewertet wird, wird die **Maschinerie** getestet — ohne
dass die Spielernamen bekannt sein müssen.

### So läuft der Pilot
- Die Tracklets bekommen **sprechende Platzhalter** statt echter Namen — nach dem, was sichtbar
  ist: `Blau-1`, `Blau-2`, `Weiss-1`, `Schwarz-1`. Nicht `Spieler A`: der Platzhalter soll später
  nachvollziehbar machen, wen die KI gemeint hat.
- `aufloesungBasis: "pilot"` markiert diese Zuordnung. Die Datei ist damit **eindeutig als
  Testdatei erkennbar**.
- Die Team-Querprobe läuft normal mit: sie ist hier sogar der interessanteste Teil, weil sie
  Teams aus dem Spielverlauf herleitet statt aus der Trikotfarbe.

### Was der Pilot beweist
- Proxys lassen sich erzeugen, Bilder lesen, Ausschnitte schneiden
- Tracklets überleben die **Häppchen-Grenze** (der eigentliche Knackpunkt)
- `state.json`, Prüfung, Snapshot und Übernahme funktionieren
- die Frageliste rendert im Browser
- die **drei Messwerte**: Bilder, Dauer, Kontext

### Was der Pilot NICHT beweist
Ob die Namen stimmen — dafür fehlt die Wahrheit zum Vergleich. Das ist aber der **leichte** Teil:
Namen werden beantwortet, nicht erraten. Der schwere Teil — bleibt eine ID über Minuten hinweg
dieselbe Person — wird sehr wohl geprüft.

### Erfolgskriterium (ohne Namen prüfbar)
Die Crop-Reihe je Tracklet in der Frageliste anschauen: Ist `P4` bei 0:30, 1:00 und 1:30
**derselbe Mensch**? Dann trägt das Verfahren. Verrutscht eine ID, sieht man es dort sofort.

### Pilot-Daten kommen NICHT in die Datenbank
Platzhalter-Namen dürfen **nie** ins Statistics Center importiert werden — sie würden echte
Spielerstatistiken verfälschen. Die Pilot-Datei bleibt eine Datei und wird nur angeschaut.
