
import { Task, Child, Reward, Guardian, TimeFormat, Language, RedemptionRecord } from '../types';
import { supabase } from './supabase';

const STORAGE_KEY = 'kidscalendar_db_v1';

export interface UserAccount {
  id?: string;
  email: string;
  name: string;
  familyId?: string;
  avatar?: string;
}

interface AppDatabase {
  currentUser: UserAccount | null;
  children: Child[];
  guardians: Guardian[];
  timeFormat: TimeFormat;
  language: Language;
  learningMode: boolean;
  lastUpdated: string;
}

export const DatabaseService = {
  loadLocalData: (): AppDatabase => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        return JSON.parse(stored);
      }
    } catch (e) {
      console.error("Failed to load data from LocalStorage", e);
    }

    return {
      currentUser: null,
      children: [],
      guardians: [],
      timeFormat: '12h',
      language: 'es',
      learningMode: false,
      lastUpdated: new Date().toISOString()
    };
  },

  saveLocalData: (data: Partial<AppDatabase>) => {
    try {
      const current = DatabaseService.loadLocalData();
      const updated = {
        ...current,
        ...data,
        lastUpdated: new Date().toISOString()
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    } catch (e) {
      console.error("Failed to save data to LocalStorage", e);
    }
  },

  // --- Supabase Integration ---

  fetchFamilyData: async (familyId: string) => {
    // Fetch children
    const { data: children, error: childrenError } = await supabase
      .from('children')
      .select('*, tasks(*), rewards(*), redemption_history(*)')
      .eq('family_id', familyId);

    if (childrenError) throw childrenError;

    // Fetch guardians (profiles in the same family)
    const { data: profiles, error: profilesError } = await supabase
      .from('profiles')
      .select('*')
      .eq('family_id', familyId);

    if (profilesError) throw profilesError;

    const guardians: Guardian[] = profiles.map(p => ({
      id: p.id,
      name: p.full_name || p.email || 'User',
      role: 'Admin', // Default role for now
      avatar: p.avatar_url,
      email: p.email
    }));

    return {
      children: (children || []).map((c: any) => ({
        ...c,
        loveLanguages: c.love_languages || [],
        age: c.age,
        tasks: (c.tasks || []).map((t: any) => ({
          ...t,
          startTime: t.start_time
        }))
      })),
      guardians
    };
  },

  createFamily: async (userId: string, familyName: string) => {
    const familyId = `fam_${Math.random().toString(36).substr(2, 9)}`;

    // 1. Create family
    const { error: familyError } = await supabase
      .from('families')
      .insert({ id: familyId, name: familyName });

    if (familyError) throw familyError;

    // 2. Update user profile with familyId
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ family_id: familyId })
      .eq('id', userId);

    if (profileError) throw profileError;

    return familyId;
  },

  joinFamily: async (userId: string, code: string) => {
    // 1. Verify invitation code (now case insensitive to be user friendly)
    const { data: invitation, error: inviteError } = await supabase
      .from('invitations')
      .select('*')
      .eq('code', code.toUpperCase())
      .eq('status', 'pending')
      .single();

    if (inviteError || !invitation) throw new Error('Invalid or expired invitation code');

    // 2. Update user profile
    const { error: profileError } = await supabase
      .from('profiles')
      .update({ family_id: invitation.family_id })
      .eq('id', userId);

    if (profileError) throw profileError;

    // 3. Mark invitation as used
    await supabase.from('invitations').update({ status: 'accepted' }).eq('id', invitation.id);

    return invitation.family_id;
  },

  generateInvitationCode: async (familyId: string, role: string = 'Co-Parent') => {
    // Generate 6 character alphanumeric code
    const characters = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // No O, I, 1, 0 to avoid confusion
    let code = '';
    for (let i = 0; i < 6; i++) {
      code += characters.charAt(Math.floor(Math.random() * characters.length));
    }

    const { data, error } = await supabase
      .from('invitations')
      .insert([{
        id: `inv_${Date.now()}`,
        family_id: familyId,
        code: code,
        role: role,
        status: 'pending',
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
      }])
      .select()
      .single();

    if (error) throw error;
    return data;
  },

  updateProfile: async (userId: string, updates: any) => {
    const { error } = await supabase
      .from('profiles')
      .update(updates)
      .eq('id', userId);

    if (error) throw error;
  },

  resetData: () => {
    localStorage.removeItem(STORAGE_KEY);
  },

  clearSession: () => {
    localStorage.removeItem(STORAGE_KEY);
  }
};
