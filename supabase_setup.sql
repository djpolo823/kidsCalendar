-- 1. Tables for Family Data

-- Families (if not already created)
CREATE TABLE IF NOT EXISTS public.families (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Profiles (linking users to families)
CREATE TABLE IF NOT EXISTS public.profiles (
    id UUID REFERENCES auth.users ON DELETE CASCADE PRIMARY KEY,
    full_name TEXT,
    avatar_url TEXT,
    family_id TEXT REFERENCES public.families(id),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Children
CREATE TABLE IF NOT EXISTS public.children (
    id TEXT PRIMARY KEY,
    family_id TEXT REFERENCES public.families(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    avatar TEXT,
    level INTEGER DEFAULT 1,
    stars INTEGER DEFAULT 0,
    active BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Tasks
CREATE TABLE IF NOT EXISTS public.tasks (
    id TEXT PRIMARY KEY,
    child_id TEXT REFERENCES public.children(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    description TEXT,
    reward INTEGER DEFAULT 5,
    time TEXT,
    duration TEXT,
    type TEXT,
    status TEXT DEFAULT 'pending',
    emoji TEXT,
    recurrence JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Rewards
CREATE TABLE IF NOT EXISTS public.rewards (
    id TEXT PRIMARY KEY,
    child_id TEXT REFERENCES public.children(id) ON DELETE CASCADE,
    title TEXT NOT NULL,
    category TEXT,
    cost INTEGER DEFAULT 10,
    image TEXT,
    type TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Row Level Security (RLS) policies
-- Note: Simplified for a family app. Anyone in the family can CRUD everything in that family.

ALTER TABLE public.families ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.children ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rewards ENABLE ROW LEVEL SECURITY;

-- Families Polices
CREATE POLICY "Users can view their own family" ON public.families 
    FOR SELECT USING (id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid()));

-- Profiles Policies
CREATE POLICY "Users can view all family profiles" ON public.profiles
    FOR SELECT USING (family_id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Users can update their own profile" ON public.profiles
    FOR UPDATE USING (auth.uid() = id);

-- Children Policies
CREATE POLICY "Family members can view children" ON public.children
    FOR SELECT USING (family_id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Family members can insert children" ON public.children
    FOR INSERT WITH CHECK (family_id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Family members can update children" ON public.children
    FOR UPDATE USING (family_id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid()));
CREATE POLICY "Family members can delete children" ON public.children
    FOR DELETE USING (family_id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid()));

-- Tasks Policies
CREATE POLICY "Family members can manage tasks" ON public.tasks
    FOR ALL USING (child_id IN (SELECT id FROM public.children WHERE family_id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid())));

-- Rewards Policies
CREATE POLICY "Family members can manage rewards" ON public.rewards
    FOR ALL USING (child_id IN (SELECT id FROM public.children WHERE family_id IN (SELECT family_id FROM public.profiles WHERE id = auth.uid())));
