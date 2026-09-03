-- ============================================================
-- Migration: create_venues_table
-- Created:   2026-09-01
-- Objective: Migrate static demoVenues.js dataset to live Supabase Postgres DB
-- ============================================================

-- 1. Create venues table with exact column names matching frontend components
CREATE TABLE IF NOT EXISTS venues (
    id TEXT PRIMARY KEY,
    "venueName" TEXT NOT NULL,
    "companyName" TEXT,
    address TEXT,
    suburb TEXT,
    city TEXT DEFAULT 'Melbourne',
    state TEXT DEFAULT 'VIC',
    lat DOUBLE PRECISION NOT NULL CHECK (lat >= -90 AND lat <= 90),
    lng DOUBLE PRECISION NOT NULL CHECK (lng >= -180 AND lng <= 180),
    emoji TEXT DEFAULT '☀️',
    vibe TEXT,
    "typeCategory" TEXT DEFAULT 'Bar',
    "typeLabel" TEXT,
    tags JSONB DEFAULT '[]'::jsonb,
    heating TEXT,
    "hasBalcony" BOOLEAN DEFAULT false,
    "hasFireplace" BOOLEAN DEFAULT false,
    "hasCozy" BOOLEAN DEFAULT false,
    price TEXT,
    capacity INTEGER,
    opening_hours TEXT,
    hours TEXT,
    venue_description TEXT,
    official_website_url TEXT,
    contact_phone TEXT,
    notes TEXT,
    "proTip" TEXT,
    image TEXT,
    shielding JSONB DEFAULT '{}'::jsonb,
    "sunIntelligence" TEXT,
    "roomTypes" JSONB DEFAULT '[]'::jsonb,
    "happyHour" JSONB DEFAULT NULL,
    "sunshineNow" BOOLEAN DEFAULT false,
    "fireplaceOn" BOOLEAN DEFAULT false,
    "heatersOn" BOOLEAN DEFAULT false,
    "roofClosed" BOOLEAN DEFAULT false,
    obstacle_height DOUBLE PRECISION DEFAULT 2,
    obstacle_distance DOUBLE PRECISION DEFAULT 1,
    base_elevation_meters DOUBLE PRECISION DEFAULT 0,
    "balconyData" JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 2. Performance indexes
CREATE INDEX IF NOT EXISTS idx_venues_lat_lng ON venues (lat, lng);
CREATE INDEX IF NOT EXISTS idx_venues_suburb ON venues (suburb);
CREATE INDEX IF NOT EXISTS idx_venues_type_category ON venues ("typeCategory");

-- 3. Row Level Security (RLS)
ALTER TABLE venues ENABLE ROW LEVEL SECURITY;

-- Allow public read access to all venues
CREATE POLICY "Allow public read access on venues"
    ON venues FOR SELECT
    USING (true);

-- Allow public insert and update on venues (for OwnerDashboard and seeding)
CREATE POLICY "Allow public write on venues"
    ON venues FOR ALL
    USING (true)
    WITH CHECK (true);
