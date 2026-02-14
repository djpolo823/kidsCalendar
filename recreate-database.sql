    -- ============================================
    -- RECREATE DATABASE FROM SCRATCH
    -- ============================================
    -- This script completely recreates all tables and policies
    -- WARNING: This will DELETE all existing data!

    -- STEP 1: Drop all existing tables (CASCADE will remove all dependencies)
    DROP TABLE IF EXISTS public.rewards CASCADE;
    DROP TABLE IF EXISTS public.tasks CASCADE;
    DROP TABLE IF EXISTS public.children CASCADE;
    DROP TABLE IF EXISTS public.profiles CASCADE;
    DROP TABLE IF EXISTS public.families CASCADE;

    -- STEP 2: Drop the trigger function if it exists
    DROP FUNCTION IF EXISTS public.handle_new_user() CASCADE;

    -- ============================================
    -- STEP 3: Create tables from scratch
    -- ============================================

    -- Families table
    CREATE TABLE public.families (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
    );

    -- Profiles table
    CREATE TABLE public.profiles (
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
    CREATE TABLE public.children (
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
    CREATE TABLE public.tasks (
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
    CREATE TABLE public.rewards (
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
    -- STEP 4: Create indexes
    -- ============================================

    CREATE INDEX idx_profiles_family_id ON public.profiles(family_id);
    CREATE INDEX idx_children_family_id ON public.children(family_id);
    CREATE INDEX idx_tasks_child_id ON public.tasks(child_id);
    CREATE INDEX idx_rewards_child_id ON public.rewards(child_id);

    -- ============================================
    -- STEP 5: Enable RLS
    -- ============================================

    ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
    ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

    -- ============================================
    -- STEP 6: Create RLS Policies (SIMPLE, NO RECURSION)
    -- ============================================

    -- PROFILES POLICIES
    CREATE POLICY "profiles_select"
    ON public.profiles
    FOR SELECT
    TO authenticated
    USING (id = auth.uid());

    CREATE POLICY "profiles_insert"
    ON public.profiles
    FOR INSERT
    TO authenticated
    WITH CHECK (id = auth.uid());

    CREATE POLICY "profiles_update"
    ON public.profiles
    FOR UPDATE
    TO authenticated
    USING (id = auth.uid())
    WITH CHECK (id = auth.uid());

    -- FAMILIES POLICIES
    CREATE POLICY "families_insert"
    ON public.families
    FOR INSERT
    TO authenticated
    WITH CHECK (true);

    CREATE POLICY "families_select"
    ON public.families
    FOR SELECT
    TO authenticated
    USING (
        id IN (
        SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_id IS NOT NULL
        )
    );

    CREATE POLICY "families_update"
    ON public.families
    FOR UPDATE
    TO authenticated
    USING (
        id IN (
        SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_id IS NOT NULL
        )
    );

    -- CHILDREN POLICIES
    CREATE POLICY "children_select"
    ON public.children
    FOR SELECT
    TO authenticated
    USING (
        family_id IN (
        SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_id IS NOT NULL
        )
    );

    CREATE POLICY "children_insert"
    ON public.children
    FOR INSERT
    TO authenticated
    WITH CHECK (
        family_id IN (
        SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_id IS NOT NULL
        )
    );

    CREATE POLICY "children_update"
    ON public.children
    FOR UPDATE
    TO authenticated
    USING (
        family_id IN (
        SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_id IS NOT NULL
        )
    );

    CREATE POLICY "children_delete"
    ON public.children
    FOR DELETE
    TO authenticated
    USING (
        family_id IN (
        SELECT family_id FROM public.profiles WHERE id = auth.uid() AND family_id IS NOT NULL
        )
    );

    -- TASKS POLICIES
    CREATE POLICY "tasks_all"
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

    -- REWARDS POLICIES
    CREATE POLICY "rewards_all"
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

    -- ============================================
    -- STEP 7: Create trigger for new user profiles
    -- ============================================

    CREATE OR REPLACE FUNCTION public.handle_new_user()
    RETURNS TRIGGER AS $$
    BEGIN
    INSERT INTO public.profiles (id, email, full_name, avatar_url, created_at)
    VALUES (
        NEW.id,
        NEW.email,
        COALESCE(NEW.raw_user_meta_data->>'full_name', split_part(NEW.email, '@', 1)),
        COALESCE(NEW.raw_user_meta_data->>'avatar_url', 'https://api.dicebear.com/7.x/avataaars/svg?seed=' || NEW.id),
        NOW()
    )
    ON CONFLICT (id) DO NOTHING;
    RETURN NEW;
    END;
    $$ LANGUAGE plpgsql SECURITY DEFINER;

    CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

    -- ============================================
    -- STEP 8: Grant permissions
    -- ============================================

    GRANT USAGE ON SCHEMA public TO anon, authenticated;
    GRANT ALL ON ALL TABLES IN SCHEMA public TO anon, authenticated;
    GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated;

    -- ============================================
    -- DONE!
    -- ============================================

    SELECT 
    'SUCCESS: Database recreated from scratch!' as status,
    (SELECT COUNT(*) FROM information_schema.tables WHERE table_schema = 'public') as total_tables,
    (SELECT COUNT(*) FROM pg_policies WHERE schemaname = 'public') as total_policies;
