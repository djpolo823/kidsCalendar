-- ============================================
-- FIX INFINITE RECURSION IN RLS POLICIES
-- ============================================
-- This fixes the circular dependency between profiles and families policies

-- STEP 1: Drop existing problematic policies
DROP POLICY IF EXISTS "families_select" ON public.families;
DROP POLICY IF EXISTS "families_update" ON public.families;
DROP POLICY IF EXISTS "children_select" ON public.children;
DROP POLICY IF EXISTS "children_insert" ON public.children;
DROP POLICY IF EXISTS "children_update" ON public.children;
DROP POLICY IF EXISTS "children_delete" ON public.children;
DROP POLICY IF EXISTS "tasks_all" ON public.tasks;
DROP POLICY IF EXISTS "rewards_all" ON public.rewards;

-- STEP 2: Create a helper function that bypasses RLS
-- This function gets the user's family_id without triggering RLS checks
CREATE OR REPLACE FUNCTION public.get_user_family_id(user_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER -- This is the key: it runs with elevated privileges
SET search_path = public
AS $$
DECLARE
  result TEXT;
BEGIN
  SELECT family_id INTO result
  FROM public.profiles
  WHERE id = user_id;
  
  RETURN result;
END;
$$;

-- STEP 3: Recreate policies using the helper function (NO RECURSION!)

-- FAMILIES POLICIES
CREATE POLICY "families_select"
  ON public.families
  FOR SELECT
  TO authenticated
  USING (id = public.get_user_family_id(auth.uid()));

CREATE POLICY "families_update"
  ON public.families
  FOR UPDATE
  TO authenticated
  USING (id = public.get_user_family_id(auth.uid()));

-- CHILDREN POLICIES
CREATE POLICY "children_select"
  ON public.children
  FOR SELECT
  TO authenticated
  USING (family_id = public.get_user_family_id(auth.uid()));

CREATE POLICY "children_insert"
  ON public.children
  FOR INSERT
  TO authenticated
  WITH CHECK (family_id = public.get_user_family_id(auth.uid()));

CREATE POLICY "children_update"
  ON public.children
  FOR UPDATE
  TO authenticated
  USING (family_id = public.get_user_family_id(auth.uid()));

CREATE POLICY "children_delete"
  ON public.children
  FOR DELETE
  TO authenticated
  USING (family_id = public.get_user_family_id(auth.uid()));

-- TASKS POLICIES
CREATE POLICY "tasks_all"
  ON public.tasks
  FOR ALL
  TO authenticated
  USING (
    child_id IN (
      SELECT id FROM public.children
      WHERE family_id = public.get_user_family_id(auth.uid())
    )
  );

-- REWARDS POLICIES
CREATE POLICY "rewards_all"
  ON public.rewards
  FOR ALL
  TO authenticated
  USING (
    child_id IN (
      SELECT id FROM public.children
      WHERE family_id = public.get_user_family_id(auth.uid())
    )
  );

-- ============================================
-- VERIFICATION
-- ============================================

SELECT 
  'SUCCESS: Infinite recursion fixed!' as status,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'families') as families_policies,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'profiles') as profiles_policies,
  (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public' AND tablename = 'children') as children_policies;
