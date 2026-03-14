
import React, { useState, useEffect } from 'react';
import { HashRouter, Routes, Route, Navigate } from 'react-router-dom';
import ParentDashboard from './views/ParentDashboard';
import ChildPortal from './views/ChildPortal';
import RewardsCatalog from './views/RewardsCatalog';
import ParentSettings from './views/ParentSettings';
import AuthView from './views/AuthView';
import { Task, Child, Reward, Guardian, TimeFormat, Language } from './types';
import { DatabaseService, UserAccount } from './services/database';
import { sounds } from './services/soundService';
import { supabase } from './services/supabase';
import { migrateLocalStorageToSupabase } from './services/migrationService';
import { getSpeechBase64, translateText } from './services/geminiService';
import { getTaskSpeechText, cleanForSpeech } from './services/speechUtils';

const App: React.FC = () => {
  const [currentUser, setCurrentUser] = useState<UserAccount | null>(null);
  const [children, setChildren] = useState<Child[]>([]);
  const [guardians, setGuardians] = useState<Guardian[]>([]);
  const [timeFormat, setTimeFormat] = useState<TimeFormat>('12h');
  const [language, setLanguage] = useState<Language>('es');
  const [learningMode, setLearningMode] = useState<boolean>(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const [syncStatus, setSyncStatus] = useState<{ type: 'success' | 'error' | 'loading', message: string } | null>(null);

  const preGenerateTaskAudio = async (task: Task, childName: string): Promise<Task> => {
    const updatedTask = { ...task };
    const statuses: Task['status'][] = ['pending', 'active', 'done'];
    const languages: Language[] = ['es', 'en'];

    // 1. Translate Title & Description first (to both languages for maximum compatibility)
    const translationPromises = [];
    for (const lang of languages) {
      const titleField = `title_${lang}` as keyof Task;
      const descField = `description_${lang}` as keyof Task;

      // Always translate title to lang
      translationPromises.push((async () => {
        try {
          const translated = await translateText(task.title, lang);
          (updatedTask as any)[titleField] = translated;
        } catch (e) {
          (updatedTask as any)[titleField] = task.title;
        }
      })());

      // Always translate description to lang
      translationPromises.push((async () => {
        if (!task.description) {
          (updatedTask as any)[descField] = '';
        } else {
          try {
            const translated = await translateText(task.description, lang);
            (updatedTask as any)[descField] = translated;
          } catch (e) {
            (updatedTask as any)[descField] = task.description;
          }
        }
      })());
    }

    await Promise.all(translationPromises);

    // 2. Generate Audio with translated content
    const promises = [];
    for (const status of statuses) {
      for (const lang of languages) {
        // Create a temporary task with translated title/desc for getTaskSpeechText
        const tempTaskForSpeech = { 
          ...updatedTask, 
          status, 
          title: (updatedTask as any)[`title_${lang}`] || task.title,
          description: (updatedTask as any)[`description_${lang}`] || task.description
        };
        const text = getTaskSpeechText(tempTaskForSpeech, childName, lang);
        const cleanText = cleanForSpeech(text);

        promises.push((async () => {
          const base64 = await getSpeechBase64(cleanText, lang);
          if (base64) {
            const field = `audio_${status}_${lang}` as keyof Task;
            (updatedTask as any)[field] = base64;
          }
        })());
      }
    }

    await Promise.all(promises);
    return updatedTask;
  };

  useEffect(() => {
    // Only save session info to localStorage for faster re-initialization if needed
    // But data itself is now cloud-only
    if (currentUser) {
      DatabaseService.saveLocalData({ currentUser });
    }
  }, [currentUser]);

  const fetchFamilyData = async (userId?: string) => {
    const targetUserId = userId || currentUser?.id;
    if (!targetUserId) return;

    console.log("Supabase: Refreshing all data from cloud...");
    try {
      // 1. Fetch Profile & Preferences
      const { data: profile } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', targetUserId)
        .single();

      if (profile) {
        if (profile.language) setLanguage(profile.language as Language);
        if (profile.time_format) setTimeFormat(profile.time_format as TimeFormat);
        if (profile.learning_mode !== undefined) setLearningMode(profile.learning_mode);

        // 2. If family exists, fetch children/tasks/rewards
        if (profile.family_id) {
          const { children: dbChildren, guardians: dbGuardians } = await DatabaseService.fetchFamilyData(profile.family_id);
          setChildren(dbChildren);
          // Flag current user among guardians
          const mappedGuardians = dbGuardians.map(g => ({
            ...g,
            isYou: g.id === targetUserId
          }));
          setGuardians(mappedGuardians);
        }
      }
    } catch (err) {
      console.error("Supabase: Sync error:", err);
    }
  };

  const handleLogout = async () => {
    console.log("Logout: Starting logout sequence...");
    setIsSyncing(true);
    setSyncStatus({ type: 'loading', message: language === 'es' ? 'Cerrando sesión...' : 'Logging out...' });

    try {
      // Don't let signOut hang the whole process
      await Promise.race([
        supabase.auth.signOut(),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Logout timeout')), 5000))
      ]);
      console.log("Logout: Supabase sign out successful.");
    } catch (err: any) {
      console.warn("Logout: Sign out warning/error:", err);
    } finally {
      // ALWAYS clear local state even if signOut fails or times out
      DatabaseService.clearSession();
      setCurrentUser(null);
      setChildren([]);
      setGuardians([]);

      // Clear syncing status
      // We do this here as a safety, though switching to AuthView 
      // will also hide the overlay.
      setIsSyncing(false);
      setSyncStatus(null);

      console.log("Logout: Local state cleared, redirected to Auth.");
    }
  };

  const uploadFamilyData = async (localChildren: Child[]) => {
    if (!currentUser?.familyId || localChildren.length === 0) return;

    setSyncStatus({ type: 'loading', message: language === 'es' ? 'Subiendo datos a la nube...' : 'Uploading data to cloud...' });
    setIsSyncing(true);
    console.log("Sync: Starting upload for family:", currentUser.familyId);

    try {
      for (const child of localChildren) {
        // Check if child already exists in Supabase to avoid duplicates
        const { data: existingChild, error: checkError } = await supabase
          .from('children')
          .select('id')
          .eq('id', child.id)
          .single();

        if (checkError && checkError.code !== 'PGRST116') {
           console.error("Sync Error: Failed to check child existence:", checkError);
           continue;
        }

        if (!existingChild) {
          console.log(`Sync: Uploading child ${child.name}...`);
          // Insert child
          const { error: childError } = await supabase
            .from('children')
            .insert([{
              id: child.id,
              family_id: currentUser.familyId,
              name: child.name,
              avatar: child.avatar,
              age: child.age,
              level: child.level,
              stars: child.stars,
              active: child.active,
              love_languages: child.loveLanguages || []
            }]);

          if (childError) {
            console.error("Sync Error: Failed to insert child:", child.name, childError);
            continue;
          }

          // Insert tasks
          if (child.tasks && child.tasks.length > 0) {
            const tasksToInsert = child.tasks.map(task => ({
              id: task.id,
              child_id: child.id,
              title: task.title,
              description: task.description,
              title_es: task.title_es,
              title_en: task.title_en,
              description_es: task.description_es,
              description_en: task.description_en,
              reward: task.reward,
              time: task.time,
              duration: task.duration,
              type: task.type,
              emoji: task.emoji,
              status: task.status,
              recurrence: task.recurrence,
              start_time: task.startTime,
              audio_pending_es: task.audio_pending_es,
              audio_pending_en: task.audio_pending_en,
              audio_active_es: task.audio_active_es,
              audio_active_en: task.audio_active_en,
              audio_done_es: task.audio_done_es,
              audio_done_en: task.audio_done_en
            }));

            const { error: taskError } = await supabase.from('tasks').upsert(tasksToInsert);
            if (taskError) console.error("Sync Error: Failed to insert tasks for:", child.name, taskError);
          }

          // Insert rewards
          if (child.rewards && child.rewards.length > 0) {
            const rewardsToInsert = child.rewards.map(reward => ({
              id: reward.id,
              child_id: child.id,
              title: reward.title,
              category: reward.category,
              cost: reward.cost,
              image: reward.image,
              type: reward.type
            }));

            const { error: rewardError } = await supabase.from('rewards').upsert(rewardsToInsert);
            if (rewardError) console.error("Sync Error: Failed to insert rewards for:", child.name, rewardError);
          }
        } else {
          console.log(`Sync: Updating child ${child.name}...`);
          const { error: updateError } = await supabase
            .from('children')
            .update({
              name: child.name,
              avatar: child.avatar,
              age: child.age,
              level: child.level,
              stars: child.stars,
              active: child.active,
              love_languages: child.loveLanguages || []
            })
            .eq('id', child.id);

          if (updateError) {
            console.error("Sync Error: Failed to update child:", child.name, updateError);
          }
        }
      }
      console.log("Sync: Upload complete!");
      setSyncStatus({ type: 'success', message: language === 'es' ? '¡Sincronización exitosa!' : 'Sync successful!' });
      setTimeout(() => { setIsSyncing(false); setSyncStatus(null); }, 3000);

      // Fetch again to ensure everything is in sync
      await fetchFamilyData();
    } catch (err: any) {
      console.error("Sync: Unexpected error in uploadFamilyData:", err);
      setSyncStatus({ type: 'error', message: language === 'es' ? 'Error al sincronizar: ' + err.message : 'Sync error: ' + err.message });
      setTimeout(() => { setIsSyncing(false); setSyncStatus(null); }, 5000);
    }
  };

  useEffect(() => {
    fetchFamilyData();
  }, [currentUser?.familyId]);

  // Auto-migrate localStorage data to Supabase on first login
  useEffect(() => {
    const triggerMigration = async () => {
      if (currentUser?.id && currentUser?.familyId && !isSyncing) {
        console.log("Migration: Checking for local data to migrate...");
        setSyncStatus({ type: 'loading', message: language === 'es' ? 'Sincronizando datos...' : 'Syncing data...' });
        setIsSyncing(true);

        const success = await migrateLocalStorageToSupabase(currentUser.id, currentUser.familyId);

        if (success) {
          setSyncStatus({ type: 'success', message: language === 'es' ? '¡Datos sincronizados!' : 'Data synced!' });
          // Refresh data from Supabase
          await fetchFamilyData();
        } else {
          setSyncStatus({ type: 'error', message: language === 'es' ? 'Error al sincronizar' : 'Sync error' });
        }

        setTimeout(() => {
          setIsSyncing(false);
          setSyncStatus(null);
        }, 2000);
      }
    };
    triggerMigration();
  }, [currentUser?.id, currentUser?.familyId]);

  const syncProfile = async (session: any) => {
    if (!session?.user) return null;

    try {
      console.log("Session: Syncing profile for:", session.user.id);

      // Use a timeout for the profile fetch
      const result = await Promise.race([
        supabase.from('profiles').select('*').eq('id', session.user.id).single(),
        new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Profile fetch timeout')), 12000))
      ]);

      const profile = result?.data;
      const selectError = result?.error;

      if (profile) {
        console.log("Session: Profile found.");
        return profile;
      }

      if (selectError && selectError.code !== 'PGRST116') {
        console.error("Session: Database error fetching profile:", selectError);
        throw selectError;
      }

      // If missing, create new one with timeout
      if (selectError && selectError.code === 'PGRST116' || !profile) {
        console.log("Session: Profile missing, creating new one...");
        const insertResult = await Promise.race([
          supabase.from('profiles').insert([{
            id: session.user.id,
            email: session.user.email,
            full_name: session.user.user_metadata?.full_name || session.user.email?.split('@')[0] || 'User',
            avatar_url: session.user.user_metadata?.avatar_url || `https://api.dicebear.com/7.x/avataaars/svg?seed=${session.user.id}`,
            language: language,
            time_format: timeFormat,
            learning_mode: learningMode
          }]).select().single(),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Profile creation timeout')), 12000))
        ]);

        if (insertResult?.error) throw insertResult.error;
        console.log("Session: Profile created successfully.");
        return insertResult?.data;
      }

      return null;
    } catch (err: any) {
      console.error("Session: syncProfile error:", err);
      if (err.message === 'Profile fetch timeout' || err.message === 'Profile creation timeout') {
        // Don't return a destructive fallback on timeout
        throw err;
      }
      // Fallback for other errors (like actual missing data if not caught earlier)
      return {
        id: session.user.id,
        full_name: session.user.user_metadata?.full_name || 'User',
        avatar_url: session.user.user_metadata?.avatar_url,
        family_id: undefined
      };
    }
  };

  useEffect(() => {
    let mounted = true;

    // Safety release: Never keep the loading spinner for more than 15 seconds
    const safetyTimer = setTimeout(() => {
      if (mounted && isCheckingAuth) {
        console.warn("Auth: Safety timeout reached, releasing UI spinner.");
        setIsCheckingAuth(false);
      }
    }, 15000);

    // Check for existing Supabase session
    const checkSession = async () => {
      try {
        console.log("Auth: Checking initial session...");

        // Timeout for initial session check
        const sessionResult = await Promise.race([
          supabase.auth.getSession(),
          new Promise<any>((_, reject) => setTimeout(() => reject(new Error('Session fetch timeout')), 12000))
        ]);

        const session = sessionResult?.data?.session;
        const sessionError = sessionResult?.error;

        if (sessionError) {
          console.error("Auth: getSession error:", sessionError);
          return;
        }

        if (session?.user && mounted) {
          console.log("Auth: Session found, syncing profile...");
          const profile = await syncProfile(session);

          if (profile && mounted) {
            const user: UserAccount = {
              email: session.user.email || '',
              name: profile.full_name || session.user.email?.split('@')[0] || 'User',
              avatar: profile.avatar_url,
              id: session.user.id,
              familyId: profile.family_id
            };
            setCurrentUser(user);
            fetchFamilyData(session.user.id);
          }
        }
      } catch (err) {
        console.error("Auth: Error in checkSession:", err);
      } finally {
        if (mounted) {
          setIsCheckingAuth(false);
          console.log("Auth: Session check finished.");
        }
      }
    };

    checkSession();

    // Listen for auth changes
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (!mounted) return;
      console.log(`Auth Event: ${event}`, session ? "Session present" : "No session");

      // Unlock UI immediately on sign out
      if (event === 'SIGNED_OUT') {
        setIsCheckingAuth(false);
      }

      try {
        if ((event === 'SIGNED_IN' || event === 'INITIAL_SESSION') && session) {
          console.log("Auth: Authenticated, syncing profile...");
          const profile = await syncProfile(session);
          if (profile && mounted) {
            const newUser = {
              email: session.user.email || '',
              name: profile.full_name || session.user.email?.split('@')[0] || 'User',
              avatar: profile.avatar_url,
              id: session.user.id,
              familyId: profile.family_id
            };
            console.log("Auth: Finalizing currentUser:", newUser.id, "Family:", newUser.familyId);
            console.log("Auth: Profile data from DB:", profile);
            setCurrentUser(newUser);
            if (newUser.familyId) {
              fetchFamilyData(session.user.id);
            }
          }
        } else if (event === 'SIGNED_OUT') {
          console.log("Auth: User signed out, clearing state.");
          DatabaseService.clearSession();
          setCurrentUser(null);
          setChildren([]);
          setGuardians([]);
        }
      } catch (err: any) {
        console.error("Auth: Error in auth change listener:", err);
        if (err.message?.includes('timeout')) {
          setSyncStatus({ type: 'error', message: language === 'es' ? 'Error de conexión (timeout)' : 'Connection timeout' });
          setTimeout(() => setSyncStatus(null), 5000);
        }
      }

      if (mounted && (event === 'INITIAL_SESSION' || event === 'SIGNED_IN' || event === 'SIGNED_OUT')) {
        setIsCheckingAuth(false);
      }
    });

    return () => {
      mounted = false;
      clearTimeout(safetyTimer);
      subscription.unsubscribe();
    };
  }, []);

  // Real-time synchronization
  useEffect(() => {
    if (!currentUser?.familyId) return;

    console.log("Supabase: Subscribing to real-time changes for family:", currentUser.familyId);

    const channel = supabase
      .channel('family_sync')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'profiles', filter: `family_id=eq.${currentUser.familyId}` },
        () => fetchFamilyData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'children', filter: `family_id=eq.${currentUser.familyId}` },
        () => fetchFamilyData()
      )
      // Note: We refresh regardless for tasks/rewards as they belong to children of this family
      // and RLS ensures we only see our own family's child data anyway.
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'tasks' },
        () => fetchFamilyData()
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'rewards' },
        () => fetchFamilyData()
      )
      .subscribe();

    return () => {
      console.log("Supabase: Unsubscribing from real-time changes.");
      supabase.removeChannel(channel);
    };
  }, [currentUser?.familyId]);

  // Task Notifications (Alarms)
  useEffect(() => {
    if (!("Notification" in window)) return;

    if (Notification.permission === "default") {
      Notification.requestPermission();
    }

    const checkAlarms = setInterval(() => {
      const now = new Date();
      const nowStr = now.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: true });

      children.forEach(child => {
        child.tasks.forEach(task => {
          if (task.status === 'pending' && task.time === nowStr) {
            // Trigger notification
            new Notification(`📅 ${child.name}: ${task.title}`, {
              body: task.description || (language === 'es' ? '¡Es hora de empezar!' : 'Time to start!'),
              icon: '/icon-192.png'
            });
            sounds.playNotification();
          }
        });
      });
    }, 60000); // Check every minute

    return () => clearInterval(checkAlarms);
  }, [children, language]);

  const handleJoinFamily = async (code: string) => {
    if (!currentUser?.id) return false;

    setIsSyncing(true);
    setSyncStatus({ type: 'loading', message: language === 'es' ? 'Uniéndose a la familia...' : 'Joining family...' });

    try {
      const familyId = await DatabaseService.joinFamily(currentUser.id, code);

      // Update local state
      setCurrentUser({ ...currentUser, familyId });

      // Success feedback
      setSyncStatus({ type: 'success', message: language === 'es' ? '¡Unido con éxito!' : 'Joined successfully!' });
      setTimeout(() => { setIsSyncing(false); setSyncStatus(null); }, 2000);

      return true;
    } catch (err: any) {
      console.error("Join Error:", err);
      setSyncStatus({ type: 'error', message: err.message });
      setTimeout(() => setSyncStatus(null), 3000);
      return false;
    } finally {
      setIsSyncing(false);
    }
  };

  const addChild = async (child: Child) => {
    const newChildren = [...children, child];
    setChildren(newChildren);
    // If user is logged in, sync this new child
    if (currentUser?.familyId) {
      console.log("App: Adding new child, trigger cloud sync...");
      await uploadFamilyData([child]);
    }
  };

  const updateChild = async (updatedChild: Child) => {
    setChildren(children.map(c => c.id === updatedChild.id ? updatedChild : c));
    if (currentUser?.familyId) {
      await uploadFamilyData([updatedChild]);
    }
  };

  const deleteChild = async (id: string) => {
    setChildren(children.filter(c => c.id !== id));
    if (currentUser?.familyId) {
      const { error } = await supabase.from('children').delete().eq('id', id);
      if (error) console.error("Error deleting child from DB:", error);
    }
  };

  const updatePreference = async (key: string, value: any) => {
    if (!currentUser?.id) return;
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ [key]: value })
        .eq('id', currentUser.id);
      if (error) console.error(`Error updating preference ${key}:`, error);
    } catch (err) {
      console.error(`Unexpected error updating preference ${key}:`, err);
    }
  };

  const setLanguageAndSync = (lang: Language) => {
    setLanguage(lang);
    updatePreference('language', lang);
  };

  const setTimeFormatAndSync = (fmt: TimeFormat) => {
    setTimeFormat(fmt);
    updatePreference('time_format', fmt);
  };

  const setLearningModeAndSync = (mode: boolean) => {
    setLearningMode(mode);
    updatePreference('learning_mode', mode);
  };

  const switchActiveChild = (id: string) => {
    setChildren(children.map(c => ({
      ...c,
      active: c.id === id
    })));
  };

  const addGuardian = (guardian: Guardian) => setGuardians([...guardians, guardian]);
  const updateGuardian = (updatedGuardian: Guardian) => setGuardians(guardians.map(g => g.id === updatedGuardian.id ? updatedGuardian : g));
  const deleteGuardian = async (id: string) => {
    // Optimistic UI update
    setGuardians(guardians.filter(g => g.id !== id));
    
    // Sync with Supabase (remove user from family)
    if (currentUser?.familyId) {
      try {
        const { error } = await supabase
          .from('profiles')
          .update({ family_id: null })
          .eq('id', id);
          
        if (error) {
          console.error("Error deleting guardian from DB:", error);
          // Only refetch if there was an error to revert UI
          fetchFamilyData(); 
        }
      } catch (err) {
        console.error("Unexpected error deleting guardian:", err);
      }
    }
  };

  const updateTaskStatus = async (childId: string, taskId: string, status: Task['status']) => {
    const updatedChildren = children.map(child => {
      if (child.id === childId) {
        const updatedTasks = child.tasks.map(task => {
          if (task.id === taskId) {
            const updatedTask = {
              ...task,
              status,
              startTime: status === 'active' ? Date.now() : task.startTime
            };
            // Sync task update
            if (currentUser?.familyId) {
              supabase.from('tasks').update({
                status: updatedTask.status,
                start_time: updatedTask.startTime
              }).eq('id', taskId).then(res => {
                if (res.error) console.error("Error updating task status in DB:", res.error);
              });
            }
            return updatedTask;
          }
          return task;
        });
        return { ...child, tasks: updatedTasks };
      }
      return child;
    });
    setChildren(updatedChildren);
  };

  const redeemReward = (childId: string, reward: Reward, note?: string) => {
    const activeChild = children.find(c => c.id === childId);
    if (!activeChild || activeChild.stars < reward.cost) {
      sounds.playError();
      return false;
    }

    const updatedChildren = children.map(child => {
      if (child.id === childId) {
        const newHistory = [
          {
            id: `redemption_${Date.now()}`,
            rewardId: reward.id,
            rewardTitle: reward.title,
            cost: reward.cost,
            timestamp: Date.now(),
            note
          },
          ...(child.redemptionHistory || [])
        ];

        const updatedChild = {
          ...child,
          stars: child.stars - reward.cost,
          redemptionHistory: newHistory
        };

        // Sync reward redemption
        if (currentUser?.familyId) {
          const redemptionData = newHistory[0];
          
          // 1. Update stars
          supabase.from('children').update({ stars: updatedChild.stars }).eq('id', childId).then(res => {
            if (res.error) console.error("Error updating child stars in DB:", res.error);
          });
          
          // 2. Insert redemption record
          supabase.from('redemption_history').insert([{
            id: redemptionData.id,
            child_id: childId,
            reward_id: redemptionData.rewardId,
            reward_title: redemptionData.rewardTitle,
            cost: redemptionData.cost,
            timestamp: redemptionData.timestamp,
            note: redemptionData.note
          }]).then(res => {
            if (res.error) console.error("Error inserting redemption record in DB:", res.error);
          });
        }

        return updatedChild;
      }
      return child;
    });

    setChildren(updatedChildren);
    sounds.playLevelUp();
    return true;
  };

  const handleAuthSuccess = (user: UserAccount) => {
    setCurrentUser(user);
    // fetchFamilyData will triggered by useEffect
  };

  if (isCheckingAuth) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!currentUser || !currentUser.familyId) {
    return <AuthView onAuthSuccess={handleAuthSuccess} language={language} currentUser={currentUser} />;
  }

  const activeChild = children.length > 0 ? (children.find(c => c.active) || children[0]) : null;

  return (
    <HashRouter>
      {isSyncing && syncStatus && (
        <div className={`fixed top-4 left-1/2 -translate-x-1/2 z-[200] px-6 py-3 rounded-2xl shadow-2xl flex items-center gap-3 transition-all animate-fade-in ${syncStatus.type === 'error' ? 'bg-red-500 text-white' :
          syncStatus.type === 'success' ? 'bg-green-500 text-white' :
            'bg-primary text-white'
          }`}>
          <span className={`material-symbols-outlined text-xl ${syncStatus.type === 'loading' ? 'animate-spin' : ''}`}>
            {syncStatus.type === 'error' ? 'error' : syncStatus.type === 'success' ? 'check_circle' : 'sync'}
          </span>
          <div className="flex flex-col">
            <span className="text-[10px] font-black uppercase tracking-widest opacity-80">
              {syncStatus.type === 'error' ? 'Cloud Sync Error' : syncStatus.type === 'success' ? 'Cloud Updated' : 'Cloud Sync'}
            </span>
            <span className="text-sm font-bold">{syncStatus.message}</span>
          </div>
        </div>
      )}
      <div className="max-w-md mx-auto min-h-screen bg-background-light dark:bg-background-dark relative shadow-xl">
        <Routes>
          <Route
            path="/"
            element={
              <ParentDashboard
                children={children}
                guardians={guardians}
                timeFormat={timeFormat}
                language={language}
                onTimeFormatChange={setTimeFormat}
                onUpdateChild={updateChild}
                onAddChild={addChild}
                onDeleteChild={deleteChild}
                onAddGuardian={addGuardian}
                onUpdateGuardian={updateGuardian}
                onDeleteGuardian={deleteGuardian}
                onSwitchChild={switchActiveChild}
                onAddTask={async (childId, task) => {
                  const targetChild = children.find(c => c.id === childId);
                  const taskWithAudio = targetChild ? await preGenerateTaskAudio(task, targetChild.name) : task;

                  setChildren(prev => prev.map(c => c.id === childId ? { ...c, tasks: [...c.tasks, taskWithAudio] } : c));
                  if (currentUser?.familyId) {
                    const { error } = await supabase.from('tasks').insert([{
                      id: taskWithAudio.id,
                      child_id: childId,
                      title: taskWithAudio.title,
                      description: taskWithAudio.description,
                      title_es: taskWithAudio.title_es,
                      title_en: taskWithAudio.title_en,
                      description_es: taskWithAudio.description_es,
                      description_en: taskWithAudio.description_en,
                      reward: taskWithAudio.reward,
                      time: taskWithAudio.time,
                      duration: taskWithAudio.duration,
                      type: taskWithAudio.type,
                      emoji: taskWithAudio.emoji,
                      status: taskWithAudio.status,
                      recurrence: taskWithAudio.recurrence,
                      audio_pending_es: taskWithAudio.audio_pending_es,
                      audio_pending_en: taskWithAudio.audio_pending_en,
                      audio_active_es: taskWithAudio.audio_active_es,
                      audio_active_en: taskWithAudio.audio_active_en,
                      audio_done_es: taskWithAudio.audio_done_es,
                      audio_done_en: taskWithAudio.audio_done_en,
                      start_time: taskWithAudio.startTime
                    }]);
                    if (error) console.error("Error syncing new task:", error);
                  }
                }}
                onAddTasks={async (childId, tasks) => {
                  const targetChild = children.find(c => c.id === childId);
                  const tasksWithAudio = targetChild
                    ? await Promise.all(tasks.map(t => preGenerateTaskAudio(t, targetChild.name)))
                    : tasks;

                  setChildren(prev => prev.map(c => c.id === childId ? { ...c, tasks: [...c.tasks, ...tasksWithAudio] } : c));
                  if (currentUser?.familyId) {
                    const tasksToInsert = tasksWithAudio.map(task => ({
                      id: task.id,
                      child_id: childId,
                      title: task.title,
                      description: task.description,
                      title_es: task.title_es,
                      title_en: task.title_en,
                      description_es: task.description_es,
                      description_en: task.description_en,
                      reward: task.reward,
                      time: task.time,
                      duration: task.duration,
                      type: task.type,
                      emoji: task.emoji,
                      status: task.status,
                      recurrence: task.recurrence,
                      audio_pending_es: task.audio_pending_es,
                      audio_pending_en: task.audio_pending_en,
                      audio_active_es: task.audio_active_es,
                      audio_active_en: task.audio_active_en,
                      audio_done_es: task.audio_done_es,
                      audio_done_en: task.audio_done_en,
                      start_time: task.startTime
                    }));
                    const { error } = await supabase.from('tasks').insert(tasksToInsert);
                    if (error) console.error("Error syncing batch tasks:", error);
                  }
                }}
                onUpdateTask={async (childId, task) => {
                  const targetChild = children.find(c => c.id === childId);
                  const oldTask = targetChild?.tasks.find(t => t.id === task.id);
                  const needsNewAudio = !oldTask || oldTask.title !== task.title || oldTask.description !== task.description;

                  const taskToSave = (needsNewAudio && targetChild)
                    ? await preGenerateTaskAudio(task, targetChild.name)
                    : task;

                  setChildren(prev => prev.map(c => c.id === childId ? { ...c, tasks: c.tasks.map(t => t.id === task.id ? taskToSave : t) } : c));
                  if (currentUser?.familyId) {
                    const { error } = await supabase.from('tasks').update({
                      title: taskToSave.title,
                      description: taskToSave.description,
                      title_es: taskToSave.title_es,
                      title_en: taskToSave.title_en,
                      description_es: taskToSave.description_es,
                      description_en: taskToSave.description_en,
                      reward: taskToSave.reward,
                      time: taskToSave.time,
                      duration: taskToSave.duration,
                      type: taskToSave.type,
                      emoji: taskToSave.emoji,
                      status: taskToSave.status,
                      recurrence: taskToSave.recurrence,
                      audio_pending_es: taskToSave.audio_pending_es,
                      audio_pending_en: taskToSave.audio_pending_en,
                      audio_active_es: taskToSave.audio_active_es,
                      audio_active_en: taskToSave.audio_active_en,
                      audio_done_es: taskToSave.audio_done_es,
                      audio_done_en: taskToSave.audio_done_en,
                      start_time: taskToSave.startTime
                    }).eq('id', task.id);
                    if (error) console.error("Error updating task in DB:", error);
                  }
                }}
                onDeleteTask={async (childId, taskId) => {
                  setChildren(children.map(c => c.id === childId ? { ...c, tasks: c.tasks.filter(t => t.id !== taskId) } : c));
                  if (currentUser?.familyId) {
                    const { error } = await supabase.from('tasks').delete().eq('id', taskId);
                    if (error) console.error("Error deleting task from DB:", error);
                  }
                }}
                onAddReward={async (childId, reward) => {
                  setChildren(prev => prev.map(c => c.id === childId ? { ...c, rewards: [...(c.rewards || []), reward] } : c));
                  if (currentUser?.familyId) {
                    const { error } = await supabase.from('rewards').insert([{
                      id: reward.id,
                      child_id: childId,
                      title: reward.title,
                      category: reward.category,
                      cost: reward.cost,
                      image: reward.image,
                      type: reward.type
                    }]);
                    if (error) console.error("Error syncing new reward:", error);
                  }
                }}
                onUpdateReward={async (childId, reward) => {
                  setChildren(children.map(c => c.id === childId ? { ...c, rewards: (c.rewards || []).map(r => r.id === reward.id ? reward : r) } : c));
                  if (currentUser?.familyId) {
                    const { error } = await supabase.from('rewards').update(reward).eq('id', reward.id);
                    if (error) console.error("Error updating reward in DB:", error);
                  }
                }}
                onDeleteReward={async (childId, rewardId) => {
                  setChildren(children.map(c => c.id === childId ? { ...c, rewards: (c.rewards || []).filter(r => r.id !== rewardId) } : c));
                  if (currentUser?.familyId) {
                    const { error } = await supabase.from('rewards').delete().eq('id', rewardId);
                    if (error) console.error("Error deleting reward from DB:", error);
                  }
                }}
              />
            }
          />
          <Route
            path="/child"
            element={
              <ChildPortal
                tasks={activeChild?.tasks || []}
                children={children}
                timeFormat={timeFormat}
                language={language}
                learningMode={learningMode}
                onUpdateTask={(taskId, status) => activeChild && updateTaskStatus(activeChild.id, taskId, status)}
                onSwitchChild={switchActiveChild}
              />
            }
          />
          <Route
            path="/rewards"
            element={
              <RewardsCatalog
                children={children}
                language={language}
                onSwitchChild={switchActiveChild}
                onRedeemReward={redeemReward}
              />
            }
          />
          <Route
            path="/settings"
            element={
              <ParentSettings
                currentUser={currentUser}
                children={children}
                guardians={guardians}
                language={language}
                timeFormat={timeFormat}
                learningMode={learningMode}
                onLearningModeChange={setLearningModeAndSync}
                onLanguageChange={setLanguageAndSync}
                onTimeFormatChange={setTimeFormatAndSync}
                onAddChild={addChild}
                onUpdateChild={updateChild}
                onDeleteChild={deleteChild}
                onAddGuardian={addGuardian}
                onUpdateGuardian={updateGuardian}
                onDeleteGuardian={deleteGuardian}
                onSyncData={() => children.length > 0 && uploadFamilyData(children)}
                onJoinFamily={handleJoinFamily}
                onLogout={handleLogout}
              />
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </HashRouter>
  );
};

export default App;
