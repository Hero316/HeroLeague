import express from 'express';
import path from 'path';
import fs from 'fs';
import { createServer as createViteServer } from 'vite';
import { initializeApp, getApps } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import { getStorage } from 'firebase-admin/storage';

const app = express();
const PORT = 3000;

app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Read Firebase Config
const configPath = path.join(process.cwd(), 'firebase-applet-config.json');
let firebaseConfig: any = null;
if (fs.existsSync(configPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  } catch (err) {
    console.error("Failed to read firebase config file", err);
  }
}

if (firebaseConfig && !getApps().length) {
  try {
    initializeApp({
      projectId: firebaseConfig.projectId,
      storageBucket: firebaseConfig.storageBucket,
    });
    console.log("Firebase Admin successfully initialized on server");
  } catch (err) {
    console.error("Firebase Admin initialization failed:", err);
  }
}

const firestoreDb = firebaseConfig?.firestoreDatabaseId 
  ? getFirestore(firebaseConfig.firestoreDatabaseId)
  : getFirestore();

let useFirestore = false;

// Serve uploads statically
const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');
if (!fs.existsSync(UPLOADS_DIR)) {
  fs.mkdirSync(UPLOADS_DIR, { recursive: true });
}
app.use('/uploads', express.static(UPLOADS_DIR));

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

// Seed Firestore from local database on startup if empty
async function initFirestoreAndSeed() {
  if (!firebaseConfig) return;
  try {
    const teamsSnap = await firestoreDb.collection('teams').limit(1).get();
    useFirestore = true;
    console.log("Firestore connection test passed. Remote database mode enabled.");
    if (teamsSnap.empty) {
      console.log("Firestore collection 'teams' is empty. Seeding from local database...");
      const localDb = readDb();
      
      // Seed teams
      for (const team of localDb.teams) {
        await firestoreDb.collection('teams').doc(team.id).set(team);
      }
      
      // Seed matches
      for (const match of localDb.matches) {
        await firestoreDb.collection('matches').doc(match.id).set(match);
      }
      
      // Seed playerOfMonth
      const pom = localDb.playerOfMonth || {
        name: "Florian Wirtz",
        club: "Bayer Leverkusen",
        goals: 4,
        assists: 5,
        image: ""
      };
      await firestoreDb.collection('settings').doc('playerOfMonth').set(pom);
      
      console.log("Firestore successfully seeded!");
    } else {
      console.log("Firestore already populated. Using existing collections.");
    }
  } catch (err) {
    console.error("Error during Firestore seeding, disabling Firestore and falling back to local JSON:", err);
    firebaseConfig = null;
  }
}

initFirestoreAndSeed();

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

// 0a. File Upload API
app.post('/api/upload', async (req, res) => {
  try {
    const fileData = req.body.file || req.body.image;
    const filename = req.body.filename || 'upload.png';
    
    if (!fileData) {
      return res.status(400).json({ error: "Keine Datei-Daten empfangen." });
    }

    // Extract base64 format and data
    const matches = fileData.match(/^data:([A-Za-z-+\/]+);base64,(.+)$/);
    if (!matches || matches.length !== 3) {
      if (fileData.startsWith('/') || fileData.startsWith('http')) {
        return res.json({ url: fileData });
      }
      return res.status(400).json({ error: "Ungültiges Base64-Format." });
    }

    const mimeType = matches[1];
    const imageBuffer = Buffer.from(matches[2], 'base64');
    const extension = filename ? path.extname(filename) : '.png';
    const uniqueName = `upload-${Date.now()}-${Math.floor(Math.random() * 10000)}${extension}`;
    const filePath = `uploads/${uniqueName}`;

    // Upload to Firebase Storage if configured
    if (firebaseConfig) {
      try {
        const bucket = getStorage().bucket();
        const fileRef = bucket.file(filePath);
        await fileRef.save(imageBuffer, {
          metadata: { contentType: mimeType },
          public: true,
        });
        
        // Return public GCS / Firebase Storage URL
        const fileUrl = `https://storage.googleapis.com/${bucket.name}/${filePath}`;
        console.log(`Successfully uploaded ${uniqueName} to Firebase Storage: ${fileUrl}`);
        return res.json({ url: fileUrl });
      } catch (storageErr) {
        console.error("Firebase Storage upload failed, trying local fallback", storageErr);
      }
    }

    // Local fallback if Firebase Storage is not initialized or fails
    const publicUploadsDir = path.join(process.cwd(), 'public', 'uploads');
    if (!fs.existsSync(publicUploadsDir)) {
      fs.mkdirSync(publicUploadsDir, { recursive: true });
    }
    const localFilePath = path.join(publicUploadsDir, uniqueName);
    fs.writeFileSync(localFilePath, imageBuffer);
    return res.json({ url: `/uploads/${uniqueName}` });

  } catch (err: any) {
    console.error("Image upload failed completely", err);
    res.status(500).json({ error: "Upload-Fehler: " + err.message });
  }
});

// 0b. Player of the Month API
app.get('/api/player-of-the-month', async (req, res) => {
  try {
    if (firebaseConfig) {
      const doc = await firestoreDb.collection('settings').doc('playerOfMonth').get();
      if (doc.exists) {
        return res.json(doc.data());
      }
    }
    const db = readDb();
    res.json(db.playerOfMonth || {
      name: "Florian Wirtz",
      club: "Bayer Leverkusen",
      goals: 4,
      assists: 5,
      image: ""
    });
  } catch (err) {
    console.error("Error reading POM from Firestore:", err);
    res.status(500).json({ error: "Fehler beim Laden" });
  }
});

app.post('/api/player-of-the-month', async (req, res) => {
  try {
    const { name, club, goals, assists, image } = req.body;
    const pom = {
      name: name || "",
      club: club || "",
      goals: goals !== undefined ? Number(goals) : 0,
      assists: assists !== undefined ? Number(assists) : 0,
      image: image || ""
    };
    if (firebaseConfig) {
      await firestoreDb.collection('settings').doc('playerOfMonth').set(pom);
    }
    // Sync local json as secondary fallback
    const db = readDb();
    db.playerOfMonth = pom;
    writeDb(db);
    res.json(pom);
  } catch (err) {
    console.error("Error writing POM to Firestore:", err);
    res.status(500).json({ error: "Fehler beim Speichern" });
  }
});

// 1. Get all teams
app.get('/api/teams', async (req, res) => {
  try {
    if (firebaseConfig) {
      const snap = await firestoreDb.collection('teams').get();
      const teams = snap.docs.map(doc => doc.data());
      return res.json(teams);
    }
    const db = readDb();
    res.json(db.teams);
  } catch (err) {
    console.error("Error loading teams from Firestore:", err);
    res.status(500).json({ error: "Fehler beim Laden" });
  }
});

// 2. Add team
app.post('/api/teams', async (req, res) => {
  try {
    const { name, shortName, logoColor, logoIcon, logoUrl, spielerliste } = req.body;
    if (!name || !shortName) {
      return res.status(400).json({ error: "Name and shortName are required" });
    }

    const id = `team_${Date.now()}`;
    const newTeam = {
      id,
      name,
      shortName,
      logoColor: logoColor || "#3B82F6",
      logoIcon: logoIcon || "⚽",
      logoUrl: logoUrl || "",
      spielerliste: spielerliste || []
    };

    // Load current teams/matches for scheduling
    let currentTeams = [];
    let currentMatches = [];
    if (firebaseConfig) {
      const teamsSnap = await firestoreDb.collection('teams').get();
      currentTeams = teamsSnap.docs.map(d => d.data());
      const matchesSnap = await firestoreDb.collection('matches').get();
      currentMatches = matchesSnap.docs.map(d => d.data());
    } else {
      const db = readDb();
      currentTeams = db.teams;
      currentMatches = db.matches;
    }

    const lastMatch = currentMatches[currentMatches.length - 1];
    const baseDate = lastMatch ? new Date(lastMatch.date) : new Date();
    const opponents = [...currentTeams].filter(t => t.id !== newTeam.id).sort(() => 0.5 - Math.random()).slice(0, 2);

    const scheduledMatches: any[] = [];
    opponents.forEach((opp, idx) => {
      scheduledMatches.push({
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

    if (firebaseConfig) {
      await firestoreDb.collection('teams').doc(newTeam.id).set(newTeam);
      const batch = firestoreDb.batch();
      scheduledMatches.forEach(m => {
        batch.set(firestoreDb.collection('matches').doc(m.id), m);
      });
      await batch.commit();
    }

    // Update local database backup
    const db = readDb();
    db.teams.push(newTeam);
    db.matches.push(...scheduledMatches);
    writeDb(db);

    res.json(newTeam);
  } catch (err) {
    console.error("Error adding team to Firestore:", err);
    res.status(500).json({ error: "Fehler beim Hinzufügen des Teams" });
  }
});

// 3. Edit team (names and player lists / squads)
app.put('/api/teams/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { name, shortName, logoUrl, logoColor, spielerliste } = req.body;

    const updateData: any = {};
    if (name !== undefined) updateData.name = name;
    if (shortName !== undefined) updateData.shortName = shortName;
    if (logoUrl !== undefined) updateData.logoUrl = logoUrl;
    if (logoColor !== undefined) updateData.logoColor = logoColor;
    if (spielerliste !== undefined) updateData.spielerliste = spielerliste;

    if (firebaseConfig) {
      await firestoreDb.collection('teams').doc(id).update(updateData);
    }

    const db = readDb();
    const teamIdx = db.teams.findIndex((t: any) => t.id === id);
    if (teamIdx !== -1) {
      const team = db.teams[teamIdx];
      if (name !== undefined) team.name = name;
      if (shortName !== undefined) team.shortName = shortName;
      if (logoUrl !== undefined) team.logoUrl = logoUrl;
      if (logoColor !== undefined) team.logoColor = logoColor;
      if (spielerliste !== undefined) team.spielerliste = spielerliste;
      writeDb(db);
      res.json(team);
    } else {
      if (firebaseConfig) {
        const doc = await firestoreDb.collection('teams').doc(id).get();
        if (doc.exists) {
          return res.json(doc.data());
        }
      }
      res.status(404).json({ error: "Team nicht gefunden." });
    }
  } catch (err) {
    console.error("Error editing team in Firestore:", err);
    res.status(500).json({ error: "Fehler beim Bearbeiten" });
  }
});

// 4. Get all matches
app.get('/api/matches', async (req, res) => {
  try {
    if (firebaseConfig) {
      const snap = await firestoreDb.collection('matches').get();
      const matches = snap.docs.map(doc => doc.data());
      return res.json(matches);
    }
    const db = readDb();
    res.json(db.matches);
  } catch (err) {
    console.error("Error loading matches from Firestore:", err);
    res.status(500).json({ error: "Fehler beim Laden" });
  }
});

// 5. Update match score, scores, status (geplant, live, beendet)
app.put('/api/matches/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { homeScore, awayScore, status, scorers } = req.body;

    const updateData: any = {};
    if (homeScore !== undefined) updateData.homeScore = homeScore === null ? null : Number(homeScore);
    if (awayScore !== undefined) updateData.awayScore = awayScore === null ? null : Number(awayScore);
    if (status !== undefined) {
      updateData.status = status;
      if (status === 'live') {
        updateData.liveStartedAt = new Date().toISOString();
      } else {
        updateData.liveStartedAt = FieldValue.delete();
      }
    }
    if (scorers !== undefined) updateData.scorers = scorers;

    if (firebaseConfig) {
      await firestoreDb.collection('matches').doc(id).update(updateData);
    }

    // Sync local JSON
    const db = readDb();
    const matchIdx = db.matches.findIndex((m: any) => m.id === id);
    if (matchIdx !== -1) {
      const match = db.matches[matchIdx];
      if (homeScore !== undefined) match.homeScore = homeScore === null ? null : Number(homeScore);
      if (awayScore !== undefined) match.awayScore = awayScore === null ? null : Number(awayScore);
      if (status !== undefined) {
        match.status = status;
        if (status === 'live') {
          if (!match.liveStartedAt) {
            match.liveStartedAt = new Date().toISOString();
          }
        } else {
          delete match.liveStartedAt;
        }
      }
      if (scorers !== undefined) match.scorers = scorers;
      writeDb(db);
      res.json(match);
    } else {
      if (firebaseConfig) {
        const doc = await firestoreDb.collection('matches').doc(id).get();
        if (doc.exists) {
          return res.json(doc.data());
        }
      }
      res.status(404).json({ error: "Spiel nicht gefunden." });
    }
  } catch (err) {
    console.error("Error updating match in Firestore:", err);
    res.status(500).json({ error: "Fehler beim Aktualisieren" });
  }
});

// 6. Get standings (calculated on the fly using the backend points logic)
app.get('/api/standings', async (req, res) => {
  try {
    let teams = [];
    let matches = [];
    if (firebaseConfig) {
      const teamsSnap = await firestoreDb.collection('teams').get();
      teams = teamsSnap.docs.map(doc => doc.data());
      const matchesSnap = await firestoreDb.collection('matches').get();
      matches = matchesSnap.docs.map(doc => doc.data());
    } else {
      const db = readDb();
      teams = db.teams;
      matches = db.matches;
    }
    const standings = calculateStandings(teams, matches);
    res.json(standings);
  } catch (err) {
    console.error("Error calculating standings:", err);
    res.status(500).json({ error: "Fehler beim Laden" });
  }
});

// 6b. Get all players dynamically computed from matches and teams to guarantee consistency
app.get('/api/players', async (req, res) => {
  try {
    let teams = [];
    let matches = [];
    if (firebaseConfig) {
      const teamsSnap = await firestoreDb.collection('teams').get();
      teams = teamsSnap.docs.map(doc => doc.data());
      const matchesSnap = await firestoreDb.collection('matches').get();
      matches = matchesSnap.docs.map(doc => doc.data());
    } else {
      const db = readDb();
      teams = db.teams;
      matches = db.matches;
    }

    const playerMap: { [name: string]: { id: string; name: string; teamName: string; teamLogoColor: string; goals: number; assists: number; matchesPlayed: number } } = {};

    // Initialize with team rosters
    teams.forEach((t: any) => {
      if (t.spielerliste) {
        t.spielerliste.forEach((playerName: string) => {
          if (!playerMap[playerName]) {
            playerMap[playerName] = {
              id: `p-${t.id}-${playerName.replace(/\s+/g, '-')}`,
              name: playerName,
              teamName: t.name,
              teamLogoColor: t.logoColor || '#3B82F6',
              goals: 0,
              assists: 0,
              matchesPlayed: 0
            };
          }
        });
      }
    });

    // Calculate stats from completed matches
    matches.forEach((m: any) => {
      const isCompleted = m.status === 'beendet' || m.isCompleted;
      if (isCompleted && m.scorers) {
        const homeTeam = teams.find((t: any) => t.id === m.homeTeamId);
        const awayTeam = teams.find((t: any) => t.id === m.awayTeamId);

        m.scorers.forEach((s: any) => {
          const scorerName = s.playerName;
          const teamId = s.teamId;
          const assistName = s.assistName;

          const team = teams.find((t: any) => t.id === teamId);
          const teamName = team ? team.name : 'Unbekannt';
          const teamLogoColor = team ? team.logoColor || '#3B82F6' : '#3B82F6';

          // Goals
          if (scorerName && scorerName !== 'Eigentor' && scorerName !== 'Unbekannt') {
            if (!playerMap[scorerName]) {
              playerMap[scorerName] = {
                id: `p-dyn-${scorerName.replace(/\s+/g, '-')}`,
                name: scorerName,
                teamName,
                teamLogoColor,
                goals: 0,
                assists: 0,
                matchesPlayed: 0
              };
            }
            playerMap[scorerName].goals += 1;
          }

          // Assists
          if (assistName && assistName !== 'Unbekannt' && assistName !== '') {
            if (!playerMap[assistName]) {
              playerMap[assistName] = {
                id: `p-dyn-${assistName.replace(/\s+/g, '-')}`,
                name: assistName,
                teamName,
                teamLogoColor,
                goals: 0,
                assists: 0,
                matchesPlayed: 0
              };
            }
            playerMap[assistName].assists += 1;
          }
        });

        // Increment matchesPlayed for all squad players of both teams when a match is played
        if (homeTeam && homeTeam.spielerliste) {
          homeTeam.spielerliste.forEach((playerName: string) => {
            if (playerMap[playerName]) {
              playerMap[playerName].matchesPlayed += 1;
            }
          });
        }
        if (awayTeam && awayTeam.spielerliste) {
          awayTeam.spielerliste.forEach((playerName: string) => {
            if (playerMap[playerName]) {
              playerMap[playerName].matchesPlayed += 1;
            }
          });
        }
      }
    });

    const playersList = Object.values(playerMap);
    res.json(playersList);
  } catch (err) {
    console.error("Error loading players:", err);
    res.status(500).json({ error: "Fehler beim Laden" });
  }
});

// 6c. Update players (kept for frontend API compatibility)
app.put('/api/players', async (req, res) => {
  const { players } = req.body;
  const db = readDb();
  db.players = players;
  writeDb(db);
  res.json(db.players || []);
});

// 7. Simulate specific matchday
app.post('/api/matches/simulate-day', async (req, res) => {
  try {
    const { matchday } = req.body;
    const weights = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5];

    let teams = [];
    let matches = [];
    if (firebaseConfig) {
      const teamsSnap = await firestoreDb.collection('teams').get();
      teams = teamsSnap.docs.map(doc => doc.data());
      const matchesSnap = await firestoreDb.collection('matches').get();
      matches = matchesSnap.docs.map(doc => doc.data());
    } else {
      const db = readDb();
      teams = db.teams;
      matches = db.matches;
    }

    const updatedMatches: any[] = [];
    matches.forEach((m: any) => {
      if (m.matchday === Number(matchday) && m.status !== 'beendet') {
        const hScore = weights[Math.floor(Math.random() * weights.length)];
        const aScore = weights[Math.floor(Math.random() * weights.length)];
        m.homeScore = hScore;
        m.awayScore = aScore;
        m.status = 'beendet';

        const scorers: any[] = [];
        const homeTeam = teams.find((t: any) => t.id === m.homeTeamId);
        const awayTeam = teams.find((t: any) => t.id === m.awayTeamId);
        
        if (hScore > 0 && homeTeam && homeTeam.spielerliste && homeTeam.spielerliste.length > 0) {
          for (let i = 0; i < hScore; i++) {
            const player = homeTeam.spielerliste[Math.floor(Math.random() * homeTeam.spielerliste.length)];
            let assistName = "";
            if (Math.random() < 0.7 && homeTeam.spielerliste.length > 1) {
              const potentialAssisters = homeTeam.spielerliste.filter((p: string) => p !== player);
              assistName = potentialAssisters[Math.floor(Math.random() * potentialAssisters.length)];
            }
            scorers.push({ playerName: player, teamId: m.homeTeamId, assistName });
          }
        }
        if (aScore > 0 && awayTeam && awayTeam.spielerliste && awayTeam.spielerliste.length > 0) {
          for (let i = 0; i < aScore; i++) {
            const player = awayTeam.spielerliste[Math.floor(Math.random() * awayTeam.spielerliste.length)];
            let assistName = "";
            if (Math.random() < 0.7 && awayTeam.spielerliste.length > 1) {
              const potentialAssisters = awayTeam.spielerliste.filter((p: string) => p !== player);
              assistName = potentialAssisters[Math.floor(Math.random() * potentialAssisters.length)];
            }
            scorers.push({ playerName: player, teamId: m.awayTeamId, assistName });
          }
        }
        m.scorers = scorers;
        updatedMatches.push(m);
      }
    });

    if (firebaseConfig) {
      const batch = firestoreDb.batch();
      updatedMatches.forEach(m => {
        batch.set(firestoreDb.collection('matches').doc(m.id), m);
      });
      await batch.commit();
    }

    // Sync local JSON
    const db = readDb();
    db.matches.forEach((m: any) => {
      const matchUpdate = updatedMatches.find(up => up.id === m.id);
      if (matchUpdate) {
        m.homeScore = matchUpdate.homeScore;
        m.awayScore = matchUpdate.awayScore;
        m.status = matchUpdate.status;
        m.scorers = matchUpdate.scorers;
      }
    });
    writeDb(db);

    res.json({ success: true, matches: db.matches });
  } catch (err) {
    console.error("Simulation error:", err);
    res.status(500).json({ error: "Fehler beim Simulieren" });
  }
});

// 8. Simulate all remaining unplayed matches
app.post('/api/matches/simulate-remaining', async (req, res) => {
  try {
    const weights = [0, 0, 1, 1, 1, 2, 2, 2, 3, 3, 4, 5];

    let teams = [];
    let matches = [];
    if (firebaseConfig) {
      const teamsSnap = await firestoreDb.collection('teams').get();
      teams = teamsSnap.docs.map(doc => doc.data());
      const matchesSnap = await firestoreDb.collection('matches').get();
      matches = matchesSnap.docs.map(doc => doc.data());
    } else {
      const db = readDb();
      teams = db.teams;
      matches = db.matches;
    }

    const updatedMatches: any[] = [];
    matches.forEach((m: any) => {
      if (m.status !== 'beendet') {
        const hScore = weights[Math.floor(Math.random() * weights.length)];
        const aScore = weights[Math.floor(Math.random() * weights.length)];
        m.homeScore = hScore;
        m.awayScore = aScore;
        m.status = 'beendet';

        const scorers: any[] = [];
        const homeTeam = teams.find((t: any) => t.id === m.homeTeamId);
        const awayTeam = teams.find((t: any) => t.id === m.awayTeamId);
        
        if (hScore > 0 && homeTeam && homeTeam.spielerliste && homeTeam.spielerliste.length > 0) {
          for (let i = 0; i < hScore; i++) {
            const player = homeTeam.spielerliste[Math.floor(Math.random() * homeTeam.spielerliste.length)];
            let assistName = "";
            if (Math.random() < 0.7 && homeTeam.spielerliste.length > 1) {
              const potentialAssisters = homeTeam.spielerliste.filter((p: string) => p !== player);
              assistName = potentialAssisters[Math.floor(Math.random() * potentialAssisters.length)];
            }
            scorers.push({ playerName: player, teamId: m.homeTeamId, assistName });
          }
        }
        if (aScore > 0 && awayTeam && awayTeam.spielerliste && awayTeam.spielerliste.length > 0) {
          for (let i = 0; i < aScore; i++) {
            const player = awayTeam.spielerliste[Math.floor(Math.random() * awayTeam.spielerliste.length)];
            let assistName = "";
            if (Math.random() < 0.7 && awayTeam.spielerliste.length > 1) {
              const potentialAssisters = awayTeam.spielerliste.filter((p: string) => p !== player);
              assistName = potentialAssisters[Math.floor(Math.random() * potentialAssisters.length)];
            }
            scorers.push({ playerName: player, teamId: m.awayTeamId, assistName });
          }
        }
        m.scorers = scorers;
        updatedMatches.push(m);
      }
    });

    if (firebaseConfig) {
      const batch = firestoreDb.batch();
      updatedMatches.forEach(m => {
        batch.set(firestoreDb.collection('matches').doc(m.id), m);
      });
      await batch.commit();
    }

    // Sync local JSON
    const db = readDb();
    db.matches.forEach((m: any) => {
      const matchUpdate = updatedMatches.find(up => up.id === m.id);
      if (matchUpdate) {
        m.homeScore = matchUpdate.homeScore;
        m.awayScore = matchUpdate.awayScore;
        m.status = matchUpdate.status;
        m.scorers = matchUpdate.scorers;
      }
    });
    writeDb(db);

    res.json({ success: true, matches: db.matches });
  } catch (err) {
    console.error("Simulation error:", err);
    res.status(500).json({ error: "Fehler beim Simulieren der restlichen Spiele" });
  }
});

// 9. Reset season to default
app.post('/api/reset', async (req, res) => {
  try {
    if (fs.existsSync(BACKUP_PATH)) {
      fs.copyFileSync(BACKUP_PATH, DB_PATH);
    }
    const db = readDb();

    if (firebaseConfig) {
      // Reset all teams in Firestore
      const teamsSnap = await firestoreDb.collection('teams').get();
      const teamsBatch = firestoreDb.batch();
      teamsSnap.docs.forEach(doc => {
        const matchedBackup = db.teams.find((t: any) => t.id === doc.id);
        if (matchedBackup) {
          teamsBatch.set(doc.ref, matchedBackup);
        } else {
          teamsBatch.delete(doc.ref);
        }
      });
      db.teams.forEach((t: any) => {
        const docRef = firestoreDb.collection('teams').doc(t.id);
        teamsBatch.set(docRef, t);
      });
      await teamsBatch.commit();

      // Reset all matches in Firestore
      const matchesSnap = await firestoreDb.collection('matches').get();
      const matchesBatch = firestoreDb.batch();
      matchesSnap.docs.forEach(doc => {
        const matchedBackup = db.matches.find((m: any) => m.id === doc.id);
        if (matchedBackup) {
          matchesBatch.set(doc.ref, matchedBackup);
        } else {
          matchesBatch.delete(doc.ref);
        }
      });
      db.matches.forEach((m: any) => {
        const docRef = firestoreDb.collection('matches').doc(m.id);
        matchesBatch.set(docRef, m);
      });
      await matchesBatch.commit();

      // Reset player of the month
      const defaultPom = {
        name: "Florian Wirtz",
        club: "Bayer Leverkusen",
        goals: 4,
        assists: 5,
        image: ""
      };
      await firestoreDb.collection('settings').doc('playerOfMonth').set(defaultPom);
    }

    res.json({ success: true, teams: db.teams, matches: db.matches });
  } catch (err) {
    console.error("Reset error:", err);
    res.status(500).json({ error: "Fehler beim Zurücksetzen der Saison" });
  }
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
