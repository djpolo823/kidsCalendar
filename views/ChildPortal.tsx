
import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Task, Child, TimeFormat, Language } from '../types';
import { generateSpeech, translateText, playAudioFromBase64 } from '../services/geminiService';
import { getTaskSpeechText, cleanForSpeech } from '../services/speechUtils';
import SideMenu from '../components/SideMenu';
import { sounds } from '../services/soundService';
import { t } from '../services/i18n';

interface Props {
  tasks: Task[];
  children: Child[];
  timeFormat: TimeFormat;
  language: Language;
  learningMode: boolean;
  onUpdateTask: (id: string, status: Task['status']) => void;
  onSwitchChild: (id: string) => void;
}

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
      const period = parts[1];

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

const displayTime = (timeStr: string | undefined | null, format: TimeFormat): string => {
  const mins = parseTimeToMinutes(timeStr);
  const h = Math.floor(mins / 60);
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

// --- Educational Clock Components ---

const AnalogClock: React.FC<{ time: Date }> = ({ time }) => {
  const seconds = time.getSeconds();
  const minutes = time.getMinutes();
  const hours = time.getHours();

  const sDegree = (seconds / 60) * 360;
  const mDegree = ((minutes + seconds / 60) / 60) * 360;
  const hDegree = (((hours % 12) + minutes / 60) / 12) * 360;

  return (
    <div className="relative size-44 md:size-52 bg-white dark:bg-slate-900 rounded-full border-[6px] border-slate-100 dark:border-slate-800 shadow-xl flex items-center justify-center">
      {/* Hour Numbers (1-12) - Green */}
      {[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map((num) => {
        const angle = (num * 30) * (Math.PI / 180);
        const x = 50 + 28 * Math.sin(angle);
        const y = 50 - 28 * Math.cos(angle);
        return (
          <span key={`h-${num}`} className="absolute text-[12px] font-black text-primary transition-colors" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}>
            {num}
          </span>
        );
      })}

      {/* Minute Numbers (5-60) - Blue */}
      {[5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60].map((num) => {
        const angle = (num * 6) * (Math.PI / 180);
        const x = 50 + 41 * Math.sin(angle);
        const y = 50 - 41 * Math.cos(angle);
        return (
          <span key={`m-${num}`} className="absolute text-[9px] font-black text-blue-500 transition-colors" style={{ left: `${x}%`, top: `${y}%`, transform: 'translate(-50%, -50%)' }}>
            {num}
          </span>
        );
      })}

      {/* Hour Hand - Green */}
      <div className="absolute w-2 h-12 bg-primary rounded-full origin-bottom bottom-1/2 transition-transform z-20" style={{ transform: `rotate(${hDegree}deg)` }} />
      {/* Minute Hand - Blue */}
      <div className="absolute w-1.5 h-16 bg-blue-500 rounded-full origin-bottom bottom-1/2 transition-transform z-10" style={{ transform: `rotate(${mDegree}deg)` }} />
      {/* Second Hand - Subtle Gray */}
      <div className="absolute w-0.5 h-18 bg-slate-300 dark:bg-slate-600 rounded-full origin-bottom bottom-1/2 transition-transform" style={{ transform: `rotate(${sDegree}deg)` }} />

      {/* Center Dot */}
      <div className="absolute size-3 bg-slate-800 dark:bg-white rounded-full z-30 border-2 border-white dark:border-slate-900 shadow-sm" />
    </div>
  );
};

const DigitalClock: React.FC<{ time: Date, format: TimeFormat }> = ({ time, format }) => {
  const hours = time.getHours();
  const minutes = time.getMinutes();
  const seconds = time.getSeconds();
  const pad = (n: number) => n.toString().padStart(2, '0');

  if (format === '24h') {
    return (
      <div className="flex items-baseline gap-1">
        <span className="text-4xl md:text-6xl font-black dark:text-white tabular-nums">{pad(hours)}:{pad(minutes)}</span>
        <span className="text-sm md:text-xl font-bold text-primary tabular-nums w-6 md:w-8">{pad(seconds)}</span>
      </div>
    );
  } else {
    const h12 = hours % 12 || 12;
    const period = hours >= 12 ? 'PM' : 'AM';
    return (
      <div className="flex flex-col items-center">
        <div className="flex items-baseline gap-1">
          <span className="text-4xl md:text-6xl font-black dark:text-white tabular-nums">{pad(h12)}:{pad(minutes)}</span>
          <span className="text-sm md:text-xl font-bold text-primary tabular-nums w-6 md:w-8">{pad(seconds)}</span>
        </div>
        <span className="text-[10px] font-black tracking-widest text-slate-400 uppercase">{period}</span>
      </div>
    );
  }
};

const TaskTimer: React.FC<{ task: Task, language: Language }> = ({ task, language }) => {
  const [timeLeft, setTimeLeft] = useState<string>('');
  const [progress, setProgress] = useState(100);

  useEffect(() => {
    if (task.status !== 'active' || !task.startTime || !task.duration) return;

    const durationMs = parseInt(task.duration) * 60 * 1000;
    const endTime = task.startTime + durationMs;

    const timer = setInterval(() => {
      const now = Date.now();
      const diff = endTime - now;

      if (diff <= 0) {
        setTimeLeft('00:00');
        setProgress(0);
        clearInterval(timer);
      } else {
        const mins = Math.floor(diff / 60000);
        const secs = Math.floor((diff % 60000) / 1000);
        setTimeLeft(`${mins.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`);
        setProgress((diff / durationMs) * 100);
      }
    }, 1000);

    return () => clearInterval(timer);
  }, [task]);

  if (task.status !== 'active') return null;

  return (
    <div className="mt-2 flex flex-col items-center gap-2 w-full">
      <div className="relative size-28">
        <svg className="size-full -rotate-90" viewBox="0 0 128 128">
          <circle cx="64" cy="64" r="58" className="stroke-slate-100 dark:stroke-slate-800 fill-none stroke-[10]" />
          <circle cx="64" cy="64" r="58" className="stroke-primary fill-none stroke-[10] transition-all duration-500" strokeDasharray="364.4" strokeDashoffset={364.4 - (364.4 * progress) / 100} strokeLinecap="round" />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center"><span className="text-xl font-black font-mono dark:text-white">{timeLeft || '--:--'}</span></div>
      </div>
      <p className="text-[10px] font-black uppercase text-primary tracking-widest text-center">{t('remainingTime', language)}</p>
    </div>
  );
};

const ChildPortal: React.FC<Props> = ({ tasks, children, timeFormat, language, learningMode, onUpdateTask, onSwitchChild }) => {
  const navigate = useNavigate();
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [showCelebration, setShowCelebration] = useState<{ taskTitle: string, reward: number } | null>(null);
  const [clockMode, setClockMode] = useState<'analog' | 'digital'>('digital');
  const [currentTime, setCurrentTime] = useState(new Date());
  const [spokenText, setSpokenText] = useState<string | null>(null);

  // Update clock every second
  useEffect(() => {
    const timer = setInterval(() => setCurrentTime(new Date()), 1000);
    return () => {
      clearInterval(timer);
      sounds.stopBackgroundMusic();
    };
  }, []);

  // Find active task based on current schedule
  const getCurrentActiveTaskFromSchedule = () => {
    const nowMinutes = currentTime.getHours() * 60 + currentTime.getMinutes();
    return tasks.find(task => {
      const startMins = parseTimeToMinutes(task.time);
      const durMins = parseInt(task.duration || '0');
      const endMins = startMins + durMins;
      return nowMinutes >= startMins && nowMinutes < endMins;
    });
  };

  const activeTaskNow = getCurrentActiveTaskFromSchedule();

  const activeChild = children.find(c => c.active) || children[0];
  const sortedTasks = [...tasks].sort((a, b) => parseTimeToMinutes(a.time) - parseTimeToMinutes(b.time));
  const remainingCount = sortedTasks.filter(t => t.status !== 'done').length;

  const handleSpeak = async (task: Task) => {
    if (isSpeaking) return;
    sounds.playClick();
    setIsSpeaking(true);

    const nativeLang = language;
    const targetLang = nativeLang === 'en' ? 'es' : 'en';

    // Helper to get audio dynamic field name
    const getAudioField = (status: Task['status'], lang: Language) => `audio_${status}_${lang}` as keyof Task;

    sounds.startBackgroundMusic();

    try {
      if (learningMode) {
        // Play Target Language first
        const targetField = getAudioField(task.status, targetLang);
        const targetAudio = task[targetField] as string;

        if (targetAudio) {
          const targetText = getTaskSpeechText(task, activeChild?.name || 'Amigo', targetLang);
          setSpokenText(targetText);
          await playAudioFromBase64(targetAudio);
        } else {
          const textToSpeak = getTaskSpeechText(task, activeChild?.name || 'Amigo', nativeLang);
          const cleanText = cleanForSpeech(textToSpeak);
          const translated = await translateText(cleanText, targetLang);
          setSpokenText(translated);
          await generateSpeech(translated, targetLang);
        }

        await new Promise(r => setTimeout(r, 500));

        // Play Native Language
        const nativeField = getAudioField(task.status, nativeLang);
        const nativeAudio = task[nativeField] as string;

        if (nativeAudio) {
          const nativeText = getTaskSpeechText(task, activeChild?.name || 'Amigo', nativeLang);
          setSpokenText(nativeText);
          await playAudioFromBase64(nativeAudio);
        } else {
          const textToSpeak = getTaskSpeechText(task, activeChild?.name || 'Amigo', nativeLang);
          const consistentText = await translateText(cleanForSpeech(textToSpeak), nativeLang);
          setSpokenText(consistentText);
          await generateSpeech(consistentText, nativeLang);
        }
      } else {
        const nativeField = getAudioField(task.status, nativeLang);
        const nativeAudio = task[nativeField] as string;

        if (nativeAudio) {
          const nativeText = getTaskSpeechText(task, activeChild?.name || 'Amigo', nativeLang);
          setSpokenText(nativeText);
          await playAudioFromBase64(nativeAudio);
        } else {
          const textToSpeak = getTaskSpeechText(task, activeChild?.name || 'Amigo', nativeLang);
          const consistentText = await translateText(cleanForSpeech(textToSpeak), nativeLang);
          setSpokenText(consistentText);
          await generateSpeech(consistentText, nativeLang);
        }
      }
    } catch (err) {
      console.error("Speech error:", err);
    } finally {
      sounds.stopBackgroundMusic();
      setSpokenText(null);
      setIsSpeaking(false);
    }
  };

  const handleStart = (id: string) => {
    onUpdateTask(id, 'active');
  };

  const handleComplete = async (task: Task) => {
    onUpdateTask(task.id, 'done');
    setShowCelebration({ taskTitle: task.title, reward: task.reward });

    const nativeLang = language;
    const targetLang = nativeLang === 'en' ? 'es' : 'en';

    const congratsMsg = nativeLang === 'es'
      ? `¡Excelente! Has terminado ${task.title}. ¡Ganaste un premio de ${task.reward} estrellas!`
      : `Excellent! You finished ${task.title}. You earned a reward of ${task.reward} stars!`;

    const cleanForSpeech = (str: string) => str.replace(/[^\p{L}\p{N}\p{P}\s]/gu, '').replace(/\s+/g, ' ').trim();

    setTimeout(async () => {
      if (learningMode) {
        const textToSpeak = cleanForSpeech(congratsMsg);
        const translated = await translateText(textToSpeak, targetLang);

        setSpokenText(translated);
        await generateSpeech(translated, targetLang);

        await new Promise(r => setTimeout(r, 500));

        setSpokenText(congratsMsg);
        await generateSpeech(congratsMsg, nativeLang);
      } else {
        setSpokenText(congratsMsg);
        await generateSpeech(cleanForSpeech(congratsMsg), nativeLang);
      }
      setSpokenText(null);
    }, 800);

    setTimeout(() => setShowCelebration(null), 8000);
  };

  const handleNav = (path: string) => {
    sounds.playClick();
    navigate(path);
  }

  if (!activeChild) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex flex-col items-center justify-center p-8 text-center animate-fade-in">
        <div className="size-24 bg-primary/10 rounded-[2.5rem] flex items-center justify-center mb-8">
          <span className="material-symbols-outlined text-primary text-6xl">child_care</span>
        </div>
        <h2 className="text-2xl font-black dark:text-white mb-2">{language === 'es' ? '¡Bienvenido!' : 'Welcome!'}</h2>
        <p className="text-slate-400 font-bold mb-8">{language === 'es' ? 'Aún no hay niños en este equipo familiar. Pide al administrador que añada uno desde los ajustes.' : 'No children added to this family yet. Ask the administrator to add one from settings.'}</p>
        <button onClick={() => navigate('/')} className="px-8 py-4 bg-primary text-text-main-light font-black rounded-2xl shadow-lg active:scale-95 transition-all">
          {language === 'es' ? 'Ir a Ajustes' : 'Go to Settings'}
        </button>
      </div>
    );
  }

  return (
    <div className="relative flex min-h-screen flex-col bg-background-light dark:bg-background-dark animate-fade-in pb-32 overflow-hidden text-display">
      <SideMenu isOpen={isMenuOpen} onClose={() => { sounds.playClick(); setIsMenuOpen(false); }} language={language} />

      {spokenText && (
        <div className="fixed inset-x-4 top-24 z-50 animate-fade-in flex justify-center pointer-events-none">
          <div className="bg-white dark:bg-surface-dark border-2 border-primary p-4 rounded-3xl shadow-xl max-w-sm relative">
            <div className="text-lg font-black text-center dark:text-white leading-tight">
              {spokenText}
            </div>
            {/* Tail */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-4 h-4 bg-white dark:bg-surface-dark border-b-2 border-r-2 border-primary transform rotate-45"></div>
          </div>
        </div>
      )}

      {showCelebration && (
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-6 bg-primary/80 backdrop-blur-md animate-fade-in">
          <div className="relative bg-white dark:bg-surface-dark rounded-[3rem] p-10 w-full max-w-sm shadow-2xl border-4 border-white text-center transform animate-bounce-short">
            <div className="absolute -top-10 left-1/2 -translate-x-1/2 flex gap-4">
              <span className="text-4xl">🌟</span>
              <span className="text-4xl [animation-delay:0.2s]">✨</span>
            </div>
            <h2 className="text-3xl font-black text-primary-dark mb-3">{t('greatJob', language)}</h2>
            <p className="text-lg font-bold text-text-secondary-light mb-6">
              {t('youFinished', language)} <span className="text-text-main-light dark:text-white">{showCelebration.taskTitle}</span>
            </p>
            <div className="bg-yellow-400/5 rounded-3xl p-8 mb-8 border-2 border-yellow-400/10">
              <div className="flex items-center justify-center gap-4">
                <span className="material-symbols-outlined text-yellow-500 text-5xl">star</span>
                <span className="text-5xl font-black text-yellow-600">+{showCelebration.reward}</span>
              </div>
              <p className="text-[10px] font-black uppercase tracking-widest text-yellow-700/60 mt-3">{t('taskReward', language)}</p>
            </div>
            <button onClick={() => { sounds.playClick(); setShowCelebration(null); }} className="w-full bg-primary text-text-main-light font-black py-4 rounded-2xl shadow-lg active:scale-95 transition-all text-xl">{t('continue', language)} ➔</button>
          </div>
        </div>
      )}

      <header className="sticky top-0 z-20 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md pt-2 border-b border-slate-100 dark:border-slate-800/50">
        <div className="px-5 py-4 flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3 min-w-0">
              <button onClick={() => { sounds.playClick(); setIsMenuOpen(true); }} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 flex-shrink-0"><span className="material-symbols-outlined text-text-main-light dark:text-text-main-dark">menu</span></button>
              <div className="flex flex-col min-w-0">
                <p className="text-text-secondary-light dark:text-text-secondary-dark text-[10px] font-bold uppercase tracking-widest leading-none mb-1">{t('hello', language)}, {activeChild.name}!</p>
                <h1 className="text-lg font-extrabold dark:text-white leading-none tracking-tight truncate">{t('goals', language)}</h1>
              </div>
            </div>
            <div onClick={() => handleNav('/rewards')} className="bg-primary shadow-md rounded-full pl-3 pr-4 py-1.5 flex items-center gap-1.5 active:scale-95 transition-all cursor-pointer flex-shrink-0 border-2 border-white/20">
              <span className="text-white material-symbols-outlined text-[18px] font-bold">star</span>
              <span className="text-text-main-light font-black text-lg leading-none">{activeChild.stars}</span>
            </div>
          </div>

          {/* Child Profile Switcher */}
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
            {children.map(child => (
              <button
                key={child.id}
                onClick={() => onSwitchChild(child.id)}
                className={`relative flex-shrink-0 size-12 rounded-full border-2 transition-all p-0.5 ${child.active ? 'border-primary scale-110 shadow-md' : 'border-transparent opacity-50'}`}
              >
                <img src={child.avatar} alt={child.name} className="size-full rounded-full object-cover" />
                {child.active && <div className="absolute -bottom-1 -right-1 size-4 bg-primary rounded-full flex items-center justify-center border-2 border-white"><span className="material-symbols-outlined text-[10px] text-white font-black">check</span></div>}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="px-5 flex flex-col gap-6 w-full mt-6">
        {/* Educational Clock Section */}
        <div className="bg-white dark:bg-surface-dark rounded-[2.5rem] p-6 shadow-sm border border-slate-100 dark:border-slate-800 flex flex-col items-center gap-6 overflow-hidden relative">
          <button
            onClick={() => { sounds.playClick(); setClockMode(prev => prev === 'analog' ? 'digital' : 'analog'); }}
            className="absolute top-4 right-4 size-10 rounded-full bg-slate-50 dark:bg-slate-900 flex items-center justify-center text-slate-400 hover:text-primary transition-colors z-10"
            title={t('switchClock', language)}
          >
            <span className="material-symbols-outlined text-sm">{clockMode === 'analog' ? 'digit_speed' : 'schedule'}</span>
          </button>

          <div className="flex-shrink-0">
            {clockMode === 'analog' ? (
              <AnalogClock time={currentTime} />
            ) : (
              <DigitalClock time={currentTime} format={timeFormat} />
            )}
          </div>

          <div className="flex flex-col items-center text-center gap-1 w-full">
            <span className="text-[10px] font-black uppercase tracking-[0.2em] text-primary-dark">{t('currentTask', language)}</span>
            {activeTaskNow ? (
              <div className="flex items-center gap-3 animate-fade-in bg-slate-50 dark:bg-slate-900/40 px-5 py-3 rounded-2xl border border-slate-100 dark:border-slate-800/50">
                <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center text-xl flex-shrink-0">{activeTaskNow.emoji}</div>
                <div className="min-w-0 text-left">
                  <h3 className="text-base font-black dark:text-white truncate">{activeTaskNow.title}</h3>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest leading-none">
                    {displayTime(activeTaskNow.time, timeFormat)} • {activeTaskNow.duration}m
                  </p>
                </div>
              </div>
            ) : (
              <div className="flex items-center gap-3 opacity-40 grayscale animate-fade-in">
                <div className="size-10 rounded-xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-xl flex-shrink-0">☕</div>
                <h3 className="text-base font-black dark:text-slate-500">{t('noActiveTask', language)}</h3>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center gap-3 px-1">
          <div className="flex-1 bg-slate-200 dark:bg-slate-800 rounded-full h-2.5 overflow-hidden">
            <div className="bg-primary h-full rounded-full transition-all duration-1000" style={{ width: `${(tasks.length ? (tasks.filter(t => t.status === 'done').length / tasks.length) * 100 : 0)}%` }}></div>
          </div>
          <span className="text-xs font-black text-text-secondary-light dark:text-text-secondary-dark whitespace-nowrap">{remainingCount} {t('remaining', language)}</span>
        </div>

        {sortedTasks.map(task => {
          const isActive = task.status === 'active';
          const isDone = task.status === 'done';
          const isPending = task.status === 'pending';

          if (isActive) {
            return (
              <article key={task.id} className="relative w-full transform transition-all animate-fade-in">
                <div className="relative overflow-hidden p-6 bg-white dark:bg-surface-dark rounded-[2.5rem] shadow-xl border-2 border-primary">
                  <div className="flex justify-between items-start mb-4 relative z-10 gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 mb-2">
                        <span className="inline-block w-2 h-2 rounded-full bg-primary animate-pulse"></span>
                        <span className="text-primary-dark font-black text-[10px] tracking-widest uppercase">{t('inProgress', language)}</span>
                      </div>
                      <h2 className="text-xl font-black dark:text-white leading-tight break-words line-clamp-2">{task.title}</h2>
                    </div>
                    <div className="bg-slate-50 dark:bg-slate-900/50 size-16 flex-shrink-0 rounded-2xl flex items-center justify-center text-4xl shadow-sm border border-slate-100 dark:border-slate-800">{task.emoji}</div>
                  </div>
                  <div className="mb-4 p-3 bg-yellow-400/5 rounded-2xl border border-yellow-400/10 flex items-center gap-2">
                    <span className="material-symbols-outlined text-yellow-500 text-xl">star</span>
                    <p className="text-xs font-black text-yellow-700">{t('taskReward', language)}: {task.reward} {t('stars', language)}</p>
                  </div>
                  <TaskTimer task={task} language={language} />
                  <div className="flex items-center justify-between mt-8 relative z-10 gap-3">
                    <button onClick={() => handleSpeak(task)} disabled={isSpeaking} className="size-14 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 active:scale-90 transition-transform disabled:opacity-50 flex-shrink-0 shadow-sm"><span className="material-symbols-outlined text-[28px]">{isSpeaking ? 'graphic_eq' : 'volume_up'}</span></button>
                    <button onClick={() => handleComplete(task)} className="flex-1 bg-primary text-text-main-light text-base font-black px-4 py-4 rounded-2xl shadow-lg flex items-center justify-center gap-2 active:scale-95 transition-all truncate"><span>{t('completeTask', language)}</span><span className="material-symbols-outlined text-[24px] flex-shrink-0">check</span></button>
                  </div>
                </div>
              </article>
            );
          }

          return (
            <article key={task.id} className={`group relative flex items-center ${isDone ? 'opacity-30 scale-[0.98]' : ''}`}>
              <div className={`flex-1 flex items-center p-4 rounded-[2.5rem] border transition-all gap-4 ${isActive ? 'invisible h-0 p-0 m-0 overflow-hidden' : (activeTaskNow?.id === task.id ? 'bg-primary/10 border-primary border-2 shadow-lg ring-4 ring-primary/5' : (isDone ? 'bg-slate-100 dark:bg-slate-800/40 border-transparent' : 'bg-white dark:bg-surface-dark border-slate-100 dark:border-slate-800 shadow-sm'))}`}>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-text-secondary-light dark:text-text-secondary-dark font-black text-[10px] uppercase tracking-wider">{displayTime(task.time, timeFormat)}</span>
                    {activeTaskNow?.id === task.id && !isActive && !isDone && (
                      <span className="bg-primary text-text-main-light text-[8px] font-black px-2 py-0.5 rounded-full uppercase animate-pulse">{language === 'es' ? 'AHORA MISMO' : 'RIGHT NOW'}</span>
                    )}
                  </div>
                  <h3 className={`text-base font-black break-words line-clamp-1 ${isDone ? 'text-text-secondary-light' : 'dark:text-white'}`}>{task.title}</h3>
                  {!isDone && (
                    <p className="text-[10px] font-black text-yellow-600 uppercase flex items-center gap-1 mt-1"><span className="material-symbols-outlined text-xs">star</span> {task.reward}</p>
                  )}
                </div>
                <div className="flex items-center gap-3">
                  <div className={`size-12 flex-shrink-0 flex items-center justify-center text-2xl rounded-2xl ${isDone ? 'bg-white/50' : 'bg-slate-50 dark:bg-slate-900/50'}`}>{task.emoji}</div>
                  {!isDone && isPending && (
                    <div className="flex items-center gap-2">
                      <button onClick={() => handleSpeak(task)} className="p-2 text-slate-400 hover:text-primary transition-colors active:scale-90"><span className="material-symbols-outlined text-2xl">volume_up</span></button>
                      <button onClick={() => handleStart(task.id)} className="bg-primary text-text-main-light px-4 py-2 rounded-2xl text-[10px] font-black uppercase tracking-widest shadow-md hover:bg-primary-dark transition-colors">{t('start', language)}</button>
                    </div>
                  )}
                </div>
              </div>
            </article>
          );
        })}
      </main>
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] h-[72px] bg-white/90 dark:bg-surface-dark/90 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between px-2 z-30">
        <button onClick={() => handleNav('/child')} className="flex-1 flex flex-col items-center justify-center gap-1 h-full rounded-[1.5rem] text-primary relative"><div className="absolute inset-x-2 top-1.5 bottom-1.5 bg-primary/10 rounded-[1.2rem]"></div><span className="material-symbols-outlined relative z-10 text-[24px]">calendar_today</span><span className="text-[10px] font-black relative z-10 tracking-wide uppercase">{t('today', language)}</span></button>
        <div className="w-px h-8 bg-slate-100 dark:bg-slate-800 mx-1 opacity-50"></div>
        <button onClick={() => handleNav('/rewards')} className="flex-1 flex flex-col items-center justify-center gap-1 h-full rounded-[1.5rem] text-text-secondary-light hover:text-primary transition-colors"><span className="material-symbols-outlined text-[24px]">emoji_events</span><span className="text-[10px] font-black tracking-wide uppercase">{t('rewardsHub', language)}</span></button>
        <div className="w-px h-8 bg-slate-100 dark:bg-slate-800 mx-1 opacity-50"></div>
        <button onClick={() => handleNav('/')} className="flex-1 flex flex-col items-center justify-center gap-1 h-full rounded-[1.5rem] text-text-secondary-light hover:text-primary transition-colors"><span className="material-symbols-outlined text-[24px]">settings</span><span className="text-[10px] font-black tracking-wide uppercase">Parent</span></button>
      </nav>
    </div>
  );
};

export default ChildPortal;
