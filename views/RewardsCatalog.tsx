import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Child, Language, Reward } from '../types';
import SideMenu from '../components/SideMenu';
import { sounds } from '../services/soundService';
import { t } from '../services/i18n';

interface Props {
  children: Child[];
  language: Language;
  onSwitchChild: (id: string) => void;
  onRedeemReward: (childId: string, reward: Reward, note?: string) => boolean;
}

const RewardsCatalog: React.FC<Props> = ({ children, language, onSwitchChild, onRedeemReward }) => {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<string>('All');
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const [selectedReward, setSelectedReward] = useState<Reward | null>(null);
  const [redeemSuccess, setRedeemSuccess] = useState(false);
  const [redemptionNote, setRedemptionNote] = useState('');

  const activeChild = children.length > 0 ? (children.find(c => c.active) || children[0]) : null;

  const handleNav = (path: string) => {
    sounds.playClick();
    navigate(path);
  }

  const handleRedeem = () => {
    if (selectedReward && activeChild) {
      const success = onRedeemReward(activeChild.id, selectedReward, redemptionNote);
      if (success) {
        setRedeemSuccess(true);
        setTimeout(() => {
          setRedeemSuccess(false);
          setSelectedReward(null);
          setRedemptionNote('');
        }, 2000);
      }
    }
  };

  if (!activeChild) {
    return (
      <div className="min-h-screen bg-background-light dark:bg-background-dark flex flex-col items-center justify-center p-8 text-center animate-fade-in">
        <div className="size-24 bg-primary/10 rounded-[2.5rem] flex items-center justify-center mb-8">
          <span className="material-symbols-outlined text-primary text-6xl">military_tech</span>
        </div>
        <h2 className="text-2xl font-black dark:text-white mb-2">{language === 'es' ? 'Premios' : 'Rewards'}</h2>
        <p className="text-slate-400 font-bold mb-8">{language === 'es' ? 'Añade un niño primero para ver sus premios.' : 'Add a child first to see their rewards.'}</p>
        <button onClick={() => navigate('/')} className="px-8 py-4 bg-primary text-text-main-light font-black rounded-2xl shadow-lg active:scale-95 transition-all">
          {language === 'es' ? 'Ir a Ajustes' : 'Go to Settings'}
        </button>
      </div>
    );
  }

  const categories = [t('all', language), t('screenTime', language), t('toys', language), t('treats', language)];

  const filteredRewards = (activeChild.rewards || []).filter(r => {
    if (activeCategory === t('all', language) || activeCategory === 'All') return true;
    return (r.category || '').toLowerCase().includes(activeCategory.toLowerCase().split(' ')[0]);
  });

  return (
    <div className="bg-background-light dark:bg-background-dark min-h-screen pb-32 animate-fade-in font-display antialiased">
      <SideMenu
        isOpen={isMenuOpen}
        onClose={() => setIsMenuOpen(false)}
        language={language}
      />

      <header className="sticky top-0 z-50 flex flex-col bg-background-light/95 dark:bg-background-dark/95 backdrop-blur-md border-b border-gray-100 dark:border-gray-800">
        <div className="flex items-center p-4 pb-2 justify-between">
          <div className="w-12 h-12 flex items-center justify-center">
            <span className="material-symbols-outlined text-text-main-light dark:text-text-main-dark cursor-pointer" onClick={() => { sounds.playClick(); setIsMenuOpen(true); }}>menu</span>
          </div>
          <div className="flex-1 flex flex-col items-center">
            <h2 className="text-xl font-extrabold text-text-main-light dark:text-text-main-dark leading-none">{t('rewardsHub', language)}</h2>
            <div className="flex items-center gap-1 mt-1 text-primary-dark">
              <span className="material-symbols-outlined text-[14px]">stars</span>
              <span className="text-[12px] font-black uppercase tracking-widest">{activeChild.stars} {t('stars', language)}</span>
            </div>
          </div>
          <div className="w-12 h-12 flex items-center justify-center">
            <button onClick={() => handleNav('/settings')} className="p-2 text-primary">
              <span className="material-symbols-outlined">settings</span>
            </button>
          </div>
        </div>

        {/* Child Profile Switcher */}
        <div className="px-5 pb-4 mt-2">
          <div className="flex items-center gap-3 overflow-x-auto no-scrollbar pb-1">
            {children.map(child => (
              <button
                key={child.id}
                onClick={() => onSwitchChild(child.id)}
                className={`relative flex-shrink-0 size-11 rounded-full border-2 transition-all p-0.5 ${child.active ? 'border-primary scale-110 shadow-md' : 'border-transparent opacity-50'}`}
              >
                <img src={child.avatar} alt={child.name} className="size-full rounded-full object-cover" />
                {child.active && <div className="absolute -bottom-1 -right-1 size-4 bg-primary rounded-full flex items-center justify-center border-2 border-white"><span className="material-symbols-outlined text-[10px] text-white font-black">check</span></div>}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main className="px-5 mt-6">
        <div className="flex gap-3 pb-6 overflow-x-auto no-scrollbar mask-gradient-right">
          {categories.map(cat => (
            <button
              key={cat}
              onClick={() => { sounds.playClick(); setActiveCategory(cat); }}
              className={`flex h-9 shrink-0 items-center justify-center gap-x-2 rounded-full px-5 transition-all ${activeCategory === cat ? 'bg-primary text-text-main-light shadow-sm' : 'bg-surface-light dark:bg-surface-dark border border-gray-100 dark:border-gray-700'}`}
            >
              <p className={`text-sm ${activeCategory === cat ? 'font-bold' : 'font-medium'}`}>{cat}</p>
            </button>
          ))}
        </div>

        <div className="grid grid-cols-2 gap-4 pb-20">
          {filteredRewards.length === 0 ? (
            <div className="col-span-2 py-20 text-center opacity-30">
              <span className="material-symbols-outlined text-4xl mb-2">military_tech</span>
              <p className="text-xs font-black uppercase tracking-widest">No rewards in this category</p>
            </div>
          ) : (
            filteredRewards.map((reward) => (
              <div key={reward.id}
                onClick={() => { sounds.playClick(); setSelectedReward(reward); }}
                className="group relative flex flex-col bg-white dark:bg-surface-dark rounded-3xl p-3 shadow-sm border border-transparent hover:border-primary/20 transition-all cursor-pointer overflow-hidden"
              >
                <div className="absolute top-3 right-3 bg-white/90 dark:bg-black/40 backdrop-blur-sm px-2 py-1 rounded-full flex items-center gap-1 z-10">
                  <span className="text-xs font-black dark:text-white">{reward.cost}</span>
                  <span className="text-yellow-500 material-symbols-outlined" style={{ fontSize: '14px' }}>star</span>
                </div>
                <div className="aspect-square rounded-2xl mb-3 overflow-hidden bg-slate-50">
                  <img src={reward.image} alt={reward.title} className="w-full h-full object-cover group-hover:scale-105 transition-transform" />
                </div>
                <h3 className="text-sm font-black leading-tight mb-1 dark:text-white px-1 truncate">{reward.title}</h3>
              </div>
            ))
          )}
        </div>

        {/* Redemption History */}
        {(activeChild.redemptionHistory && activeChild.redemptionHistory.length > 0) && (
          <div className="mt-8 mb-20">
            <h3 className="text-lg font-black dark:text-white mb-4 flex items-center gap-2">
              <span className="material-symbols-outlined text-slate-400">history</span>
              {language === 'es' ? 'Historial de Canjes' : 'Redemption History'}
            </h3>
            <div className="space-y-3">
              {activeChild.redemptionHistory.slice(0, 10).map((record) => (
                <div key={record.id} className="bg-white dark:bg-surface-dark rounded-2xl p-4 shadow-sm border border-slate-100 dark:border-slate-800 flex items-start gap-3">
                  <div className="size-10 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center text-green-600 dark:text-green-400 flex-shrink-0">
                    <span className="material-symbols-outlined text-xl">check</span>
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-bold dark:text-white truncate">{record.rewardTitle}</p>
                    <p className="text-xs text-slate-400 font-medium">
                      {new Date(record.timestamp).toLocaleString(language === 'es' ? 'es-ES' : 'en-US')}
                    </p>
                    {record.note && (
                      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 italic bg-slate-50 dark:bg-slate-900 px-2 py-1 rounded-lg">
                        "{record.note}"
                      </p>
                    )}
                  </div>
                  <div className="text-xs font-black text-red-400 whitespace-nowrap">
                    -{record.cost} ★
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </main>

      {/* Redemption Modal */}
      {selectedReward && (
        <div className="fixed inset-0 z-[120] flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={() => !redeemSuccess && setSelectedReward(null)}></div>
          <div className="relative w-full max-w-sm bg-white dark:bg-surface-dark rounded-[2.5rem] p-8 shadow-2xl animate-fade-in border border-slate-100 dark:border-slate-800 text-center">
            {redeemSuccess ? (
              <div className="py-6 animate-bounce-short">
                <div className="size-20 bg-primary/20 rounded-full flex items-center justify-center mx-auto mb-4">
                  <span className="material-symbols-outlined text-primary text-4xl font-black">check</span>
                </div>
                <h3 className="text-2xl font-black dark:text-white mb-2">{t('greatJob', language)}!</h3>
                <p className="text-sm text-text-secondary-light font-bold">{t('youFinished', language)} {selectedReward.title}</p>
              </div>
            ) : (
              <>
                <img src={selectedReward.image} className="size-32 rounded-3xl object-cover mx-auto mb-6 shadow-lg" alt={selectedReward.title} />
                <h3 className="text-xl font-black mb-1 dark:text-white">{selectedReward.title}</h3>
                <p className="text-xs font-black text-slate-400 uppercase tracking-widest mb-6">{selectedReward.category}</p>

                <div className={`p-4 rounded-2xl border-2 mb-6 flex items-center justify-center gap-3 transition-colors ${activeChild.stars >= selectedReward.cost ? 'bg-primary/5 border-primary/20' : 'bg-red-50 dark:bg-red-900/10 border-red-100'}`}>
                  <span className="material-symbols-outlined text-yellow-500 text-2xl">stars</span>
                  <span className={`text-2xl font-black ${activeChild.stars >= selectedReward.cost ? 'text-primary-dark' : 'text-red-500'}`}>
                    {selectedReward.cost} {t('stars', language)}
                  </span>
                </div>

                <div className="mb-8 text-left">
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block ml-2">
                    {language === 'es' ? 'Nota (Opcional)' : 'Note (Optional)'}
                  </label>
                  <input
                    type="text"
                    value={redemptionNote}
                    onChange={(e) => setRedemptionNote(e.target.value)}
                    placeholder={language === 'es' ? 'Ej: "Tarde de cine"' : 'Ex: "Movie night"'}
                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-3 px-4 font-bold dark:text-white outline-none ring-2 ring-transparent focus:ring-primary/20 transition-all text-sm"
                  />
                </div>

                <div className="flex gap-4">
                  <button onClick={() => setSelectedReward(null)} className="flex-1 py-4 font-bold text-slate-400">{t('cancel', language)}</button>
                  <button
                    onClick={handleRedeem}
                    disabled={activeChild.stars < selectedReward.cost}
                    className="flex-1 py-4 bg-primary text-text-main-light font-black rounded-2xl shadow-lg disabled:opacity-50 disabled:grayscale transition-all"
                  >
                    {t('start', language)}!
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}

      <nav className="fixed bottom-6 left-1/2 -translate-x-1/2 w-[90%] h-[72px] bg-white/90 dark:bg-surface-dark/90 backdrop-blur-xl rounded-[2rem] shadow-2xl border border-slate-100 dark:border-slate-800 flex items-center justify-between px-2 z-30">
        <button onClick={() => handleNav('/')} className="flex-1 flex flex-col items-center justify-center gap-1 h-full rounded-[1.5rem] text-slate-400">
          <span className="material-symbols-outlined text-[24px]">dashboard</span>
          <span className="text-[10px] font-black tracking-wide uppercase">Parent</span>
        </button>
        <button onClick={() => handleNav('/child')} className="flex-1 flex flex-col items-center justify-center gap-1 h-full rounded-[1.5rem] text-slate-400">
          <span className="material-symbols-outlined text-[24px]">child_care</span>
          <span className="text-[10px] font-black tracking-wide uppercase">Child</span>
        </button>
        <button onClick={() => handleNav('/rewards')} className="flex-1 flex flex-col items-center justify-center gap-1 h-full rounded-[1.5rem] text-primary relative">
          <div className="absolute inset-x-2 top-1.5 bottom-1.5 bg-primary/10 rounded-[1.2rem]"></div>
          <span className="material-symbols-outlined relative z-10 text-[24px]">military_tech</span>
          <span className="text-[10px] font-black relative z-10 tracking-wide uppercase">Rewards</span>
        </button>
      </nav>
    </div >
  );
};

export default RewardsCatalog;
