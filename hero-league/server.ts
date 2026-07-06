import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';

const app = express();
const PORT = 3000;

app.use(express.json());

const DB_PATH = path.join(process.cwd(), 'src', 'data', 'database.json');
const BACKUP_PATH = path.join(process.cwd(), 'src', 'data', 'database.backup.json');

// Ensure database file exists, or copy from a backup/initial state
if (!fs.existsSync(DB_PATH)) {
  const dir = path.dirname(DB_PATH);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  // If we have no file, let's initialize it with an empty structure (or it will be populated on first load)
  fs.writeFileSync(DB_PATH, JSON.stringify({ teams: [], matches: [] }, null, 2), 'utf8');
}

// Create a backup on boot if not already exists so we can reset season perfectly
if (fs.existsSync(DB_PATH) && !fs.existsSync(BACKUP_PATH)) {
  fs.copyFileSync(DB_PATH, BACKUP_PATH);
}

function readDb() {
  try {
    const data = fs.readFileSync(DB_PATH, 'utf8');
    return JSON.parse(data);
  } catch (error) {
    console.error("Error reading database file", error);
    return { teams: [], matches: [] };
  }
}

function writeDb(data: any) {
  try {
    fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), 'utf8');
  } catch (error) {
    console.error("Error writing database file", error);
  }
}

// HELPER: Standings logic
// Punkte verteilt (Sieg=3, Unentschieden=1, Niederlage=0).
// Die Tordifferenz berechnet.
// Die Tabelle nach Punkten und Tordifferenz sortiert.
function calculateStandings(teams: any[], matches: any[]) {
  const standingsMap: Record<string, any> = {};

  teams.forEach(t => {
    standingsMap[t.id] = {
      teamId: t.id,
      teamName: t.name,
      shortName: t.shortName,
      logoColor: t.logoColor || "#3B82F6",
      logoIcon: t.logoIcon || "⚽",
      logoUrl: t.logoUrl || "",
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      goalsFor: 0,
      goalsAgainst: 0,
      goalDifference: 0,
      points: 0,
      form: []
    };
  });

  // Calculate form based on completed matches in chronological order
  const sortedCompletedMatches = [...matches]
    .filter(m => m.status === 'beendet')
    .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime());

  sortedCompletedMatches.forEach(m => {
    const h = standingsMap[m.homeTeamId];
    const a = standingsMap[m.awayTeamId];

    if (h && a && m.homeScore !== null && m.awayScore !== null) {
      h.played += 1;
      a.played += 1;

      h.goalsFor += m.homeScore;
      h.goalsAgainst += m.awayScore;
      a.goalsFor += m.awayScore;
      a.goalsAgainst += m.homeScore;

      if (m.homeScore > m.awayScore) {
        h.won += 1;
        h.points += 3;
        h.form.push('W');

        a.lost += 1;
        a.form.push('L');
      } else if (m.homeScore < m.awayScore) {
        a.won += 1;
        a.points += 3;
        a.form.push('W');

        h.lost += 1;
        h.form.push('L');
      } else {
        h.drawn += 1;
        h.points += 1;
        h.form.push('D');

        a.drawn += 1;
        a.points += 1;
        a.form.push('D');
      }
    }
  });

  const standings = Object.values(standingsMap).map((s: any) => {
    s.goalDifference = s.goalsFor - s.goalsAgainst;
    s.form = s.form.slice(-5);
    return s;
  });

  // Sort:
  // 1. Points (descending)
  // 2. Goal Difference (descending)
  // 3. Goals For (descending)
  // 4. Team Name (alphabetical ascending)
  standings.sort((a: any, b: any) => {
    if (b.points !== a.points) return b.points - a.points;
    if (b.goalDifference !== a.goalDifference) return b.goalDifference - a.goalDifference;
    if (b.goalsFor !== a.goalsFor) return b.goalsFor - a.goalsFor;
    return a.teamName.localeCompare(b.teamName);
  });

  return standings;
}

// API ROUTES

// 1. Get all teams
app.get('/api/teams', (req, res) => {
  const db = readDb();
  res.json(db.teams);
});

// 2. Add team
app.post('/api/teams', (req, res) => {
  const { name, shortName, logoColor, logoIcon, logoUrl, spielerliste } = req.body;
  const db = readDb();
  
  if (!name || !shortName) {
    return res.status(400).json({ error: "Name and shortName are required" });
  }

  const newTeam = {
    id: `team_${Date.now()}`,
    name,
    shortName,
    logoColor: logoColor || "#3B82F6",
    logoIcon: logoIcon || "⚽",
    logoUrl: logoUrl || "",
    spielerliste: spielerliste || []
  };

  db.teams.push(newTeam);

  // Automatically schedule 2 games for the new team against random existing opponents
  const lastMatch = db.matches[db.matches.length - 1];
  const baseDate = lastMatch ? new Date(lastMatch.date) : new Date();
  const opponents = [...db.teams].filter(t => t.id !== newTeam.id).sort(() => 0.5 - Math.random()).slice(0, 2);

  opponents.forEach((opp, idx) => {
    db.matches.push({
      id: `m-custom-${Date.now()}-${idx}`,
      matchday: 5,
      homeTeamId: newTeam.id,
      awayTeamId: opp.id,
      homeScore: null,
      awayScore: null,
      status: 'geplant',
      date: new Date(baseDate.getTime() + 7 * (idx + 1) * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
      time: '15:30'
    });
  });

  writeDb(db);
  res.json(newTeam);
});

// 3. Edit team (names and player lists / squads)
app.put('/api/teams/:id', (req, res) => {
  const { id } = req.params;
  const { name, shortName, logoUrl, spielerliste } = req.body;
  const db = readDb();

  const teamIdx = db.teams.findIndex((t: any) => t.id === id);
  if (teamIdx === -1) {
    return res.status(404).json({ error: "Team not found" });
  }

  const team = db.teams[teamIdx];
  if (name !== undefined) team.name = name;
  if (shortName !== undefined) team.shortName = shortName;
  if (logoUrl !== undefined) team.logoUrl = logoUrl;
  if (spielerliste !== undefined) team.spielerliste = spielerliste;

  writeDb(db);
  res.json(team);
});

// 4. Get all matches
app.get('/api/matches', (req, res) => {
  const db = readDb();
  res.json(db.matches);
});

// 5. Update match score, scores, status (geplant, live, beendet)
app.put('/api/matches/:id', (req, res) => {
  const { id } = req.params;
  const { homeScore, awayScore, status } = req.body;
  const db = readDb();

  const matchIdx = db.matches.findIndex((m: any) => m.id === id);
  if (matchIdx === -1) {
    return res.status(404).json({ error: "Match not found" });
  }

  const match = db.matches[matchIdx];
  
  if (homeScore !== undefined) match.homeScore = homeScore === null ? null : Number(homeScore);
  if (awayScore !== undefined) match.awayScore = awayScore === null ? null : Number(awayScore);
  if (status !== undefined) match.status = status;

  writeDb(db);
  res.json(match);
});

// 6. Get standings (calculated on the fly using the backend points logic)
app.get('/api/standings', (req, res) => {
  const db = readDb();
  const standings = calculateStandings(db.teams, db.matches);
  res.json(standings);
});

// 6b. Get all players
app.get('/api/players', (req, res) => {
  const db = readDb();
  res.json(db.players || []);
});

// 6c. Update players
app.put('/api/players', (req, res) => {
  const { players } = req.body;
  const db = readDb();
  db.players = players;
  writeDb(db);
  res.json(db.players);
});

// 7. Simulate specific matchday
app.post('/api/matches/simulate-day', (req, res) => {
  const { matchday } = req.body;
  const db = readDb();
  const weights = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5];

  db.matches.forEach((m: any) => {
    if (m.matchday === Number(matchday) && m.status !== 'beendet') {
      m.homeScore = weights[Math.floor(Math.random() * weights.length)];
      m.awayScore = weights[Math.floor(Math.random() * weights.length)];
      m.status = 'beendet';
    }
  });

  writeDb(db);
  res.json({ success: true, matches: db.matches });
});

// 8. Simulate all remaining unplayed matches
app.post('/api/matches/simulate-remaining', (req, res) => {
  const db = readDb();
  const weights = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5];

  db.matches.forEach((m: any) => {
    if (m.status !== 'beendet') {
      m.homeScore = weights[Math.floor(Math.random() * weights.length)];
      m.awayScore = weights[Math.floor(Math.random() * weights.length)];
      m.status = 'beendet';
    }
  });

  writeDb(db);
  res.json({ success: true, matches: db.matches });
});

// 9. Reset season to default
app.post('/api/reset', (req, res) => {
  if (fs.existsSync(BACKUP_PATH)) {
    fs.copyFileSync(BACKUP_PATH, DB_PATH);
  }
  const db = readDb();
  res.json({ success: true, teams: db.teams, matches: db.matches });
});

// VITE MIDDLEWARE & STATIC ASSET HANDLER
async function startServer() {
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on port ${PORT}`);
  });
}

startServer();
