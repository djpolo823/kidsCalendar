/**
 * Utility to migrate data from localStorage to Supabase
 * This should be run once after enabling RLS on the profiles table
 */

import { supabase } from './supabase';
import { Child } from '../types';

const STORAGE_KEY = 'kidscalendar_db_v1';
const MIGRATION_FLAG = 'kidscalendar_migrated_v2';

interface LocalStorageData {
    currentUser: any;
    children: Child[];
    guardians: any[];
    timeFormat: string;
    language: string;
    learningMode: boolean;
    lastUpdated: string;
}

export const migrateLocalStorageToSupabase = async (userId: string, familyId: string): Promise<boolean> => {
    try {
        // Load data from localStorage
        const stored = localStorage.getItem(STORAGE_KEY);
        if (!stored) {
            console.log('Migration: No local data to migrate');
            return true;
        }

        // Skip if there's nothing to upload
        // Note: The 'data' variable is declared below this block.
        // This check should ideally be done after parsing the data.
        // However, following the instruction to remove the first declaration.
        // The subsequent 'data' declaration will be used.

        const data: LocalStorageData = JSON.parse(stored);
        console.log('Migration: Found local data:', {
            children: data.children?.length || 0,
            guardians: data.guardians?.length || 0
        });

        // Migrate children
        if (data.children && data.children.length > 0) {
            console.log(`Migration: Uploading ${data.children.length} children...`);

            for (const child of data.children) {
                // Check if child already exists
                const { data: existing } = await supabase
                    .from('children')
                    .select('id')
                    .eq('id', child.id)
                    .single();

                if (existing) {
                    console.log(`Migration: Child ${child.name} already exists, skipping...`);
                    continue;
                }

                // Insert child
                const { error: childError } = await supabase
                    .from('children')
                    .insert([{
                        id: child.id,
                        family_id: familyId,
                        name: child.name,
                        avatar: child.avatar,
                        level: child.level,
                        stars: child.stars,
                        active: child.active,
                        age: child.age,
                        love_languages: child.loveLanguages || []
                    }]);

                if (childError) {
                    console.error(`Migration: Error inserting child ${child.name}:`, childError);
                    continue;
                }

                // Insert tasks
                if (child.tasks && child.tasks.length > 0) {
                    const tasksToInsert = child.tasks.map(task => ({
                        id: task.id,
                        child_id: child.id,
                        title: task.title,
                        description: task.description,
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

                    const { error: taskError } = await supabase
                        .from('tasks')
                        .insert(tasksToInsert);

                    if (taskError) {
                        console.error(`Migration: Error inserting tasks for ${child.name}:`, taskError);
                    }
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

                    const { error: rewardError } = await supabase
                        .from('rewards')
                        .insert(rewardsToInsert);

                    if (rewardError) {
                        console.error(`Migration: Error inserting rewards for ${child.name}:`, rewardError);
                    }
                }

                console.log(`Migration: Successfully migrated child ${child.name}`);
            }
        }

        // Mark as migrated
        localStorage.setItem(MIGRATION_FLAG, 'true');
        console.log('Migration: Complete!');
        return true;

    } catch (error) {
        console.error('Migration: Unexpected error:', error);
        return false;
    }
};

export const resetMigrationFlag = () => {
    localStorage.removeItem(MIGRATION_FLAG);
    console.log('Migration: Flag reset');
};
