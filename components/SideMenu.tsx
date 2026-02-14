
import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { DatabaseService } from '../services/database';
import { Language } from '../types';
import { t } from '../services/i18n';
import { sounds } from '../services/soundService';

interface SideMenuProps {
  isOpen: boolean;
  onClose: () => void;
  language: Language;
}

const SideMenu: React.FC<SideMenuProps> = ({ isOpen, onClose, language }) => {
  const navigate = useNavigate();
  const location = useLocation();

  const menuItems = [
    { name: t('parentDashboard', language), path: '/', icon: 'dashboard' },
    { name: t('childPortal', language), path: '/child', icon: 'child_care' },
    { name: t('familyTeam', language), path: '/settings', icon: 'groups' },
    { name: t('rewardsHub', language), path: '/rewards', icon: 'military_tech' },
    { name: t('settings', language), path: '/settings', icon: 'settings' },
  ];

  const handleReset = () => {
    if (confirm(t('resetConfirm', language))) {
      DatabaseService.resetData();
    }
  };

  const handleNav = (path: string) => {
    sounds.playClick();
    navigate(path);
    onClose();
  };

  return (
    <>
      <div 
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm z-[100] transition-opacity duration-300 ${isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'}`}
        onClick={onClose}
      />
      
      <div 
        className={`fixed top-0 left-0 h-full w-72 bg-white dark:bg-background-dark z-[101] shadow-2xl transform transition-transform duration-500 ease-in-out ${isOpen ? 'translate-x-0' : '-translate-x-full'}`}
      >
        <div className="p-8 border-b border-gray-100 dark:border-gray-800 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-primary text-3xl font-black">calendar_today</span>
            <h2 className="text-xl font-black text-text-main-light dark:text-white">KidsCalendar</h2>
          </div>
          <button onClick={onClose} className="p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800">
            <span className="material-symbols-outlined text-slate-400">close</span>
          </button>
        </div>
        
        <nav className="p-4 mt-4 space-y-2">
          {menuItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <button
                key={item.name}
                onClick={() => handleNav(item.path)}
                className={`w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold transition-all ${
                  isActive 
                    ? 'bg-primary/10 text-primary-dark shadow-sm' 
                    : 'text-slate-500 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-900'
                }`}
              >
                <span className={`material-symbols-outlined ${isActive ? 'fill-1' : ''}`}>{item.icon}</span>
                <span className="text-sm">{item.name}</span>
              </button>
            );
          })}

          <div className="pt-6 border-t border-gray-100 dark:border-gray-800 mt-6">
            <button
              onClick={handleReset}
              className="w-full flex items-center gap-4 px-5 py-4 rounded-2xl font-bold text-red-400 hover:bg-red-50 dark:hover:bg-red-900/10 transition-all"
            >
              <span className="material-symbols-outlined">delete_forever</span>
              <span className="text-sm">{t('resetData', language)}</span>
            </button>
          </div>
        </nav>
        
        <div className="absolute bottom-10 left-0 w-full px-6">
          <div className="p-5 bg-slate-50 dark:bg-surface-dark rounded-3xl border border-slate-100 dark:border-slate-800">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-primary/20 flex items-center justify-center text-primary-dark shadow-inner">
                <span className="material-symbols-outlined text-2xl">family_restroom</span>
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-black uppercase tracking-widest text-text-secondary-light">Version 1.0.4</p>
                <p className="text-[10px] text-slate-400 truncate">KidFriendly AI Engine</p>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default SideMenu;
