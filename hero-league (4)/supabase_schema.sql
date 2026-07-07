-- Supabase (PostgreSQL) Database Schema
-- Hero League Pro Football Platform

-- 1. Enable UUID Extension if needed
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- 2. Create TEAMS Table
CREATE TABLE IF NOT EXISTS teams (
    id VARCHAR(50) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    name VARCHAR(255) NOT NULL,
    short_name VARCHAR(10) NOT NULL,
    logo_color VARCHAR(50) DEFAULT '#3B82F6', -- Accent color for fallback
    logo_icon VARCHAR(50) DEFAULT '⚽', -- Emoji fallback
    logo_url VARCHAR(1024), -- Real logo URL
    spielerliste JSONB NOT NULL DEFAULT '[]'::jsonb, -- Array of player names or player objects
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 3. Create MATCHES Table
CREATE TABLE IF NOT EXISTS matches (
    id VARCHAR(50) PRIMARY KEY DEFAULT uuid_generate_v4()::text,
    matchday INTEGER NOT NULL,
    home_team_id VARCHAR(50) REFERENCES teams(id) ON DELETE CASCADE,
    away_team_id VARCHAR(50) REFERENCES teams(id) ON DELETE CASCADE,
    home_score INTEGER DEFAULT NULL, -- NULL means not played yet
    away_score INTEGER DEFAULT NULL, -- NULL means not played yet
    status VARCHAR(20) NOT NULL DEFAULT 'geplant' CHECK (status IN ('geplant', 'live', 'beendet')),
    date DATE NOT NULL,
    time VARCHAR(10) NOT NULL, -- e.g., "15:30"
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 4. Create Indexing for Performance
CREATE INDEX IF NOT EXISTS idx_matches_status ON matches(status);
CREATE INDEX IF NOT EXISTS idx_matches_matchday ON matches(matchday);
CREATE INDEX IF NOT EXISTS idx_teams_name ON teams(name);

-- 5. Row Level Security (RLS) Configuration (Idiomatic for Supabase)
ALTER TABLE teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE matches ENABLE ROW LEVEL SECURITY;

-- Anonymous users (public) can read everything
CREATE POLICY "Allow public read access on teams" ON teams 
    FOR SELECT USING (true);

CREATE POLICY "Allow public read access on matches" ON matches 
    FOR SELECT USING (true);

-- Only authenticated admins can modify data
CREATE POLICY "Allow admin write access on teams" ON teams 
    FOR ALL USING (auth.role() = 'authenticated');

CREATE POLICY "Allow admin write access on matches" ON matches 
    FOR ALL USING (auth.role() = 'authenticated');

-- 6. SQL Function to calculate Standings on-the-fly (Optional database helper)
-- Calculates points (Win = 3, Draw = 1, Loss = 0), Goal Difference, and sorts them.
CREATE OR REPLACE VIEW standings_view AS
WITH team_match_stats AS (
    -- Home matches stats
    SELECT 
        home_team_id AS team_id,
        COUNT(*) FILTER (WHERE status = 'beendet') AS played,
        COUNT(*) FILTER (WHERE status = 'beendet' AND home_score > away_score) AS won,
        COUNT(*) FILTER (WHERE status = 'beendet' AND home_score = away_score) AS drawn,
        COUNT(*) FILTER (WHERE status = 'beendet' AND home_score < away_score) AS lost,
        COALESCE(SUM(home_score) FILTER (WHERE status = 'beendet'), 0) AS goals_for,
        COALESCE(SUM(away_score) FILTER (WHERE status = 'beendet'), 0) AS goals_against
    FROM matches
    GROUP BY home_team_id
    
    UNION ALL
    
    -- Away matches stats
    SELECT 
        away_team_id AS team_id,
        COUNT(*) FILTER (WHERE status = 'beendet') AS played,
        COUNT(*) FILTER (WHERE status = 'beendet' AND away_score > home_score) AS won,
        COUNT(*) FILTER (WHERE status = 'beendet' AND away_score = home_score) AS drawn,
        COUNT(*) FILTER (WHERE status = 'beendet' AND away_score < home_score) AS lost,
        COALESCE(SUM(away_score) FILTER (WHERE status = 'beendet'), 0) AS goals_for,
        COALESCE(SUM(home_score) FILTER (WHERE status = 'beendet'), 0) AS goals_against
    FROM matches
    GROUP BY away_team_id
),
aggregated_stats AS (
    SELECT 
        team_id,
        SUM(played) AS played,
        SUM(won) AS won,
        SUM(drawn) AS drawn,
        SUM(lost) AS lost,
        SUM(goals_for) AS goals_for,
        SUM(goals_against) AS goals_against,
        (SUM(won) * 3 + SUM(drawn) * 1) AS points,
        (SUM(goals_for) - SUM(goals_against)) AS goal_difference
    FROM team_match_stats
    GROUP BY team_id
)
SELECT 
    t.id AS team_id,
    t.name AS team_name,
    t.short_name,
    t.logo_color,
    t.logo_icon,
    t.logo_url,
    COALESCE(s.played, 0) AS played,
    COALESCE(s.won, 0) AS won,
    COALESCE(s.drawn, 0) AS drawn,
    COALESCE(s.lost, 0) AS lost,
    COALESCE(s.goals_for, 0) AS goals_for,
    COALESCE(s.goals_against, 0) AS goals_against,
    COALESCE(s.goal_difference, 0) AS goal_difference,
    COALESCE(s.points, 0) AS points
FROM teams t
LEFT JOIN aggregated_stats s ON t.id = s.team_id
ORDER BY points DESC, goal_difference DESC, goals_for DESC, t.name ASC;
