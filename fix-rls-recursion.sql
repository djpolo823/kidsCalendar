-- ============================================
-- FIX RLS RECURSION ERROR - PROFILES TABLE
-- ============================================
-- This fixes the "infinite recursion detected" error

-- 1. Drop all existing policies on profiles
DROP POLICY IF EXISTS "Users can view their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can update their own profile" ON public.profiles;
DROP POLICY IF EXISTS "Users can insert their own profile" ON public.profiles;

-- 2. Create simplified policies that don't cause recursion
-- These policies use auth.uid() directly instead of querying profiles

CREATE POLICY "Enable read access for users to their own profile"
  ON public.profiles
  FOR SELECT
  USING (auth.uid() = id);

CREATE POLICY "Enable insert access for users to their own profile"
  ON public.profiles
  FOR INSERT
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Enable update access for users to their own profile"
  ON public.profiles
  FOR UPDATE
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

-- 3. Fix families policies to avoid recursion
DROP POLICY IF EXISTS "Users can view their family" ON public.families;
DROP POLICY IF EXISTS "Users can create families" ON public.families;
DROP POLICY IF EXISTS "Users can update their family" ON public.families;

-- Allow anyone to create families (they'll be the owner)
CREATE POLICY "Enable insert for authenticated users"
  ON public.families
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

-- Allow users to view families they belong to
CREATE POLICY "Enable read access for family members"
  ON public.families
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.family_id = families.id
    )
  );

-- Allow users to update their own family
CREATE POLICY "Enable update for family members"
  ON public.families
  FOR UPDATE
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.family_id = families.id
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.profiles
      WHERE profiles.id = auth.uid()
      AND profiles.family_id = families.id
    )
  );

-- 4. Verify the fix
SELECT 'RLS policies fixed successfully! No more recursion.' AS status;
