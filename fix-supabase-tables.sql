-- ============================================
-- FIX SUPABASE TABLES - KIDSCALENDAR
-- ============================================
-- This script will fix common issues with the database tables
-- Run this in your Supabase SQL Editor

-- First, let's check if there are any problematic triggers or constraints
-- We'll drop and recreate the tables with proper configuration

-- ============================================
-- 1. DROP EXISTING TRIGGERS (if any are causing issues)
-- ============================================

-- Drop any problematic triggers on profiles table
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
DROP FUNCTION IF EXISTS public.handle_new_user();

-- ============================================
-- 2. RECREATE PROFILES TABLE TRIGGER
-- ============================================

-- Create a function to handle new user creation
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO public.profiles (id, email, full_name, avatar_url, created_at)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data->>'full_name', NEW.email),
    COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id),
    NOW()
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Create trigger to automatically create profile on user signup
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ============================================
-- 3. ENSURE ALL TABLES EXIST WITH CORRECT SCHEMA
-- ============================================

-- Families table
CREATE TABLE IF NOT EXISTS public.families (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  email TEXT,
  full_name TEXT,
  avatar_url TEXT,
  family_id TEXT REFERENCES public.families(id) ON DELETE SET NULL,
  language TEXT DEFAULT 'es',
  time_format TEXT DEFAULT '12h',
  learning_mode BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Children table
CREATE TABLE IF NOT EXISTS public.children (
  id TEXT PRIMARY KEY,
  family_id TEXT NOT NULL REFERENCES public.families(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  avatar TEXT,
  level INTEGER DEFAULT 1,
  stars INTEGER DEFAULT 0,
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Tasks table
CREATE TABLE IF NOT EXISTS public.tasks (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  reward INTEGER DEFAULT 0,
  time TEXT,
  duration INTEGER,
  type TEXT,
  emoji TEXT,
  status TEXT DEFAULT 'pending',
  recurrence TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Rewards table
CREATE TABLE IF NOT EXISTS public.rewards (
  id TEXT PRIMARY KEY,
  child_id TEXT NOT NULL REFERENCES public.children(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT,
  cost INTEGER NOT NULL,
  image TEXT,
  type TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- ============================================
-- 4. ENABLE ROW LEVEL SECURITY (RLS)
-- ============================================

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

-- ============================================
-- 5. DROP OLD POLICIES (to avoid conflicts)
-- ============================================

DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

DROP POLICY IF EXISTS "Users can view their family" ON public.families;
DROP POLICY IF EXISTS "Users can create families" ON public.families;
DROP POLICY IF EXISTS "Users can update their family" ON public.families;

DROP POLICY IF EXISTS "Users can view family children" ON public.children;
DROP POLICY IF EXISTS "Users can manage family children" ON public.children;

DROP POLICY IF EXISTS "Users can view family tasks" ON public.tasks;
DROP POLICY IF EXISTS "Users can manage family tasks" ON public.tasks;

DROP POLICY IF EXISTS "Users can view family rewards" ON public.rewards;
DROP POLICY IF EXISTS "Users can manage family rewards" ON public.rewards;

-- ============================================
-- 6. CREATE NEW RLS POLICIES
-- ============================================

-- Profiles policies
CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = id);

-- Families policies
CREATE POLICY "Users can view their family"
  ON public.families FOR SELECT
  USING (
    id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can create families"
  ON public.families FOR INSERT
  WITH CHECK (true);

CREATE POLICY "Users can update their family"
  ON public.families FOR UPDATE
  USING (
    id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Children policies
CREATE POLICY "Users can view family children"
  ON public.children FOR SELECT
  USING (
    family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid()
    )
  );

CREATE POLICY "Users can manage family children"
  ON public.children FOR ALL
  USING (
    family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid()
    )
  );

-- Tasks policies
CREATE POLICY "Users can view family tasks"
  ON public.tasks FOR SELECT
  USING (
    child_id IN (
      SELECT c.id FROM public.children c
      INNER JOIN public.profiles p ON c.family_id = p.family_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Users can manage family tasks"
  ON public.tasks FOR ALL
  USING (
    child_id IN (
      SELECT c.id FROM public.children c
      INNER JOIN public.profiles p ON c.family_id = p.family_id
      WHERE p.id = auth.uid()
    )
  );

-- Rewards policies
CREATE POLICY "Users can view family rewards"
  ON public.rewards FOR SELECT
  USING (
    child_id IN (
      SELECT c.id FROM public.children c
      INNER JOIN public.profiles p ON c.family_id = p.family_id
      WHERE p.id = auth.uid()
    )
  );

CREATE POLICY "Users can manage family rewards"
  ON public.rewards FOR ALL
  USING (
    child_id IN (
      SELECT c.id FROM public.children c
      INNER JOIN public.profiles p ON c.family_id = p.family_id
      WHERE p.id = auth.uid()
    )
  );

-- ============================================
-- 7. CREATE INDEXES FOR PERFORMANCE
-- ============================================

CREATE INDEX IF NOT EXISTS idx_profiles_family_id ON public.profiles(family_id);
CREATE INDEX IF NOT EXISTS idx_children_family_id ON public.children(family_id);
CREATE INDEX IF NOT EXISTS idx_tasks_child_id ON public.tasks(child_id);
CREATE INDEX IF NOT EXISTS idx_rewards_child_id ON public.rewards(child_id);

-- ============================================
-- 8. GRANT PERMISSIONS
-- ============================================

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

-- ============================================
-- DONE!
-- ============================================

SELECT 'Database tables fixed successfully!' AS status;
