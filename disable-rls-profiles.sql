-- ============================================
-- DISABLE RLS ON PROFILES - EMERGENCY FIX
-- ============================================
-- This will allow profile updates without RLS checks
-- WARNING: This reduces security but fixes the recursion issue

-- Disable RLS on profiles table
ALTER TABLE public.profiles DISABLE ROW LEVEL SECURITY;

-- Verify
SELECT 
  tablename,
  rowsecurity
FROM pg_tables 
WHERE schemaname = 'public' 
AND tablename = 'profiles';

SELECT 'RLS disabled on profiles table. You can now create families!' as status;
