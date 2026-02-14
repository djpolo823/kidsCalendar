
import React, { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Child, Task, Guardian, Reward, TimeFormat, Language, TaskRecurrence, RecurrenceFrequency, LoveLanguage } from '../types';
import SideMenu from '../components/SideMenu';
import { sounds } from '../services/soundService';
import { t } from '../services/i18n';
import { generateBulkTasks, generateRewardSuggestions, RewardSuggestion } from '../services/geminiService';

interface Props {
  children: Child[];
  guardians: Guardian[];
  timeFormat: TimeFormat;
  language: Language;
  onTimeFormatChange: (format: TimeFormat) => void;
  onUpdateChild: (child: Child) => void;
  onAddChild: (child: Child) => void;
  onDeleteChild: (id: string) => void;
  onAddGuardian: (guardian: Guardian) => void;
  onUpdateGuardian: (guardian: Guardian) => void;
  onDeleteGuardian: (id: string) => void;
  onSwitchChild: (id: string) => void;
  onAddTask: (childId: string, task: Task) => void;
  onAddTasks: (childId: string, tasks: Task[]) => void;
  onUpdateTask: (childId: string, task: Task) => void;
  onDeleteTask: (childId: string, id: string) => void;
  onAddReward: (childId: string, reward: Reward) => void;
  onUpdateReward: (childId: string, reward: Reward) => void;
  onDeleteReward: (childId: string, rewardId: string) => void;
}

interface TableRow {
  time: string;
  title: string;
  description: string;
  duration: string;
}

interface ValidationError {
  index: number;
  field: string;
  message: string;
}

const MAX_TITLE_LENGTH = 35;

const formatTitleAndDescription = (title: string, description: string = '') => {
  if (title.length > MAX_TITLE_LENGTH) {
    return {
      displayTitle: title.substring(0, MAX_TITLE_LENGTH).trim() + '...',
      displayDescription: title + (description ? '\n' + description : '')
    };
  }
  return { displayTitle: title, displayDescription: description };
};

const isValidTime = (timeStr: string): boolean => {
  const clean = timeStr.trim().toUpperCase();
  const time12hRegex = /^(0?[1-9]|1[0-2]):[0-5][0-9]\s?(AM|PM)$/;
  const time24hRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
  return time12hRegex.test(clean) || time24hRegex.test(clean);
};

const isValidDuration = (dur: string): boolean => {
  const n = Number(dur);
  return !isNaN(n) && n > 0 && n < 1440; // Max 24h
};

const parseTimeToMinutes = (timeStr: string | undefined | null): number => {
  if (!timeStr) return 0;
  try {
    const clean = timeStr.trim().toUpperCase();
    const is12h = clean.includes('AM') || clean.includes('PM');

    if (is12h) {
      const parts = clean.split(/\s+/);
      const timeParts = parts[0].split(':');
      let hours = Number(timeParts[0]);
      let minutes = Number(timeParts[1] || 0);
      const period = parts[1] || (hours >= 12 ? 'PM' : 'AM');

      if (period === 'PM' && hours < 12) hours += 12;
      if (period === 'AM' && hours === 12) hours = 0;
      return hours * 60 + (minutes || 0);
    } else {
      const parts = clean.split(':');
      const hours = Number(parts[0]);
      const minutes = Number(parts[1] || 0);
      return (hours || 0) * 60 + (minutes || 0);
    }
  } catch (e) {
    return 0;
  }
};

const minutesToInternalString = (mins: number, format: TimeFormat): string => {
  const h = Math.floor(mins / 60) % 24;
  const m = mins % 60;
  const pad = (n: number) => n.toString().padStart(2, '0');

  if (format === '24h') {
    return `${pad(h)}:${pad(m)}`;
  } else {
    const period = h >= 12 ? 'PM' : 'AM';
    const h12 = h % 12 || 12;
    return `${pad(h12)}:${pad(m)} ${period}`;
  }
};

const displayTime = (timeStr: string | undefined | null, format: TimeFormat): string => {
  const mins = parseTimeToMinutes(timeStr);
  return minutesToInternalString(mins, format);
};

const ParentDashboard: React.FC<Props> = ({
  children,
  timeFormat,
  language,
  onAddTask,
  onAddTasks,
  onUpdateTask,
  onDeleteTask,
  onAddReward,
  onUpdateReward,
  onDeleteReward
}) => {
  const navigate = useNavigate();

  const [dashboardChildId, setDashboardChildId] = useState<string>(children[0]?.id || '');
  const [currentTime, setCurrentTime] = useState(new Date());

  // Update clock every minute for highlighting
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 60000);
    return () => clearInterval(timer);
  }, []);

  const selectedChild = children.find(c => c.id === dashboardChildId) || children[0];

  const [activeTab, setActiveTab] = useState<'schedule' | 'rewards'>('schedule');
  const [isMenuOpen, setIsMenuOpen] = useState(false);

  const [isAddingTask, setIsAddingTask] = useState(false);
  const [isImporting, setIsImporting] = useState(false);
  const [isTableImporting, setIsTableImporting] = useState(false);
  const [importPrompt, setImportPrompt] = useState('');
  const [validationErrors, setValidationErrors] = useState<ValidationError[]>([]);
  const [draggedTaskId, setDraggedTaskId] = useState<string | null>(null);
  const [confirmMove, setConfirmMove] = useState<{ task: Task, newTime: string } | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [triedToSave, setTriedToSave] = useState(false);

  const [newTask, setNewTask] = useState<Task>({
    id: '', title: '', description: '', reward: 5, time: '09:00 AM', duration: '30', type: 'routine', status: 'pending', emoji: '🌟'
  });

  const [tableRows, setTableRows] = useState<TableRow[]>([
    { time: '08:00 AM', title: '', description: '', duration: '30' },
    { time: '09:00 AM', title: '', description: '', duration: '30' },
    { time: '10:00 AM', title: '', description: '', duration: '30' },
    { time: '11:00 AM', title: '', description: '', duration: '30' },
    { time: '12:00 PM', title: '', description: '', duration: '30' }
  ]);

  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFrequency>('none');
  const [recurrenceDays, setRecurrenceDays] = useState<number[]>([]);
  const [recurrenceEndDate, setRecurrenceEndDate] = useState<string>('');
  const [recurrenceDayOfMonth, setRecurrenceDayOfMonth] = useState<number>(1);

  const [isRewardModalOpen, setIsRewardModalOpen] = useState(false);
  const [editingReward, setEditingReward] = useState<Reward | null>(null);
  const [rewardForm, setRewardForm] = useState<Omit<Reward, 'id'>>({
    title: '', category: 'Toys', cost: 10, image: '', type: 'toy'
  });

  const [suggestions, setSuggestions] = useState<RewardSuggestion[]>([]);
  const [selectedSuggestion, setSelectedSuggestion] = useState<RewardSuggestion | null>(null);
  const [isSuggestionsModalOpen, setIsSuggestionsModalOpen] = useState(false);
  const [isGeneratingSuggestions, setIsGeneratingSuggestions] = useState(false);

  const handleEditTaskRequest = (task: Task) => {
    setEditingTaskId(task.id);
    setNewTask({ ...task });
    setRecurrenceFreq(task.recurrence?.frequency || 'none');
    setRecurrenceDays(task.recurrence?.days || []);
    setRecurrenceEndDate(task.recurrence?.endDate || '');
    setRecurrenceDayOfMonth(task.recurrence?.dayOfMonth || 1);
    setTriedToSave(false);
    setIsAddingTask(true);
  };

  const toggleRecurrenceDay = (day: number) => {
    setRecurrenceDays(prev =>
      prev.includes(day) ? prev.filter(d => d !== day) : [...prev, day].sort()
    );
  };

  const handleSaveTask = () => {
    if (!selectedChild) return;
    setTriedToSave(true);
    if (!newTask.title.trim()) return;
    if (!isValidTime(newTask.time)) return;
    if (!isValidDuration(newTask.duration || '0')) return;

    const recurrence: TaskRecurrence | undefined = recurrenceFreq !== 'none' ? {
      frequency: recurrenceFreq,
      days: recurrenceFreq === 'weekly' ? recurrenceDays : [],
      dayOfMonth: recurrenceFreq === 'monthly' ? recurrenceDayOfMonth : undefined,
      endDate: recurrenceEndDate || undefined
    } : undefined;

    const taskData: Task = { ...newTask, recurrence };

    if (editingTaskId) {
      onUpdateTask(selectedChild.id, { ...taskData, id: editingTaskId });
    } else {
      onAddTask(selectedChild.id, { ...taskData, id: `task_${Date.now()}` });
    }

    setIsAddingTask(false);
    setEditingTaskId(null);
    resetTaskState();
  };

  const resetTaskState = () => {
    setNewTask({ id: '', title: '', description: '', reward: 5, time: '09:00 AM', duration: '30', type: 'routine', status: 'pending', emoji: '🌟' });
    setRecurrenceFreq('none');
    setRecurrenceDays([]);
    setRecurrenceEndDate('');
    setRecurrenceDayOfMonth(1);
    setTriedToSave(false);
  };

  const handleBulkImport = async () => {
    if (!importPrompt.trim() || !selectedChild) return;
    setIsGenerating(true);
    sounds.playClick();
    try {
      const generated = await generateBulkTasks(importPrompt, language);
      const tasksToAdd = generated.map(t => {
        const { displayTitle, displayDescription } = formatTitleAndDescription(t.title || '', t.description || '');
        return {
          ...t,
          title: displayTitle,
          description: displayDescription,
          id: `bulk_${Date.now()}_${Math.random()}`,
          status: 'pending',
        } as Task;
      });
      onAddTasks(selectedChild.id, tasksToAdd);
      setIsGenerating(false);
      setIsImporting(false);
      setImportPrompt('');
      sounds.playSuccess();
    } catch (e) {
      console.error(e);
      setIsGenerating(false);
    }
  };

  const handleSaveTableImport = () => {
    if (!selectedChild) return;
    const validRows = tableRows.filter(r => r.title.trim() || r.time.trim());
    if (validRows.length === 0) return;

    const errors: ValidationError[] = [];
    validRows.forEach((row, idx) => {
      if (!row.title.trim()) errors.push({ index: idx + 1, field: 'Activity', message: 'Title is required' });
      if (!isValidTime(row.time)) errors.push({ index: idx + 1, field: 'Time', message: 'Invalid format (Use 08:00 AM or 14:00)' });
      if (!isValidDuration(row.duration)) errors.push({ index: idx + 1, field: 'Duration', message: 'Must be a positive number' });
    });

    if (errors.length > 0) {
      setValidationErrors(errors);
      sounds.playStart();
      return;
    }

    sounds.playClick();
    const tasksToAdd = validRows.map((row, index) => {
      const { displayTitle, displayDescription } = formatTitleAndDescription(row.title, row.description);
      return {
        id: `table_${Date.now()}_${index}_${Math.random()}`,
        time: row.time,
        title: displayTitle,
        description: displayDescription,
        duration: row.duration || '30',
        reward: 5, emoji: '📅', type: 'routine', status: 'pending'
      } as Task;
    });

    onAddTasks(selectedChild.id, tasksToAdd);

    setIsTableImporting(false);
    setTableRows([
      { time: '08:00 AM', title: '', description: '', duration: '30' },
      { time: '09:00 AM', title: '', description: '', duration: '30' },
      { time: '10:00 AM', title: '', description: '', duration: '30' },
      { time: '11:00 AM', title: '', description: '', duration: '30' },
      { time: '12:00 PM', title: '', description: '', duration: '30' }
    ]);
    sounds.playSuccess();
  };

  /**
   * Enhanced Paste logic:
   * Handles multi-column, multi-row data from Excel/Spreadsheets.
   * Identifies which cell is focused to start the paste from there.
   */
  const handleSpreadsheetPaste = (e: React.ClipboardEvent, rowIndex: number, colIndex: number) => {
    e.preventDefault();
    const pasteData = e.clipboardData.getData('text');
    if (!pasteData) return;

    // Split rows by newline and columns by tab
    const rows = pasteData.split(/\r?\n/).filter(r => r.trim());
    const newTableRows = [...tableRows];

    rows.forEach((rowStr, rOffset) => {
      const cols = rowStr.split('\t');
      const targetRowIndex = rowIndex + rOffset;

      // Extend table if needed
      if (targetRowIndex >= newTableRows.length) {
        newTableRows.push({ time: '', title: '', description: '', duration: '30' });
      }

      const currentRow = newTableRows[targetRowIndex];

      // Map pasted columns starting from the focused column
      cols.forEach((value, cOffset) => {
        const targetColIndex = colIndex + cOffset;
        const cleanValue = value.trim();

        switch (targetColIndex) {
          case 0: currentRow.time = cleanValue; break;
          case 1: currentRow.title = cleanValue; break;
          case 2: currentRow.description = cleanValue; break;
          case 3: currentRow.duration = cleanValue; break;
        }
      });
    });

    setTableRows(newTableRows);
    sounds.playSuccess();
  };

  const addTableRow = () => {
    const lastRowTime = tableRows.length > 0 ? tableRows[tableRows.length - 1].time : '08:00 AM';
    const lastMins = parseTimeToMinutes(lastRowTime);
    const nextTime = minutesToInternalString(lastMins + 60, timeFormat);

    setTableRows([...tableRows, { time: nextTime, title: '', description: '', duration: '30' }]);
    sounds.playClick();
  };

  const removeTableRow = (index: number) => {
    setTableRows(tableRows.filter((_, i) => i !== index));
    sounds.playClick();
  };

  const handleNav = (path: string) => {
    sounds.playClick();
    navigate(path);
  }

  const onDragStart = (e: React.DragEvent, taskId: string) => {
    setDraggedTaskId(taskId);
    e.dataTransfer.effectAllowed = 'move';
  };

  const onDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
  };

  const onDropOnTask = (e: React.DragEvent, targetTask: Task) => {
    e.preventDefault();
    if (!draggedTaskId || draggedTaskId === targetTask.id || !selectedChild) return;
    const taskToMove = selectedChild.tasks.find(t => t.id === draggedTaskId);
    if (taskToMove) {
      setConfirmMove({ task: taskToMove, newTime: targetTask.time });
      sounds.playClick();
    }
    setDraggedTaskId(null);
  };

  const confirmTimeMove = () => {
    if (confirmMove && selectedChild) {
      onUpdateTask(selectedChild.id, { ...confirmMove.task, time: confirmMove.newTime });
      sounds.playSuccess();
      setConfirmMove(null);
    }
  };

  const openAddReward = () => {
    if (!selectedChild) return;
    setEditingReward(null);
    setRewardForm({ title: '', category: 'Toys', cost: 10, image: `https://picsum.photos/seed/${Date.now()}/300/300`, type: 'toy' });
    setIsRewardModalOpen(true);
    sounds.playClick();
  };

  const openEditReward = (reward: Reward) => {
    if (!selectedChild) return;
    setEditingReward(reward);
    setRewardForm({ title: reward.title, category: reward.category, cost: reward.cost, image: reward.image, type: reward.type });
    setIsRewardModalOpen(true);
    sounds.playClick();
  };

  const saveReward = () => {
    if (!selectedChild || !rewardForm.title.trim()) return;
    if (editingReward) {
      onUpdateReward(selectedChild.id, { ...rewardForm, id: editingReward.id });
    } else {
      onAddReward(selectedChild.id, { ...rewardForm, id: `r_${Date.now()}` });
    }
    setIsRewardModalOpen(false);
  };

  const handleGetSuggestions = async () => {
    if (!selectedChild) return;
    setIsGeneratingSuggestions(true);
    setIsSuggestionsModalOpen(true);
    setSelectedSuggestion(null);
    sounds.playClick();

    try {
      const ideas = await generateRewardSuggestions(
        selectedChild.name,
        selectedChild.age || 7,
        selectedChild.loveLanguages || [],
        language
      );
      setSuggestions(ideas);
    } catch (error) {
      console.error("Error fetching suggestions:", error);
    } finally {
      setIsGeneratingSuggestions(false);
    }
  };

  const handleAcceptSuggestion = (suggestion: RewardSuggestion) => {
    if (!selectedChild) return;
    onAddReward(selectedChild.id, {
      id: `r_sug_${Date.now()}`,
      title: suggestion.title,
      category: suggestion.category,
      cost: suggestion.cost,
      type: suggestion.type,
      image: `https://picsum.photos/seed/${suggestion.title}/300/300`
    });
    setSuggestions(prev => prev.filter(s => s.title !== suggestion.title));
    setSelectedSuggestion(null);
    sounds.playSuccess();
  };

  const sortedTasks = selectedChild ? [...selectedChild.tasks].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time)) : [];

  const activeTaskNow = React.useMemo(() => {
    if (!sortedTasks.length) return null;
    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    return sortedTasks.find(task => {
      const startMins = parseTimeToMinutes(task.time);
      const durMins = parseInt(task.duration || '0');
      const endMins = startMins + durMins;
      return nowMinutes >= startMins && nowMinutes < endMins;
    });
  }, [sortedTasks, currentTime]);

  const getGoogleCalendarUrl = (task: Task, childName: string) => {
    const baseUrl = 'https://www.google.com/calendar/render?action=TEMPLATE';
    const text = encodeURIComponent(`${childName}: ${task.title} ${task.emoji}`);
    const details = encodeURIComponent(task.description || '');

    // Convert current date + task time to Google Calendar format (YYYYMMDDTHHMMSSZ)
    const now = new Date();
    const [hStr, mStr] = task.time.split(/:| /);
    let hours = parseInt(hStr || '0');
    const minutes = parseInt(mStr || '0');
    if (task.time.includes('PM') && hours < 12) hours += 12;
    if (task.time.includes('AM') && hours === 12) hours = 0;

    const startDate = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hours, minutes);
    const endDate = new Date(startDate.getTime() + (parseInt(task.duration || '30') * 60000));

    const formatGDate = (date: Date) => date.toISOString().replace(/-|:|\.\d\d\d/g, '');
    const dates = `${formatGDate(startDate)}/${formatGDate(endDate)}`;
    return `${baseUrl}&text=${text}&details=${details}&dates=${dates}`;
  };

  const weekDays = ['S', 'M', 'T', 'W', 'T', 'F', 'S'];

  const titleError = triedToSave && !newTask.title.trim();
  const timeError = triedToSave && !isValidTime(newTask.time);
  const durationError = triedToSave && !isValidDuration(newTask.duration || '');

  return (
    <div className="pb-24 animate-fade-in min-h-screen bg-background-light dark:bg-background-dark text-display">
      <SideMenu isOpen={isMenuOpen} onClose={() => setIsMenuOpen(false)} language={language} />

      <header className="sticky top-0 z-50 flex flex-col bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center p-4 pb-2 justify-between">
          <div className="w-12 h-12 flex items-center justify-center">
            <span className="material-symbols-outlined text-text-main-light dark:text-text-main-dark cursor-pointer" onClick={() => { sounds.playClick(); setIsMenuOpen(true); }}>menu</span>
          </div>
          <h2 className="text-text-main-light dark:text-text-main-dark text-xl font-extrabold flex-1 text-center truncate px-2">{t('parentDashboard', language)}</h2>
          <div className="w-12 h-12 flex items-center justify-center">
            <button onClick={() => handleNav('/settings')} className="p-2 text-primary">
              <span className="material-symbols-outlined">settings</span>
            </button>
          </div>
        </div>

        <div className="px-6 pb-2 pt-2 border-t border-slate-50 dark:border-slate-800/30 flex items-center gap-3 overflow-x-auto no-scrollbar">
          {children.map(child => (
            <button
              key={child.id}
              onClick={() => { sounds.playClick(); setDashboardChildId(child.id); }}
              className={`flex-shrink-0 flex items-center gap-2 px-3 py-1.5 rounded-full transition-all border ${dashboardChildId === child.id ? 'bg-primary/10 border-primary shadow-sm' : 'bg-transparent border-transparent opacity-40 grayscale'}`}
            >
              <img src={child.avatar} alt={child.name} className="size-6 rounded-full object-cover" />
              <span className={`text-[10px] font-black uppercase tracking-tight ${dashboardChildId === child.id ? 'text-primary-dark' : 'text-slate-400'}`}>{child.name}</span>
            </button>
          ))}
        </div>

        <div className="px-6 pb-4 pt-2">
          <div className="bg-slate-100 dark:bg-slate-900 p-1 rounded-2xl flex relative h-12 items-center">
            <button onClick={() => { sounds.playClick(); setActiveTab('schedule'); }} className={`flex-1 h-full z-10 text-xs font-black uppercase tracking-widest transition-colors ${activeTab === 'schedule' ? 'text-text-main-light' : 'text-slate-400'}`}>{t('dailySchedule', language)}</button>
            <button onClick={() => { sounds.playClick(); setActiveTab('rewards'); }} className={`flex-1 h-full z-10 text-xs font-black uppercase tracking-widest transition-colors ${activeTab === 'rewards' ? 'text-text-main-light' : 'text-slate-400'}`}>{t('rewardsHub', language)}</button>
            <div className={`absolute top-1 bottom-1 w-[calc(50%-4px)] bg-white dark:bg-surface-dark rounded-xl shadow-sm transition-transform duration-300 ${activeTab === 'rewards' ? 'translate-x-full' : 'translate-x-0'}`}></div>
          </div>
        </div>
      </header>

      {confirmMove && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setConfirmMove(null)}></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-[2.5rem] p-8 shadow-2xl animate-fade-in border-4 border-primary/20">
            <div className="flex items-center gap-3 mb-4 text-primary">
              <span className="material-symbols-outlined text-3xl">schedule_send</span>
              <h3 className="text-xl font-black">{language === 'es' ? 'Mover Actividad' : 'Move Activity'}</h3>
            </div>
            <p className="text-sm font-bold dark:text-white mb-6">
              {language === 'es' ? `¿Quieres mover "${confirmMove.task.title}" a las ${displayTime(confirmMove.newTime, timeFormat)}?` : `Do you want to move "${confirmMove.task.title}" to ${displayTime(confirmMove.newTime, timeFormat)}?`}
            </p>
            <div className="flex gap-4">
              <button onClick={() => setConfirmMove(null)} className="flex-1 py-4 font-bold text-slate-400">{t('cancel', language)}</button>
              <button onClick={confirmTimeMove} className="flex-1 py-4 bg-primary text-text-main-light font-black rounded-2xl shadow-lg">{t('continue', language)}</button>
            </div>
          </div>
        </div>
      )}

      {validationErrors.length > 0 && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setValidationErrors([])} ></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-[2.5rem] p-8 shadow-2xl animate-fade-in border-4 border-red-500/20">
            <div className="flex items-center gap-3 mb-4 text-red-500">
              <span className="material-symbols-outlined text-3xl">error</span>
              <h3 className="text-xl font-black">{language === 'es' ? 'Error de Formato' : 'Format Errors'}</h3>
            </div>
            <p className="text-xs text-slate-500 font-bold mb-4 uppercase tracking-widest">{language === 'es' ? 'Corrige las siguientes filas:' : 'Please fix the following rows:'}</p>
            <div className="max-h-48 overflow-y-auto space-y-2 mb-6 no-scrollbar">
              {validationErrors.map((err, i) => (
                <div key={i} className="bg-red-50 dark:bg-red-900/10 p-3 rounded-xl border border-red-100 dark:border-red-900/20">
                  <p className="text-[10px] font-black text-red-600 dark:text-red-400 uppercase tracking-tighter">Row {err.index} • {err.field}</p>
                  <p className="text-sm font-bold dark:text-white">{err.message}</p>
                </div>
              ))}
            </div>
            <button onClick={() => setValidationErrors([])} className="w-full py-4 bg-slate-900 dark:bg-slate-100 text-white dark:text-black font-black rounded-2xl shadow-lg">{t('continue', language)}</button>
          </div>
        </div>
      )}

      {activeTab === 'schedule' ? (
        <main>
          <section className="px-5 my-6 flex items-center justify-between">
            <div className="min-w-0 flex-1">
              <h3 className="text-xl font-black dark:text-white truncate">{selectedChild?.name || 'Child'}'s {t('dailySchedule', language)}</h3>
              <p className="text-xs text-text-secondary-light font-bold uppercase tracking-widest">{t('today', language)}</p>
            </div>
            <div className="flex items-center gap-2">
              <button onClick={() => { sounds.playClick(); setIsTableImporting(true); }} className="size-11 bg-slate-100 dark:bg-slate-900 text-slate-500 rounded-full flex items-center justify-center shadow-sm active:scale-90 transition-transform border border-slate-200 dark:border-slate-800" title={t('tableImport', language)}><span className="material-symbols-outlined text-[20px]">grid_on</span></button>
              <button onClick={() => { sounds.playClick(); setIsImporting(true); }} className="size-11 bg-primary/10 text-primary-dark rounded-full flex items-center justify-center shadow-sm active:scale-90 transition-transform border border-primary/20" title={t('bulkImport', language)}><span className="material-symbols-outlined text-[20px]">auto_awesome</span></button>
              <button onClick={() => { sounds.playClick(); setIsAddingTask(true); setEditingTaskId(null); }} className="size-11 bg-primary text-text-main-light rounded-full flex items-center justify-center shadow-lg active:scale-90 transition-transform"><span className="material-symbols-outlined text-[24px]">add</span></button>
            </div>
          </section>
          <section className="px-5 mb-8">
            <div className="bg-white dark:bg-surface-dark rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
              <div className="flex items-center gap-4">
                <div className="size-16 rounded-2xl overflow-hidden border-2 border-primary/20 shadow-inner bg-slate-50 dark:bg-slate-900">
                  <img src={selectedChild?.avatar} alt={selectedChild?.name} className="w-full h-full object-cover" />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <h2 className="text-xl font-black dark:text-white truncate">{selectedChild?.name}</h2>
                    {selectedChild?.age && (
                      <span className="bg-slate-100 dark:bg-slate-800 text-slate-500 text-[10px] font-black px-2 py-1 rounded-lg uppercase tracking-wider">
                        {selectedChild.age} {t('yearsOld', language)}
                      </span>
                    )}
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selectedChild?.loveLanguages && selectedChild.loveLanguages.length > 0 ? (
                      selectedChild.loveLanguages.map(langKey => {
                        const icons: Record<string, string> = {
                          physical_touch: 'front_hand',
                          words_of_affirmation: 'chat_bubble',
                          quality_time: 'schedule',
                          gifts: 'featured_seasonal_and_gifts',
                          acts_of_service: 'volunteer_activism'
                        };
                        return (
                          <div key={langKey} className="flex items-center gap-1 bg-primary/5 text-primary-dark text-[9px] font-bold px-2 py-1 rounded-md border border-primary/10" title={t(langKey as any, language)}>
                            <span className="material-symbols-outlined text-[12px]">{icons[langKey]}</span>
                            <span>{t(langKey as any, language)}</span>
                          </div>
                        );
                      })
                    ) : (
                      <p className="text-[10px] text-slate-400 italic">{language === 'es' ? 'Lenguajes del amor no configurados' : 'Love languages not set'}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          </section>

          <section className="bg-white dark:bg-surface-dark rounded-t-[3rem] border-t border-gray-100 dark:border-gray-800 min-h-[500px] shadow-2xl p-6">
            <div className="space-y-4">
              {sortedTasks.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-300">
                  <span className="material-symbols-outlined text-6xl mb-4">calendar_today</span>
                  <p className="text-xs font-black uppercase tracking-widest">No activities yet for {selectedChild?.name}</p>
                </div>
              ) : (
                sortedTasks.map(task => {
                  const isCurrent = activeTaskNow?.id === task.id;
                  const isDone = task.status === 'done';
                  return (
                    <div key={task.id} className={`flex gap-4 group cursor-grab active:cursor-grabbing ${draggedTaskId === task.id ? 'opacity-20' : ''}`} draggable onDragStart={(e) => onDragStart(e, task.id)} onDragOver={onDragOver} onDrop={(e) => onDropOnTask(e, task)}>
                      <div className="w-16 pt-3 text-[10px] font-black text-slate-400 text-right uppercase tracking-tighter">{displayTime(task.time, timeFormat)}</div>
                      <div className={`flex-1 p-4 rounded-2xl border-l-[6px] flex gap-4 transition-all ${isDone ? 'bg-slate-50 dark:bg-slate-900/10 border-slate-300 opacity-50' : (isCurrent ? 'bg-primary/5 border-primary shadow-md ring-2 ring-primary/5' : 'bg-white dark:bg-surface-dark border-slate-100 dark:border-slate-800 shadow-sm')} group-hover:border-primary-dark`}>
                        <div className="size-10 flex-shrink-0 rounded-xl bg-primary/10 flex items-center justify-center text-2xl">{task.emoji}</div>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <h4 className={`font-black text-sm dark:text-white truncate ${isDone ? 'line-through opacity-50' : ''}`}>{task.title}</h4>
                            {isCurrent && !isDone && (
                              <span className="bg-primary text-text-main-light text-[7px] font-black px-1.5 py-0.5 rounded-full uppercase animate-pulse">{language === 'es' ? 'AHORA' : 'NOW'}</span>
                            )}
                            {task.recurrence && task.recurrence.frequency !== 'none' && <span className="material-symbols-outlined text-[14px] text-primary" title={t(task.recurrence.frequency as any, language)}>sync</span>}
                          </div>
                          {task.description && <p className="text-[11px] text-slate-500 dark:text-slate-400 line-clamp-1 mb-0.5">{task.description}</p>}
                          <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">{task.duration}m {task.reward ? `• 🌟 ${task.reward}` : ''}</p>
                        </div>
                        <div className="flex flex-col gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <a
                            href={getGoogleCalendarUrl(task, selectedChild?.name || '')}
                            target="_blank"
                            rel="noopener noreferrer"
                            onClick={() => sounds.playClick()}
                            className="p-1 text-slate-400 hover:text-primary"
                            title="Google Calendar"
                          >
                            <span className="material-symbols-outlined text-[18px]">calendar_add_on</span>
                          </a>
                          <button onClick={() => handleEditTaskRequest(task)} className="p-1 text-slate-400 hover:text-primary"><span className="material-symbols-outlined text-[18px]">edit</span></button>
                          <button onClick={() => { sounds.playClick(); if (selectedChild) onDeleteTask(selectedChild.id, task.id); }} className="p-1 text-slate-400 hover:text-red-500"><span className="material-symbols-outlined text-[18px]">delete</span></button>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </section>
        </main>
      ) : (
        <main className="px-5 mt-8 animate-fade-in">
          <div className="flex items-center gap-2 mb-6">
            <span className="material-symbols-outlined text-primary text-2xl">military_tech</span>
            <h2 className="text-sm font-black uppercase tracking-widest text-text-secondary-light">{t('manageRewards', language)}</h2>
          </div>

          <div className="bg-white dark:bg-surface-dark rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
            {selectedChild ? (
              <>
                <div className="flex items-center justify-between mb-6 border-t border-slate-50 dark:border-slate-800 pt-6">
                  <div className="flex-1">
                    <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">{t('catalog', language)}</h3>
                    <p className="text-lg font-black dark:text-white">{selectedChild.name}</p>
                    {(!selectedChild.loveLanguages || selectedChild.loveLanguages.length === 0) && (
                      <p className="text-[9px] font-bold text-amber-500 uppercase tracking-widest mt-1">
                        ⚠️ {t('noLoveLanguages', language)}
                      </p>
                    )}
                  </div>
                  <div className="flex gap-2">
                    <button
                      onClick={handleGetSuggestions}
                      className="h-11 px-4 rounded-full bg-slate-100 dark:bg-slate-900 text-primary text-[10px] font-black uppercase tracking-widest flex items-center justify-center gap-2 border border-slate-200 dark:border-slate-800 shadow-sm hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95"
                    >
                      <span className="material-symbols-outlined text-[18px]">auto_awesome</span>
                      {t('getSuggestions', language)}
                    </button>
                    <button onClick={openAddReward} className="size-11 rounded-full bg-primary text-text-main-light flex items-center justify-center shadow-lg active:scale-90 transition-transform">
                      <span className="material-symbols-outlined">add_shopping_cart</span>
                    </button>
                  </div>
                </div>
                <div className="space-y-4">
                  {(selectedChild.rewards || []).length === 0 ? (
                    <div className="text-center py-10 opacity-30">
                      <span className="material-symbols-outlined text-4xl mb-2">inventory_2</span>
                      <p className="text-xs font-black uppercase tracking-widest">No rewards for {selectedChild.name}</p>
                    </div>
                  ) : (
                    (selectedChild.rewards || []).map(reward => (
                      <div key={reward.id} className="flex items-center justify-between group bg-slate-50 dark:bg-slate-900/40 p-3 rounded-2xl border border-transparent hover:border-primary/20 transition-all">
                        <div className="flex items-center gap-3">
                          <img src={reward.image} alt={reward.title} className="size-14 rounded-xl object-cover shadow-sm" />
                          <div>
                            <p className="text-sm font-black dark:text-white truncate max-w-[150px]">{reward.title}</p>
                            <div className="flex items-center gap-1.5">
                              <span className="text-yellow-500 material-symbols-outlined text-xs">star</span>
                              <p className="text-[10px] text-text-secondary-light uppercase font-black">{reward.cost} • {reward.category}</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button onClick={() => openEditReward(reward)} className="p-2 text-slate-400 hover:text-primary"><span className="material-symbols-outlined text-sm">edit</span></button>
                          <button onClick={() => { sounds.playClick(); onDeleteReward(selectedChild.id, reward.id); }} className="p-2 text-slate-400 hover:text-red-400"><span className="material-symbols-outlined text-sm">delete</span></button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="text-center py-20 opacity-30">
                <span className="material-symbols-outlined text-4xl mb-2">person_search</span>
                <p className="text-xs font-black uppercase tracking-widest">Select a child above to manage their rewards</p>
              </div>
            )}
          </div>
        </main>
      )}

      {isAddingTask && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4 overflow-y-auto">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => { setIsAddingTask(false); resetTaskState(); }}></div>
          <div className="relative w-full max-w-md bg-white dark:bg-surface-dark rounded-[2.5rem] p-8 shadow-2xl animate-fade-in my-auto max-h-[90vh] overflow-y-auto no-scrollbar">
            <h3 className="text-xl font-black mb-6 dark:text-white">{editingTaskId ? t('editActivity', language) : t('addActivity', language)}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('taskTitle', language)} <span className="text-red-500">*</span></label>
                <input type="text" placeholder={t('taskTitlePlaceholder', language)} value={newTask.title} onChange={e => { setNewTask({ ...newTask, title: e.target.value }); setTriedToSave(false); }} className={`w-full rounded-2xl border bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none dark:text-white transition-colors ${titleError ? 'border-red-500' : 'border-gray-100 dark:border-gray-800'}`} />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('description', language)}</label>
                <textarea placeholder={t('descriptionPlaceholder', language)} value={newTask.description} onChange={e => setNewTask({ ...newTask, description: e.target.value })} className="w-full rounded-2xl border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none dark:text-white resize-none h-20" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('startTime', language)} <span className="text-red-500">*</span></label>
                  <input type="text" placeholder={t('startTimePlaceholder', language)} value={newTask.time} onChange={e => { setNewTask({ ...newTask, time: e.target.value }); setTriedToSave(false); }} className={`w-full rounded-2xl border bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm text-center outline-none dark:text-white transition-colors ${timeError ? 'border-red-500' : 'border-gray-100 dark:border-gray-800'}`} />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('duration', language)} <span className="text-red-500">*</span></label>
                  <input type="number" placeholder={t('durationPlaceholder', language)} value={newTask.duration} onChange={e => { setNewTask({ ...newTask, duration: e.target.value }); setTriedToSave(false); }} className={`w-full rounded-2xl border bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm text-center outline-none dark:text-white transition-colors ${durationError ? 'border-red-500' : 'border-gray-100 dark:border-gray-800'}`} />
                </div>
              </div>
              <div className="pt-2 border-t border-gray-50 dark:border-gray-800">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('recurrence', language)}</label>
                <div className="grid grid-cols-4 gap-2 mb-4">
                  {(['none', 'daily', 'weekly', 'monthly'] as RecurrenceFrequency[]).map(freq => (
                    <button key={freq} onClick={() => { sounds.playClick(); setRecurrenceFreq(freq); }} className={`py-2 rounded-xl text-[10px] font-black uppercase tracking-tighter border transition-all ${recurrenceFreq === freq ? 'bg-primary text-text-main-light border-primary' : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border-gray-100 dark:border-gray-800'}`}>{t(freq as any, language)}</button>
                  ))}
                </div>
                {recurrenceFreq === 'weekly' && (
                  <div className="mb-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('days', language)}</label>
                    <div className="flex justify-between">
                      {[0, 1, 2, 3, 4, 5, 6].map(day => (
                        <button key={day} onClick={() => { sounds.playClick(); toggleRecurrenceDay(day); }} className={`size-8 rounded-full text-[10px] font-black transition-all border ${recurrenceDays.includes(day) ? 'bg-primary text-text-main-light border-primary' : 'bg-slate-50 dark:bg-slate-900 text-slate-400 border-gray-100 dark:border-gray-800'}`}>{weekDays[day]}</button>
                      ))}
                    </div>
                  </div>
                )}
                {recurrenceFreq === 'monthly' && (
                  <div className="mb-4">
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('dayOfMonth', language)}</label>
                    <input type="number" min="1" max="31" value={recurrenceDayOfMonth} onChange={e => setRecurrenceDayOfMonth(parseInt(e.target.value))} className="w-full rounded-2xl border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none dark:text-white" />
                  </div>
                )}
                {recurrenceFreq !== 'none' && (
                  <div>
                    <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('endDate', language)}</label>
                    <input type="date" value={recurrenceEndDate} onChange={e => setRecurrenceEndDate(e.target.value)} className="w-full rounded-2xl border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none dark:text-white" />
                  </div>
                )}
              </div>
              <div className="pt-2">
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('taskReward', language)}</label>
                <div className="flex items-center gap-3 bg-slate-50 dark:bg-slate-900 px-4 py-3 rounded-2xl border border-gray-100 dark:border-gray-800">
                  <span className="material-symbols-outlined text-yellow-500">star</span>
                  <input type="number" placeholder={t('taskRewardPlaceholder', language)} value={newTask.reward} onChange={e => setNewTask({ ...newTask, reward: parseInt(e.target.value) || 0 })} className="flex-1 bg-transparent border-none outline-none dark:text-white text-sm font-bold" />
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => { setIsAddingTask(false); resetTaskState(); }} className="flex-1 py-4 font-bold text-slate-400">{t('cancel', language)}</button>
              <button onClick={handleSaveTask} className="flex-1 py-4 bg-primary text-text-main-light font-black rounded-2xl shadow-lg hover:bg-primary-dark transition-colors">{t('saveChanges', language)}</button>
            </div>
          </div>
        </div>
      )}

      {isImporting && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsImporting(false)}></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-[2.5rem] p-8 shadow-2xl animate-fade-in border border-slate-100 dark:border-slate-800">
            <h3 className="text-xl font-black mb-2 dark:text-white">{t('bulkImport', language)}</h3>
            <p className="text-xs text-slate-500 font-bold mb-6 uppercase tracking-widest">{t('importPrompt', language)}</p>
            <textarea value={importPrompt} onChange={e => setImportPrompt(e.target.value)} placeholder="e.g. Morning school routine for Leo" className="w-full h-32 rounded-2xl border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none dark:text-white mb-6 resize-none" />
            <div className="flex gap-4">
              <button onClick={() => setIsImporting(false)} className="flex-1 py-4 font-bold text-slate-400">{t('cancel', language)}</button>
              <button onClick={handleBulkImport} disabled={isGenerating || !importPrompt.trim()} className="flex-1 py-4 bg-primary text-text-main-light font-black rounded-2xl shadow-lg disabled:opacity-50">{isGenerating ? t('generating', language) : t('generate', language)}</button>
            </div>
          </div>
        </div>
      )}

      {isTableImporting && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsTableImporting(false)}></div>
          <div className="relative w-full max-w-5xl bg-white dark:bg-surface-dark rounded-[2.5rem] p-8 shadow-2xl animate-fade-in border border-slate-100 dark:border-slate-800 max-h-[90vh] overflow-y-auto no-scrollbar">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h3 className="text-2xl font-black dark:text-white">{t('tableImport', language)}</h3>
                <p className="text-xs text-slate-500 font-bold uppercase tracking-widest leading-relaxed max-w-md">
                  {language === 'es' ? 'Pega datos directamente de Excel o Google Sheets. El sistema distribuirá la información automáticamente en las celdas.' : 'Paste data directly from Excel or Google Sheets. The system will automatically distribute the information across cells.'}
                </p>
              </div>
              <div className="flex gap-2">
                <button onClick={() => { setTableRows([{ time: '', title: '', description: '', duration: '30' }]); sounds.playClick(); }} className="size-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-red-500 flex items-center justify-center transition-colors" title="Clear all"><span className="material-symbols-outlined text-sm">delete_sweep</span></button>
                <button onClick={() => setIsTableImporting(false)} className="size-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 hover:text-slate-600 flex items-center justify-center transition-colors"><span className="material-symbols-outlined text-sm">close</span></button>
              </div>
            </div>

            <div className="overflow-x-auto mb-6 bg-slate-50 dark:bg-slate-900/40 rounded-3xl border border-slate-200 dark:border-slate-800 p-2 shadow-inner">
              <table className="w-full text-xs font-bold border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800">
                    <th className="py-3 px-3 text-left text-slate-400 uppercase tracking-tighter w-[150px]">{t('timeCol', language)}</th>
                    <th className="py-3 px-3 text-left text-slate-400 uppercase tracking-tighter">{t('activityCol', language)}</th>
                    <th className="py-3 px-3 text-left text-slate-400 uppercase tracking-tighter">{t('description', language)}</th>
                    <th className="py-3 px-3 text-center text-slate-400 uppercase tracking-tighter w-[100px]">{t('durationCol', language)}</th>
                    <th className="w-12"></th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 dark:divide-slate-800/50">
                  {tableRows.map((row, i) => (
                    <tr key={i} className="group hover:bg-white dark:hover:bg-slate-800/50 transition-colors">
                      <td className="p-1">
                        <input
                          type="text"
                          value={row.time}
                          onChange={e => { const r = [...tableRows]; r[i].time = e.target.value; setTableRows(r); }}
                          onPaste={(e) => handleSpreadsheetPaste(e, i, 0)}
                          className="w-full bg-transparent border-none p-3 outline-none text-primary font-black focus:bg-white dark:focus:bg-slate-900 rounded-xl transition-all"
                          placeholder="08:00 AM"
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          value={row.title}
                          onChange={e => { const r = [...tableRows]; r[i].title = e.target.value; setTableRows(r); }}
                          onPaste={(e) => handleSpreadsheetPaste(e, i, 1)}
                          className="w-full bg-transparent border-none p-3 outline-none dark:text-white font-bold focus:bg-white dark:focus:bg-slate-900 rounded-xl transition-all"
                          placeholder="Activity name..."
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          value={row.description}
                          onChange={e => { const r = [...tableRows]; r[i].description = e.target.value; setTableRows(r); }}
                          onPaste={(e) => handleSpreadsheetPaste(e, i, 2)}
                          className="w-full bg-transparent border-none p-3 outline-none dark:text-slate-400 text-[11px] font-medium italic focus:bg-white dark:focus:bg-slate-900 rounded-xl transition-all"
                          placeholder="Details..."
                        />
                      </td>
                      <td className="p-1">
                        <input
                          type="text"
                          value={row.duration}
                          onChange={e => { const r = [...tableRows]; r[i].duration = e.target.value; setTableRows(r); }}
                          onPaste={(e) => handleSpreadsheetPaste(e, i, 3)}
                          className="w-full bg-transparent border-none p-3 outline-none dark:text-white text-center font-bold focus:bg-white dark:focus:bg-slate-900 rounded-xl transition-all"
                          placeholder="30"
                        />
                      </td>
                      <td className="p-1 text-center">
                        <button onClick={() => removeTableRow(i)} className="opacity-0 group-hover:opacity-100 text-slate-300 hover:text-red-500 transition-all p-2"><span className="material-symbols-outlined text-sm">remove_circle</span></button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              <button onClick={addTableRow} className="w-full py-5 text-primary text-[10px] font-black uppercase tracking-widest hover:bg-primary/5 transition-colors border-t border-dashed border-primary/20 mt-2 rounded-b-2xl flex items-center justify-center gap-2"><span className="material-symbols-outlined text-sm">add</span> {t('addRow', language)}</button>
            </div>

            <div className="flex gap-4">
              <button onClick={() => setIsTableImporting(false)} className="flex-1 py-4 font-bold text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900 rounded-2xl transition-colors">{t('cancel', language)}</button>
              <button onClick={handleSaveTableImport} className="flex-1 py-4 bg-primary text-text-main-light font-black rounded-2xl shadow-lg hover:bg-primary-dark transition-all transform hover:scale-[1.02] active:scale-[0.98]">{t('saveImport', language)}</button>
            </div>
          </div>
        </div>
      )}

      {isRewardModalOpen && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsRewardModalOpen(false)}></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-[2.5rem] p-8 shadow-2xl animate-fade-in border border-slate-100 dark:border-slate-800">
            <h3 className="text-xl font-black mb-6 dark:text-white">{editingReward ? t('editReward', language) : t('addReward', language)}</h3>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('rewardTitle', language)}</label>
                <input type="text" value={rewardForm.title} onChange={e => setRewardForm({ ...rewardForm, title: e.target.value })} className="w-full rounded-2xl border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none dark:text-white" placeholder="e.g., 1hr iPad" />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('rewardCost', language)}</label>
                  <input type="number" value={rewardForm.cost} onChange={e => setRewardForm({ ...rewardForm, cost: parseInt(e.target.value) || 0 })} className="w-full rounded-2xl border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none dark:text-white" />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('rewardType', language)}</label>
                  <select value={rewardForm.type} onChange={e => setRewardForm({ ...rewardForm, type: e.target.value as Reward['type'] })} className="w-full rounded-2xl border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none dark:text-white">
                    <option value="screen">{t('screen', language)}</option>
                    <option value="toy">{t('toy', language)}</option>
                    <option value="treat">{t('treat', language)}</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('rewardCategory', language)}</label>
                <input type="text" value={rewardForm.category} onChange={e => setRewardForm({ ...rewardForm, category: e.target.value })} className="w-full rounded-2xl border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none dark:text-white" placeholder="e.g., Screen Time" />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('rewardImage', language)}</label>
                <input type="text" value={rewardForm.image} onChange={e => setRewardForm({ ...rewardForm, image: e.target.value })} className="w-full rounded-2xl border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-[10px] outline-none dark:text-white" placeholder="Image URL..." />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setIsRewardModalOpen(false)} className="flex-1 py-4 font-bold text-slate-400">{t('cancel', language)}</button>
              <button onClick={saveReward} className="flex-1 py-4 bg-primary text-text-main-light font-black rounded-2xl shadow-lg">{t('save', language)}</button>
            </div>
          </div>
        </div>
      )}

      {isSuggestionsModalOpen && (
        <div className="fixed inset-0 z-[130] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/80 backdrop-blur-md" onClick={() => setIsSuggestionsModalOpen(false)}></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-[2.5rem] p-8 shadow-2xl animate-fade-in border border-slate-100 dark:border-slate-800 max-h-[90vh] overflow-y-auto no-scrollbar">
            {!selectedSuggestion ? (
              <>
                <div className="flex justify-between items-start mb-6">
                  <div>
                    <h3 className="text-xl font-black dark:text-white">{t('suggestionsTitle', language)}</h3>
                    <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest">{t('suggestionsDesc', language)}</p>
                  </div>
                  <button onClick={() => setIsSuggestionsModalOpen(false)} className="size-10 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-400 flex items-center justify-center transition-colors"><span className="material-symbols-outlined text-sm">close</span></button>
                </div>

                <div className="space-y-4">
                  {isGeneratingSuggestions ? (
                    <div className="text-center py-20">
                      <div className="size-12 border-4 border-primary border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
                      <p className="text-xs font-black uppercase tracking-widest text-primary animate-pulse">{t('generatingSuggestions', language)}</p>
                    </div>
                  ) : suggestions.length === 0 ? (
                    <div className="text-center py-10 opacity-30">
                      <span className="material-symbols-outlined text-4xl mb-2">sentiment_dissatisfied</span>
                      <p className="text-xs font-black uppercase tracking-widest">No more ideas right now. Try again later!</p>
                    </div>
                  ) : (
                    suggestions.map((sug, i) => (
                      <div key={i} onClick={() => { sounds.playClick(); setSelectedSuggestion(sug); }} className="bg-slate-50 dark:bg-slate-900/40 p-4 rounded-3xl border border-transparent hover:border-primary/20 hover:bg-white dark:hover:bg-slate-800 transition-all group cursor-pointer shadow-sm active:scale-95">
                        <div className="flex items-center gap-4">
                          <div className="size-10 rounded-xl bg-white dark:bg-slate-800 shadow-sm flex items-center justify-center text-xl group-hover:scale-110 transition-transform">{sug.emoji}</div>
                          <div className="flex-1 min-w-0">
                            <h4 className="font-black text-sm dark:text-white truncate">{sug.title}</h4>
                            <div className="flex items-center gap-2 mt-0.5">
                              <span className="text-[10px] text-slate-400 font-bold uppercase tracking-widest">{sug.category}</span>
                              <div className="flex items-center gap-1 text-yellow-600 dark:text-yellow-400 font-black text-[10px]">
                                <span className="material-symbols-outlined text-[10px]">star</span>
                                {sug.cost}
                              </div>
                            </div>
                          </div>
                          <span className="material-symbols-outlined text-slate-300 group-hover:text-primary transition-colors">chevron_right</span>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </>
            ) : (
              <div className="animate-in slide-in-from-right-4 duration-300">
                <button onClick={() => setSelectedSuggestion(null)} className="flex items-center gap-2 text-[10px] font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors mb-6 group">
                  <span className="material-symbols-outlined text-sm group-hover:-translate-x-1 transition-transform">arrow_back</span>
                  {t('back', language)}
                </button>

                <div className="text-center mb-8">
                  <div className="size-24 rounded-[2rem] bg-primary/5 mx-auto mb-6 flex items-center justify-center text-5xl border-4 border-white dark:border-slate-800 shadow-xl">{selectedSuggestion.emoji}</div>
                  <h3 className="text-2xl font-black dark:text-white mb-2">{selectedSuggestion.title}</h3>
                  <div className="inline-flex items-center gap-2 bg-yellow-100 dark:bg-yellow-900/30 px-3 py-1.5 rounded-full">
                    <span className="material-symbols-outlined text-yellow-500 text-sm font-black">star</span>
                    <span className="text-sm font-black text-yellow-700 dark:text-yellow-400">{selectedSuggestion.cost} {t('stars', language)}</span>
                  </div>
                </div>

                <div className="bg-slate-50 dark:bg-slate-900/40 p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 mb-8">
                  <h4 className="text-[10px] font-black uppercase tracking-widest text-primary mb-3">{t('learningMode', language) /* Reusing a header-like style */} Reason</h4>
                  <p className="text-sm font-bold dark:text-slate-200 leading-relaxed italic">"{selectedSuggestion.reason}"</p>
                  <div className="mt-4 pt-4 border-t border-slate-200/50 dark:border-slate-700/50 text-center">
                    <span className="text-[9px] font-black uppercase tracking-[0.2em] text-slate-400">{selectedSuggestion.category}</span>
                  </div>
                </div>

                <button
                  onClick={() => handleAcceptSuggestion(selectedSuggestion)}
                  className="w-full py-5 bg-primary text-text-main-light font-black text-xs uppercase tracking-[0.2em] rounded-3xl shadow-xl hover:bg-primary-dark transition-all transform hover:scale-[1.02] active:scale-[0.98] flex items-center justify-center gap-3"
                >
                  <span className="material-symbols-outlined">add_circle</span>
                  {t('acceptSuggestion', language)}
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] h-[72px] bg-white/90 dark:bg-surface-dark/90 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between px-2 z-30">
        <button onClick={() => handleNav('/')} className="flex-1 flex flex-col items-center justify-center gap-1 h-full rounded-[1.5rem] text-primary relative">
          <div className="absolute inset-x-2 top-1.5 bottom-1.5 bg-primary/10 rounded-[1.2rem]"></div>
          <span className="material-symbols-outlined relative z-10 text-[24px]">dashboard</span>
          <span className="text-[10px] font-black relative z-10 tracking-wide uppercase">Parent</span>
        </button>
        <button onClick={() => handleNav('/child')} className="flex-1 flex flex-col items-center justify-center gap-1 h-full rounded-[1.5rem] text-slate-400">
          <span className="material-symbols-outlined text-[24px]">child_care</span>
          <span className="text-[10px] font-black tracking-wide uppercase">Child</span>
        </button>
        <button onClick={() => handleNav('/settings')} className="flex-1 flex flex-col items-center justify-center gap-1 h-full rounded-[1.5rem] text-slate-400">
          <span className="material-symbols-outlined text-[24px]">settings</span>
          <span className="text-[10px] font-black relative z-10 tracking-wide uppercase">Settings</span>
        </button>
      </nav>
    </div>
  );
};

export default ParentDashboard;
