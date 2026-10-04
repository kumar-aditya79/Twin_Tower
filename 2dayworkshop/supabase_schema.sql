-- ==============================================================================
-- 2-DAY WORKSHOP ON BIG DATA COMPUTING (BDC '26)
-- SUPABASE DATABASE INITIALIZATION SCHEMA & ROW LEVEL SECURITY (RLS) POLICIES
-- ==============================================================================

-- 1. Table: students (Registered Participants)
CREATE TABLE IF NOT EXISTS public.students (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roll_number TEXT UNIQUE NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    registered_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT check_college_email CHECK (email ILIKE '%@ghrcemp.raisoni.net')
);

-- 2. Table: attendance (Anti-Proxy Verified Check-in Records)
CREATE TABLE IF NOT EXISTS public.attendance (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    roll_number TEXT NOT NULL,
    name TEXT NOT NULL,
    email TEXT NOT NULL,
    day TEXT NOT NULL, -- 'Day 1' or 'Day 2'
    session TEXT NOT NULL, -- e.g. 'Morning Check-in' or 'Post-Lunch Lab'
    timestamp TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    geo_distance_meters NUMERIC(8,2) NOT NULL,
    code_used TEXT NOT NULL,
    device_token TEXT,
    flagged BOOLEAN DEFAULT FALSE,
    flag_reason TEXT,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Unique index to prevent same student checking in twice for the same day+session
CREATE UNIQUE INDEX IF NOT EXISTS idx_student_day_session 
ON public.attendance (roll_number, day, session);

-- 3. Table: notes (Lecture Notes & Download Links)
CREATE TABLE IF NOT EXISTS public.notes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    day TEXT NOT NULL,
    session TEXT NOT NULL,
    title TEXT NOT NULL,
    speaker TEXT NOT NULL,
    file_url TEXT NOT NULL,
    type TEXT DEFAULT 'PDF / SLIDES',
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Table: venue_settings (Dynamic GPS Geofence Configuration)
CREATE TABLE IF NOT EXISTS public.venue_settings (
    id INT PRIMARY KEY DEFAULT 1,
    venue_name TEXT DEFAULT 'GHRCEMP Nagpur',
    latitude NUMERIC(10,6) NOT NULL DEFAULT 21.096300,
    longitude NUMERIC(10,6) NOT NULL DEFAULT 79.004200,
    radius_meters INT NOT NULL DEFAULT 250,
    updated_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT single_row_check CHECK (id = 1)
);

-- Insert initial venue settings if not present
INSERT INTO public.venue_settings (id, venue_name, latitude, longitude, radius_meters)
VALUES (1, 'GHRCEMP Nagpur', 21.096300, 79.004200, 250)
ON CONFLICT (id) DO NOTHING;

-- 5. Table: site_visits (Live Counter for Footer)
CREATE TABLE IF NOT EXISTS public.site_visits (
    id INT PRIMARY KEY DEFAULT 1,
    count BIGINT DEFAULT 1204,
    last_visit TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL,
    CONSTRAINT single_row_visits CHECK (id = 1)
);

-- Insert initial visit counter if not present
INSERT INTO public.site_visits (id, count)
VALUES (1, 1204)
ON CONFLICT (id) DO NOTHING;

-- Function to safely increment site visits
CREATE OR REPLACE FUNCTION increment_site_visits()
RETURNS BIGINT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_count BIGINT;
BEGIN
    INSERT INTO public.site_visits (id, count, last_visit)
    VALUES (1, 1, timezone('utc'::text, now()))
    ON CONFLICT (id)
    DO UPDATE SET count = site_visits.count + 1, last_visit = timezone('utc'::text, now())
    RETURNING count INTO v_count;
    
    RETURN v_count;
END;
$$;

-- ==============================================================================
-- ROW LEVEL SECURITY (RLS) SETUP
-- ==============================================================================

ALTER TABLE public.students ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attendance ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.venue_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.site_visits ENABLE ROW LEVEL SECURITY;

-- Public can insert check-in records into attendance
CREATE POLICY "Public can insert attendance" 
ON public.attendance FOR INSERT 
TO anon, authenticated
WITH CHECK (true);

-- Public can read notes
CREATE POLICY "Public can read notes" 
ON public.notes FOR SELECT 
TO anon, authenticated
USING (true);

-- Public can read venue settings for client distance validation
CREATE POLICY "Public can read venue settings" 
ON public.venue_settings FOR SELECT 
TO anon, authenticated
USING (true);

-- Public can read site visits
CREATE POLICY "Public can read site visits" 
ON public.site_visits FOR SELECT 
TO anon, authenticated
USING (true);
