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
2. Verankert wird an dem, was **von hinten und in Bewegung** sichtbar ist — in dieser
   Reihenfolge der Verlässlichkeit: **Schuhfarbe → Stutzen/Socken → Haare/Frisur → Statur**.
   *Nicht* am Gesicht, *nicht* an der Nummer.
3. Ereignisse hängen **an der Clip-ID**, nicht am Namen.
4. Sobald die Nummer **einmal** lesbar ist, wird die Clip-ID aufgelöst — und **alle früheren
   Ereignisse dieser ID gelten rückwirkend** für diesen Spieler. Ein guter Blick pro Spieler
   pro Clip genügt.
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
- `aufloesungBasis` — `"nummer"` (Nummer gelesen), `"mensch"` (nachträglich bestätigt),
  `"merkmal"` (nur über Steckbrief — dann Konfidenz ≤ 0.7 setzen).
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

## 5. Der Weg der Datei

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

## 6. Kurzanweisung für Sitzung A (kopierfertig)

> Du wertest ein Hero-League-Spiel (Kleinfeld/Halle, kein Abseits) aus Einzelbildern aus.
> Halte dich **exakt** an `docs/tracking-uebergabe.md`: anonyme Tracklets (A1…/B1…) statt Namen,
> Verankerung über Schuhfarbe/Stutzen/Haare/Statur, Nummern rückwirkend auflösen, nur die 21
> erlaubten `action`-Schlüssel, `delta` immer positiv, automatische Fußball-Logik anwenden,
> nichts erfinden, alles Unklare unter `konfidenz < 0.7` in `offeneFragen`.
> Ergebnis: **eine** JSON-Datei in genau dem dokumentierten Aufbau.
