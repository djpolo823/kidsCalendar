
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Child, Guardian, Language, TimeFormat, Invitation, LoveLanguage } from '../types';
import { UserAccount, DatabaseService } from '../services/database';
import { t } from '../services/i18n';
import { sounds } from '../services/soundService';
import { supabase } from '../services/supabase';
import { getAvatarUrl, getAvatarOptions, CHILD_AVATAR_STYLES, AvatarStyle } from '../services/avatarService';

interface Props {
  currentUser: UserAccount | null;
  children: Child[];
  guardians: Guardian[];
  language: Language;
  timeFormat: TimeFormat;
  learningMode: boolean;
  onLearningModeChange: (val: boolean) => void;
  onLanguageChange: (lang: Language) => void;
  onTimeFormatChange: (format: TimeFormat) => void;
  onAddChild: (child: Child) => void;
  onUpdateChild: (child: Child) => void;
  onDeleteChild: (id: string) => void;
  onAddGuardian: (guardian: Guardian) => void;
  onUpdateGuardian: (guardian: Guardian) => void;
  onDeleteGuardian: (id: string) => void;
  onSyncData: () => void;
  onJoinFamily: (code: string) => Promise<boolean>;
  onLogout: () => void;
}

const ParentSettings: React.FC<Props> = ({
  currentUser,
  children,
  guardians,
  language,
  timeFormat,
  learningMode,
  onLearningModeChange,
  onLanguageChange,
  onTimeFormatChange,
  onAddChild,
  onUpdateChild,
  onDeleteChild,
  onAddGuardian,
  onUpdateGuardian,
  onDeleteGuardian,
  onSyncData,
  onJoinFamily,
  onLogout
}) => {
  const navigate = useNavigate();

  // Modals state
  const [isChildModalOpen, setIsChildModalOpen] = useState(false);
  const [editingChild, setEditingChild] = useState<Child | null>(null);
  const [isGuardianModalOpen, setIsGuardianModalOpen] = useState(false);
  const [editingGuardian, setEditingGuardian] = useState<Guardian | null>(null);
  const [isJoinModalOpen, setIsJoinModalOpen] = useState(false);
  const [isInviteModalOpen, setIsInviteModalOpen] = useState(false);

  // Form states
  const [childForm, setChildForm] = useState({ name: '', age: '', avatar: '', loveLanguages: [] as Child['loveLanguages'] });
  const [guardianForm, setGuardianForm] = useState({ name: '', role: 'Guardian' as Guardian['role'], avatar: '' });
  const [joinCode, setJoinCode] = useState('');
  const [activeInvite, setActiveInvite] = useState<Invitation | null>(null);
  const [copied, setCopied] = useState(false);

  const handleNav = (path: string) => {
    sounds.playClick();
    navigate(path);
  };

  // --- Child Logic ---
  const openAddChild = () => {
    setEditingChild(null);
    const newId = `c_${Date.now()}`;
    setChildForm({ name: '', age: '', avatar: getAvatarUrl(newId, 'adventurer'), loveLanguages: [] });
    setIsChildModalOpen(true);
    sounds.playClick();
  };
  const openEditChild = (child: Child) => {
    setEditingChild(child);
    setChildForm({
      name: child.name,
      age: child.age?.toString() || '',
      avatar: child.avatar,
      loveLanguages: child.loveLanguages || []
    });
    setIsChildModalOpen(true);
    sounds.playClick();
  };
  const saveChild = () => {
    if (!childForm.name.trim()) return;
    if (editingChild) {
      onUpdateChild({
        ...editingChild,
        name: childForm.name,
        age: childForm.age ? parseInt(childForm.age) : undefined,
        avatar: childForm.avatar,
        loveLanguages: childForm.loveLanguages
      });
    } else {
      onAddChild({
        id: `c_${Date.now()}`,
        name: childForm.name,
        age: childForm.age ? parseInt(childForm.age) : undefined,
        avatar: childForm.avatar,
        level: 1,
        stars: 0,
        active: false,
        loveLanguages: childForm.loveLanguages,
        rewards: [],
        tasks: []
      });
    }
    setIsChildModalOpen(false);
  };

  // --- Guardian Logic ---
  const openAddGuardian = () => {
    setEditingGuardian(null);
    setGuardianForm({ name: '', role: 'Guardian', avatar: '' });
    setIsGuardianModalOpen(true);
    sounds.playClick();
  };
  const openEditGuardian = (guardian: Guardian) => {
    setEditingGuardian(guardian);
    setGuardianForm({ name: guardian.name, role: guardian.role, avatar: guardian.avatar || '' });
    setIsGuardianModalOpen(true);
    sounds.playClick();
  };
  const saveGuardian = () => {
    if (!guardianForm.name.trim()) return;
    if (editingGuardian) {
      onUpdateGuardian({ ...editingGuardian, name: guardianForm.name, role: guardianForm.role, avatar: guardianForm.avatar });
    } else {
      onAddGuardian({ id: `g_${Date.now()}`, name: guardianForm.name, role: guardianForm.role, avatar: guardianForm.avatar, isYou: false });
    }
    setIsGuardianModalOpen(false);
  };

  const generateInvite = async (role: Guardian['role'] = 'Co-Parent') => {
    if (!currentUser?.familyId) return;

    try {
      const invitation = await DatabaseService.generateInvitationCode(currentUser.familyId, role);
      setActiveInvite(invitation);
      setIsInviteModalOpen(true);
      sounds.playSuccess();
    } catch (err) {
      console.error("Error generating invitation:", err);
      sounds.playError();
    }
  };

  const handleCopyCode = () => {
    if (activeInvite) {
      navigator.clipboard.writeText(activeInvite.code);
      setCopied(true);
      sounds.playClick();
      setTimeout(() => setCopied(false), 2000);
    }
  };

  const handleJoinFamily = async () => {
    if (!joinCode.trim()) return;
    sounds.playClick();
    const success = await onJoinFamily(joinCode);
    if (success) {
      setIsJoinModalOpen(false);
      setJoinCode('');
      sounds.playSuccess();
    }
  };

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen pb-40 animate-fade-in px-5">
      <header className="sticky top-0 z-20 bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md pt-6 pb-4 border-b border-gray-100 dark:border-gray-800 flex items-center gap-4">
        <button onClick={() => handleNav('/')} className="p-2 -ml-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
          <span className="material-symbols-outlined">arrow_back</span>
        </button>
        <h1 className="text-xl font-black dark:text-white">{t('settings', language)}</h1>
        <div className="flex-1" />
        <button
          onClick={() => { sounds.playClick(); onSyncData(); }}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-primary/10 text-primary-dark text-[10px] font-black uppercase tracking-widest hover:bg-primary/20 active:scale-95 transition-all"
        >
          <span className="material-symbols-outlined text-[16px]">sync</span>
          {language === 'es' ? 'Sincronizar' : 'Sync Cloud'}
        </button>
      </header>

      <main className="mt-8 space-y-10">
        {/* App Preferences */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-2xl">tune</span>
            <h2 className="text-sm font-black uppercase tracking-widest text-text-secondary-light">{t('preferences', language)}</h2>
          </div>
          <div className="bg-white dark:bg-surface-dark rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800 space-y-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="font-bold dark:text-white">{t('language', language)}</p>
                <p className="text-[10px] text-text-secondary-light uppercase font-black">App display language</p>
              </div>
              <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                <button onClick={() => { sounds.playClick(); onLanguageChange('en'); }} className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${language === 'en' ? 'bg-white shadow-sm text-primary-dark' : 'text-slate-400'}`}>EN</button>
                <button onClick={() => { sounds.playClick(); onLanguageChange('es'); }} className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${language === 'es' ? 'bg-white shadow-sm text-primary-dark' : 'text-slate-400'}`}>ES</button>
              </div>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-gray-50 dark:border-gray-800">
              <div>
                <p className="font-bold dark:text-white">{t('learningMode', language)}</p>
                <p className="text-[10px] text-text-secondary-light uppercase font-black">{t('learningModeDesc', language)}</p>
              </div>
              <button onClick={() => { sounds.playClick(); onLearningModeChange(!learningMode); }} className={`w-12 h-6 rounded-full transition-all flex items-center p-1 ${learningMode ? 'bg-primary justify-end' : 'bg-slate-200 dark:bg-slate-800 justify-start'}`}><div className="w-4 h-4 bg-white rounded-full shadow-sm" /></button>
            </div>
            <div className="flex items-center justify-between pt-4 border-t border-gray-50 dark:border-gray-800">
              <div>
                <p className="font-bold dark:text-white">{t('timeFormat', language)}</p>
                <p className="text-[10px] text-text-secondary-light uppercase font-black">Calendar hours</p>
              </div>
              <div className="flex bg-slate-100 dark:bg-slate-900 p-1 rounded-xl">
                <button onClick={() => { sounds.playClick(); onTimeFormatChange('12h'); }} className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${timeFormat === '12h' ? 'bg-white shadow-sm text-primary-dark' : 'text-slate-400'}`}>12H</button>
                <button onClick={() => { sounds.playClick(); onTimeFormatChange('24h'); }} className={`px-4 py-2 text-xs font-black rounded-lg transition-all ${timeFormat === '24h' ? 'bg-white shadow-sm text-primary-dark' : 'text-slate-400'}`}>24H</button>
              </div>
            </div>
          </div>
        </section>

        {/* Family Management */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-primary text-2xl">groups</span>
            <h2 className="text-sm font-black uppercase tracking-widest text-text-secondary-light">{t('management', language)}</h2>
          </div>

          <div className="space-y-4">
            <div className="bg-white dark:bg-surface-dark rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">{t('yourKids', language)}</h3>
                <button onClick={openAddChild} className="size-8 rounded-full bg-primary/10 text-primary-dark flex items-center justify-center hover:bg-primary/20 transition-colors"><span className="material-symbols-outlined text-lg">add</span></button>
              </div>
              <div className="space-y-4">
                {children.map(child => (
                  <div key={child.id} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <img src={child.avatar} alt={child.name} className="size-12 rounded-full border-2 border-primary/20" />
                      <div>
                        <p className="font-bold dark:text-white">{child.name}</p>
                        <p className="text-[10px] text-text-secondary-light uppercase font-black">{t('level', language)} {child.level} • {child.stars} ⭐</p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditChild(child)} className="p-2 text-slate-400 hover:text-primary"><span className="material-symbols-outlined text-sm">edit</span></button>
                      <button onClick={() => { sounds.playClick(); onDeleteChild(child.id); }} className="p-2 text-slate-400 hover:text-red-400"><span className="material-symbols-outlined text-sm">delete</span></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-surface-dark rounded-3xl p-6 shadow-sm border border-gray-100 dark:border-gray-800">
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400">{t('parents', language)}</h3>
                <div className="flex gap-2">
                  <button onClick={() => setIsJoinModalOpen(true)} className="px-3 py-1 rounded-full bg-slate-100 dark:bg-slate-900 text-slate-500 text-[10px] font-black uppercase tracking-widest flex items-center gap-1 hover:bg-primary/10 hover:text-primary-dark transition-all"><span className="material-symbols-outlined text-sm">link</span> {t('joinFamily', language)}</button>
                  <button onClick={() => generateInvite()} className="size-8 rounded-full bg-primary/10 text-primary-dark flex items-center justify-center hover:bg-primary/20 transition-colors" title={t('inviteMember', language)}><span className="material-symbols-outlined text-lg">person_add</span></button>
                </div>
              </div>
              <div className="space-y-4">
                {guardians.map(guardian => (
                  <div key={guardian.id} className="flex items-center justify-between group">
                    <div className="flex items-center gap-3">
                      <div className="size-10 rounded-full bg-slate-100 dark:bg-slate-900 flex items-center justify-center font-bold text-slate-400 overflow-hidden">
                        {guardian.avatar ? <img src={guardian.avatar} className="size-full object-cover" /> : guardian.name.charAt(0)}
                      </div>
                      <div>
                        <p className="text-sm font-bold dark:text-white">{guardian.name} {guardian.isYou && <span className="text-[9px] bg-primary/20 text-primary-dark px-1 py-0.5 rounded ml-1 uppercase">YOU</span>}</p>
                        <p className="text-[10px] text-text-secondary-light uppercase font-black">{guardian.role}</p>
                      </div>
                    </div>
                    <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <button onClick={() => openEditGuardian(guardian)} className="p-2 text-slate-400 hover:text-primary"><span className="material-symbols-outlined text-sm">edit</span></button>
                      {!guardian.isYou && (
                        <button onClick={() => { sounds.playClick(); onDeleteGuardian(guardian.id); }} className="p-2 text-slate-400 hover:text-red-400"><span className="material-symbols-outlined text-sm">person_remove</span></button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>

        {/* Logout */}
        <div className="pt-8 text-center">
          <button
            onClick={() => {
              sounds.playClick();
              onLogout();
            }}
            className="text-red-400 font-bold text-xs uppercase tracking-widest hover:text-red-500 transition-colors"
          >
            {t('logout', language) || 'Log Out'}
          </button>
        </div>
      </main>

      {/* --- Modals --- */}
      {/* Join Modal */}
      {
        isJoinModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsJoinModalOpen(false)}></div>
            <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-[2.5rem] p-8 shadow-2xl animate-fade-in border border-slate-100 dark:border-slate-800 text-center">
              <div className="size-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
                <span className="material-symbols-outlined text-primary text-3xl">group_add</span>
              </div>
              <h3 className="text-xl font-black mb-1 dark:text-white">{t('joinFamily', language)}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-6">{t('enterCode', language)}</p>

              <input
                type="text"
                maxLength={6}
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                className="w-full bg-slate-50 dark:bg-slate-900 border-2 border-slate-100 dark:border-slate-800 rounded-2xl py-4 px-6 text-center text-3xl font-black tracking-[0.5em] text-primary focus:border-primary outline-none transition-all mb-8 placeholder:text-slate-200"
                placeholder="000000"
              />

              <div className="flex gap-4">
                <button onClick={() => setIsJoinModalOpen(false)} className="flex-1 py-4 font-bold text-slate-400">{t('cancel', language)}</button>
                <button
                  onClick={handleJoinFamily}
                  disabled={joinCode.length < 6}
                  className="flex-1 py-4 bg-primary text-text-main-light font-black rounded-2xl shadow-lg disabled:opacity-50 transition-all"
                >
                  {t('start', language)}!
                </button>
              </div>
            </div>
          </div>
        )
      }

      {/* Invite Modal */}
      {
        isInviteModalOpen && activeInvite && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsInviteModalOpen(false)}></div>
            <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-[2.5rem] p-8 shadow-2xl animate-fade-in border border-slate-100 dark:border-slate-800 text-center">
              <h3 className="text-xl font-black mb-1 dark:text-white">{t('inviteMember', language)}</h3>
              <p className="text-xs text-slate-400 font-bold uppercase tracking-widest mb-6">{t('inviteCode', language)}</p>

              <div className="bg-slate-50 dark:bg-slate-900 border-2 border-primary/20 rounded-3xl p-8 mb-4 relative group">
                <span className="text-4xl font-black tracking-widest text-primary-dark">{activeInvite.code}</span>
                <button
                  onClick={handleCopyCode}
                  className="absolute top-2 right-2 p-2 rounded-full bg-white dark:bg-slate-800 text-slate-400 hover:text-primary shadow-sm transition-all"
                >
                  <span className="material-symbols-outlined text-sm">{copied ? 'done' : 'content_copy'}</span>
                </button>
              </div>

              <p className="text-[11px] text-slate-500 font-medium mb-8 leading-relaxed">
                {t('inviteDesc', language)}<br />
                <span className="text-red-400 font-bold">{t('validFor', language)}</span>
              </p>

              <button onClick={() => setIsInviteModalOpen(false)} className="w-full py-4 bg-slate-900 dark:bg-slate-100 text-white dark:text-black font-black rounded-2xl shadow-lg">{t('continue', language)}</button>
            </div>
          </div>
        )
      }

      {/* Child Modal */}
      {
        isChildModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsChildModalOpen(false)}></div>
            <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-[2.5rem] p-8 shadow-2xl animate-fade-in border border-slate-100 dark:border-slate-800">
              <h3 className="text-xl font-black mb-6 dark:text-white">{editingChild ? t('editChild', language) : t('addChild', language)}</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('name', language)}</label>
                  <input type="text" value={childForm.name} onChange={e => setChildForm({ ...childForm, name: e.target.value })} className="w-full rounded-2xl border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none dark:text-white" placeholder="Child name..." />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('age', language)}</label>
                  <input type="number" value={childForm.age} onChange={e => setChildForm({ ...childForm, age: e.target.value })} className="w-full rounded-2xl border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none dark:text-white" placeholder="Age..." />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('avatar', language)}</label>
                  <div className="grid grid-cols-3 gap-3">
                    {CHILD_AVATAR_STYLES.map(style => {
                      const avatarUrl = getAvatarUrl(editingChild?.id || `preview_${Date.now()}`, style);
                      const isSelected = childForm.avatar === avatarUrl;
                      return (
                        <button
                          key={style}
                          type="button"
                          onClick={() => { sounds.playClick(); setChildForm({ ...childForm, avatar: avatarUrl }); }}
                          className={`aspect-square rounded-2xl overflow-hidden border-2 transition-all hover:scale-105 ${isSelected ? 'border-primary shadow-lg' : 'border-slate-200 dark:border-slate-700'
                            }`}
                        >
                          <img src={avatarUrl} alt={style} className="w-full h-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-slate-400 mt-2 text-center uppercase font-bold">Tap to select avatar style</p>
                </div>

                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('loveLanguages', language)}</label>
                  <p className="text-[10px] text-slate-400 mb-3 italic">{t('loveLanguagesDesc', language)}</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(['physical_touch', 'words_of_affirmation', 'quality_time', 'gifts', 'acts_of_service'] as LoveLanguage[]).map(langKey => {
                      const key = langKey as string;
                      const isSelected = childForm.loveLanguages?.includes(langKey);
                      const icons: Record<string, string> = {
                        physical_touch: 'front_hand',
                        words_of_affirmation: 'chat_bubble',
                        quality_time: 'schedule',
                        gifts: 'featured_seasonal_and_gifts',
                        acts_of_service: 'volunteer_activism'
                      };

                      return (
                        <button
                          key={key}
                          type="button"
                          onClick={() => {
                            sounds.playClick();
                            const current = childForm.loveLanguages || [];
                            const next = current.includes(key as any)
                              ? current.filter(l => l !== key)
                              : [...current, key as any];
                            setChildForm({ ...childForm, loveLanguages: next });
                          }}
                          className={`flex items-center gap-2 px-3 py-2 rounded-xl border-2 transition-all ${isSelected
                            ? 'border-primary bg-primary/5 text-primary-dark shadow-sm'
                            : 'border-slate-100 dark:border-slate-800 text-slate-400'
                            }`}
                        >
                          <span className="material-symbols-outlined text-sm">{icons[key]}</span>
                          <span className="text-[10px] font-bold text-left leading-tight">{t(key as any, language)}</span>
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              <div className="flex gap-4 mt-8">
                <button onClick={() => setIsChildModalOpen(false)} className="flex-1 py-4 font-bold text-slate-400">{t('cancel', language)}</button>
                <button onClick={saveChild} className="flex-1 py-4 bg-primary text-text-main-light font-black rounded-2xl shadow-lg">{t('save', language)}</button>
              </div>
            </div>
          </div>
        )
      }

      {/* Guardian Modal */}
      {
        isGuardianModalOpen && (
          <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
            <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => setIsGuardianModalOpen(false)}></div>
            <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-[2.5rem] p-8 shadow-2xl animate-fade-in border border-slate-100 dark:border-slate-800">
              <h3 className="text-xl font-black mb-6 dark:text-white">{editingGuardian ? t('editGuardian', language) : t('addGuardian', language)}</h3>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('name', language)}</label>
                  <input type="text" value={guardianForm.name} onChange={e => setGuardianForm({ ...guardianForm, name: e.target.value })} className="w-full rounded-2xl border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none dark:text-white" placeholder="Guardian name..." />
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('role', language)}</label>
                  <select value={guardianForm.role} onChange={e => setGuardianForm({ ...guardianForm, role: e.target.value as Guardian['role'] })} className="w-full rounded-2xl border-gray-100 dark:border-gray-800 bg-slate-50 dark:bg-slate-900 px-4 py-3 text-sm outline-none dark:text-white">
                    <option value="Admin">Admin</option>
                    <option value="Co-Parent">Co-Parent</option>
                    <option value="Guardian">Guardian</option>
                  </select>
                </div>
                <div>
                  <label className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 block">{t('avatar', language)} (Optional)</label>
                  <div className="grid grid-cols-4 gap-2">
                    {(['avataaars', 'personas', 'lorelei', 'micah'] as AvatarStyle[]).map(style => {
                      const avatarUrl = getAvatarUrl(editingGuardian?.id || `g_preview_${Date.now()}`, style);
                      const isSelected = guardianForm.avatar === avatarUrl;
                      return (
                        <button
                          key={style}
                          type="button"
                          onClick={() => { sounds.playClick(); setGuardianForm({ ...guardianForm, avatar: avatarUrl }); }}
                          className={`aspect-square rounded-xl overflow-hidden border-2 transition-all hover:scale-105 ${isSelected ? 'border-primary shadow-lg' : 'border-slate-200 dark:border-slate-700'
                            }`}
                        >
                          <img src={avatarUrl} alt={style} className="w-full h-full object-cover" />
                        </button>
                      );
                    })}
                  </div>
                  <p className="text-[9px] text-slate-400 mt-2 text-center uppercase font-bold">Tap to select or leave empty</p>
                </div>
              </div>
              <div className="flex gap-4 mt-8">
                <button onClick={() => setIsGuardianModalOpen(false)} className="flex-1 py-4 font-bold text-slate-400">{t('cancel', language)}</button>
                <button onClick={saveGuardian} className="flex-1 py-4 bg-primary text-text-main-light font-black rounded-2xl shadow-lg">{t('save', language)}</button>
              </div>
            </div>
          </div>
        )
      }

      {/* Navigation */}
      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] h-[72px] bg-white/90 dark:bg-surface-dark/90 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between px-2 z-30">
        <button onClick={() => handleNav('/')} className="flex-1 flex flex-col items-center justify-center gap-1 h-full rounded-[1.5rem] text-slate-400">
          <span className="material-symbols-outlined text-[24px]">dashboard</span>
          <span className="text-[10px] font-black tracking-wide uppercase">Parent</span>
        </button>
        <button onClick={() => handleNav('/child')} className="flex-1 flex flex-col items-center justify-center gap-1 h-full rounded-[1.5rem] text-slate-400">
          <span className="material-symbols-outlined text-[24px]">child_care</span>
          <span className="text-[10px] font-black tracking-wide uppercase">Child</span>
        </button>
        <button onClick={() => handleNav('/settings')} className="flex-1 flex flex-col items-center justify-center gap-1 h-full rounded-[1.5rem] text-primary relative">
          <div className="absolute inset-x-2 top-1.5 bottom-1.5 bg-primary/10 rounded-[1.2rem]"></div>
          <span className="material-symbols-outlined relative z-10 text-[24px]">settings</span>
          <span className="text-[10px] font-black relative z-10 tracking-wide uppercase">Settings</span>
        </button>
      </nav>
    </div >
  );
};

export default ParentSettings;
