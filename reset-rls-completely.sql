-- ============================================
-- COMPLETE RLS RESET - NUCLEAR OPTION
-- ============================================
-- This completely removes and recreates all RLS policies

-- STEP 1: Disable RLS temporarily
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.families DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.children DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks DISABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards DISABLE ROW LEVEL SECURITY;

-- STEP 2: Drop ALL policies (using DO block to handle any that don't exist)
DO $$ 
DECLARE
    r RECORD;
BEGIN
    -- Drop all policies on profiles
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'profiles' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.profiles';
    END LOOP;
    
    -- Drop all policies on families
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'families' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.families';
    END LOOP;
    
    -- Drop all policies on children
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'children' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.children';
    END LOOP;
    
    -- Drop all policies on tasks
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'tasks' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.tasks';
    END LOOP;
    
    -- Drop all policies on rewards
    FOR r IN (SELECT policyname FROM pg_policies WHERE tablename = 'rewards' AND schemaname = 'public') LOOP
        EXECUTE 'DROP POLICY IF EXISTS ' || quote_ident(r.policyname) || ' ON public.rewards';
    END LOOP;
END $$;

-- STEP 3: Create simple, non-recursive policies

-- PROFILES: Simple policies using only auth.uid()
CREATE POLICY "profiles_select_own"
  ON public.profiles
  FOR SELECT
  TO authenticated
  USING (id = auth.uid());

CREATE POLICY "profiles_insert_own"
  ON public.profiles
  FOR INSERT
  TO authenticated
  WITH CHECK (id = auth.uid());

CREATE POLICY "profiles_update_own"
  ON public.profiles
  FOR UPDATE
  TO authenticated
  USING (id = auth.uid())
  WITH CHECK (id = auth.uid());

-- FAMILIES: Allow creation and access
CREATE POLICY "families_insert_authenticated"
  ON public.families
  FOR INSERT
  TO authenticated
  WITH CHECK (true);

CREATE POLICY "families_select_own"
  ON public.families
  FOR SELECT
  TO authenticated
  USING (
    id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_id IS NOT NULL
    )
  );

CREATE POLICY "families_update_own"
  ON public.families
  FOR UPDATE
  TO authenticated
  USING (
    id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_id IS NOT NULL
    )
  );

-- CHILDREN: Access based on family membership
CREATE POLICY "children_all_family"
  ON public.children
  FOR ALL
  TO authenticated
  USING (
    family_id IN (
      SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_id IS NOT NULL
    )
  );

-- TASKS: Access based on child's family
CREATE POLICY "tasks_all_family"
  ON public.tasks
  FOR ALL
  TO authenticated
  USING (
    child_id IN (
      SELECT c.id FROM public.children c
      WHERE c.family_id IN (
        SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_id IS NOT NULL
      )
    )
  );

-- REWARDS: Access based on child's family
CREATE POLICY "rewards_all_family"
  ON public.rewards
  FOR ALL
  TO authenticated
  USING (
    child_id IN (
      SELECT c.id FROM public.children c
      WHERE c.family_id IN (
        SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_id IS NOT NULL
      )
    )
  );

-- STEP 4: Re-enable RLS
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

-- STEP 5: Verify
SELECT 
  'SUCCESS: All RLS policies have been reset!' as status,
  COUNT(*) as total_policies
FROM pg_policies 
WHERE schemaname = 'public' 
AND tablename IN ('profiles', 'families', 'children', 'tasks', 'rewards');
