
export enum ViewMode {
  DAY = 'day',
  THREE_DAY = '3day'
}

export type TimeFormat = '12h' | '24h';
export type Language = 'en' | 'es';
export type LoveLanguage = 'physical_touch' | 'words_of_affirmation' | 'quality_time' | 'gifts' | 'acts_of_service';

export type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'none';

export interface TaskRecurrence {
  frequency: RecurrenceFrequency;
  days: number[]; // 0 for Sunday, 1 for Monday, etc. (for weekly)
  dayOfMonth?: number; // for monthly
  endDate?: string;
}

export interface Task {
  id: string;
  title: string;
  description: string;
  reward: number; // Represents the number of stars to earn
  time: string;
  duration?: string; // Duration in minutes or descriptive string
  startTime?: number; // Timestamp when the task was started
  type: 'routine' | 'school' | 'activity' | 'hygiene';
  status: 'pending' | 'active' | 'done';
  emoji: string;
  recurrence?: TaskRecurrence;
  audio_pending_es?: string;
  audio_pending_en?: string;
  audio_active_es?: string;
  audio_active_en?: string;
  audio_done_es?: string;
  audio_done_en?: string;
}

export interface Reward {
  id: string;
  title: string;
  category: string;
  cost: number;
  image: string;
  type: 'screen' | 'toy' | 'treat';
}

export interface RedemptionRecord {
  id: string;
  rewardId: string;
  rewardTitle: string;
  cost: number;
  timestamp: number;
  note?: string;
}

export interface Child {
  id: string;
  name: string;
  age?: number;
  level: number;
  stars: number;
  avatar: string;
  active: boolean;
  rewards: Reward[];
  tasks: Task[];
  loveLanguages?: LoveLanguage[];
  redemptionHistory?: RedemptionRecord[];
}

export interface Guardian {
  id: string;
  name: string;
  role: 'Admin' | 'Co-Parent' | 'Guardian';
  avatar?: string;
  isYou?: boolean;
  email?: string;
}

export interface Invitation {
  id: string;
  code: string;
  role: Guardian['role'];
  expiresAt: string;
  status: 'pending' | 'accepted' | 'expired';
}
