
import React, { useState } from 'react';
import { DatabaseService, UserAccount } from '../services/database';
import { Language } from '../types';
import { t } from '../services/i18n';
import { sounds } from '../services/soundService';
import { supabase } from '../services/supabase';

interface Props {
  language: Language;
  onAuthSuccess: (user: UserAccount) => void;
  currentUser?: UserAccount | null;
}

const AuthView: React.FC<Props> = ({ language, onAuthSuccess, currentUser }) => {
  const [step, setStep] = useState<'welcome' | 'login' | 'register' | 'family'>('welcome');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [name, setName] = useState('');
  const [joinCode, setJoinCode] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [tempUser, setTempUser] = useState<UserAccount | null>(null);

  React.useEffect(() => {
    if (currentUser && !currentUser.familyId) {
      setTempUser(currentUser);
      setStep('family');
    }
  }, [currentUser]);

  const handleRegister = async () => {
    if (!email.trim() || !name.trim() || !password.trim()) {
      setError('Please fill in all fields');
      return;
    }
    setError('');

    try {
      const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: name,
            avatar_url: `https://api.dicebear.com/7.x/avataaars/svg?seed=${name}`
          }
        }
      });

      if (error) throw error;

      if (data.session) {
        // Automatically logged in
        sounds.playSuccess();
        // The App component will detect the session change
      } else if (data.user) {
        // User created but no session returned
        sounds.playSuccess();
        setError(language === 'es' ?
          'Cuenta creada. Si se te pide verificar, borra los usuarios de prueba en el panel de Supabase y usa un correo nuevo.' :
          'Account created. If still asked for verification, please delete old test users in Supabase and use a new email.'
        );
      } else {
        // Fallback for other cases
        sounds.playSuccess();
        setError(language === 'es' ? 'Revisa tu correo para confirmar el registro' : 'Please check your email to confirm registration');
      }
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Error registering');
      sounds.playClick();
    }
  };

  const handleLogin = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password');
      return;
    }
    setError('');

    try {
      const { error } = await supabase.auth.signInWithPassword({
        email,
        password
      });

      if (error) throw error;
      sounds.playSuccess();
      // App component will detect session
    } catch (e: any) {
      console.error(e);
      setError(e.message || 'Invalid login credentials');
      sounds.playClick();
    }
  };

  const handleCreateFamily = async () => {
    if (tempUser && tempUser.id) {
      setIsLoading(true);
      setError('');
      console.log("Auth: Creating family for user:", tempUser.id);

      try {
        const familyName = language === 'es' ? `Familia de ${tempUser.name}` : `${tempUser.name}'s Family`;
        const familyId = await DatabaseService.createFamily(tempUser.id, familyName);

        console.log("Auth: Family created successfully:", familyId);

        const updatedUser = { ...tempUser, familyId };
        onAuthSuccess(updatedUser);
        sounds.playSuccess();
      } catch (e: any) {
        console.error("Auth: Error creating family:", e);
        setError(e.message || 'Error creating family');
        sounds.playClick();
      } finally {
        setIsLoading(false);
      }
    } else {
      console.error("Auth: No tempUser or id found", tempUser);
      setError("User session not found. Please try logging in again.");
    }
  };

  const handleJoinFamily = async () => {
    if (tempUser && tempUser.id && joinCode.length >= 6) {
      setIsLoading(true);
      setError('');
      console.log("Auth: Joining family:", joinCode, "for user:", tempUser.id);

      try {
        const familyId = await DatabaseService.joinFamily(tempUser.id, joinCode);
        console.log("Auth: Joined family successfully:", familyId);

        const updatedUser = { ...tempUser, familyId };
        onAuthSuccess(updatedUser);
        sounds.playSuccess();
      } catch (e: any) {
        console.error("Auth: Error joining family:", e);
        setError(e.message || 'Error joining family');
        sounds.playClick();
      } finally {
        setIsLoading(false);
      }
    }
  };

  const handleGoogleLogin = async () => {
    try {
      console.log("AuthView: Initializing Google OAuth...");
      setIsLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/'
        }
      });
      if (error) throw error;
      // Note: Redirect happens here, so no setIsLoading(false) needed in success
    } catch (e: any) {
      console.error("AuthView: Google Login Error:", e);
      setError('Error connecting to Google: ' + (e.message || 'Unknown error'));
      setIsLoading(false);
    }
  };

  const handleLogout = async () => {
    try {
      setIsLoading(true);
      await supabase.auth.signOut();
      DatabaseService.resetData();
    } catch (e: any) {
      console.error("Logout error:", e);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background-light dark:bg-background-dark flex items-center justify-center p-6 animate-fade-in text-display">
      <div className="w-full max-w-sm space-y-8">
        <div className="text-center">
          <div className="size-20 bg-primary/10 rounded-[2.5rem] flex items-center justify-center mx-auto mb-6 shadow-sm">
            <span className="material-symbols-outlined text-primary text-5xl font-black">calendar_today</span>
          </div>
          <h1 className="text-4xl font-black dark:text-white tracking-tighter">KidsCalendar</h1>
          <p className="text-slate-400 font-bold mt-2 uppercase tracking-widest text-xs">Family Adventure Tracker</p>
        </div>

        {step === 'welcome' && (
          <div className="space-y-4 pt-8">
            <button
              onClick={() => { sounds.playClick(); setStep('register'); }}
              className="w-full py-5 bg-primary text-text-main-light font-black rounded-[2rem] shadow-lg transform active:scale-95 transition-all text-lg"
            >
              {language === 'es' ? 'Crear Cuenta' : 'Create Account'}
            </button>
            <button
              onClick={() => { sounds.playClick(); setStep('login'); }}
              className="w-full py-5 bg-white dark:bg-surface-dark text-slate-600 dark:text-slate-300 font-black rounded-[2rem] border border-slate-100 dark:border-slate-800 active:scale-95 transition-all"
            >
              {language === 'es' ? 'Ya tengo cuenta' : 'I have an account'}
            </button>

            <div className="relative py-2 flex items-center">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
              <span className="flex-shrink mx-4 text-xs font-black text-slate-300 uppercase tracking-[0.2em]">{language === 'es' ? 'o continuar con' : 'or continue with'}</span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            </div>

            <button
              onClick={handleGoogleLogin}
              className="w-full py-4 bg-white dark:bg-surface-dark text-slate-600 dark:text-slate-300 font-bold rounded-[2rem] border border-slate-100 dark:border-slate-800 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
              <span>Google</span>
            </button>
          </div>
        )}

        {(step === 'login' || step === 'register') && (
          <div className="bg-white dark:bg-surface-dark rounded-[3rem] p-8 shadow-2xl border border-slate-50 dark:border-slate-800 space-y-6 animate-fade-in">
            <h2 className="text-2xl font-black dark:text-white text-center">
              {step === 'login' ? (language === 'es' ? '¡Hola de nuevo!' : 'Welcome back!') : (language === 'es' ? 'Regístrate' : 'Get Started')}
            </h2>

            <div className="space-y-4">
              {step === 'register' && (
                <div>
                  <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Name</label>
                  <input
                    type="text"
                    value={name}
                    onChange={e => setName(e.target.value)}
                    className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-bold dark:text-white outline-none ring-2 ring-transparent focus:ring-primary/20 transition-all"
                    placeholder="Your name"
                  />
                </div>
              )}
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Email</label>
                <input
                  type="email"
                  value={email}
                  onChange={e => { setEmail(e.target.value); setError(''); }}
                  className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-bold dark:text-white outline-none ring-2 ring-transparent focus:ring-primary/20 transition-all"
                  placeholder="parent@email.com"
                />
              </div>
              <div>
                <label className="text-[10px] font-black uppercase text-slate-400 tracking-widest mb-2 block">Password</label>
                <input
                  type="password"
                  value={password}
                  onChange={e => { setPassword(e.target.value); setError(''); }}
                  className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-bold dark:text-white outline-none ring-2 ring-transparent focus:ring-primary/20 transition-all"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && <p className="text-red-500 text-xs font-bold text-center">{error}</p>}

            <button
              onClick={step === 'login' ? handleLogin : handleRegister}
              className="w-full py-4 bg-primary text-text-main-light font-black rounded-2xl shadow-lg active:scale-95 transition-all mt-4"
            >
              {language === 'es' ? 'Continuar' : 'Continue'}
            </button>

            <div className="relative py-2 flex items-center">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
              <span className="flex-shrink mx-4 text-xs font-black text-slate-300 uppercase tracking-[0.2em]">{language === 'es' ? 'o' : 'or'}</span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            </div>

            <button
              onClick={handleGoogleLogin}
              className="w-full py-3 bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-300 font-bold rounded-2xl border border-slate-100 dark:border-slate-800 active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              <img src="https://www.google.com/favicon.ico" alt="Google" className="w-5 h-5" />
              <span>Google</span>
            </button>

            <button onClick={() => setStep('welcome')} className="w-full text-xs font-bold text-slate-400 uppercase tracking-widest mt-4">{t('cancel', language)}</button>
          </div>
        )}

        {step === 'family' && (
          <div className="space-y-6 animate-fade-in">
            <div className="text-center mb-8">
              <h2 className="text-2xl font-black dark:text-white">Welcome, {tempUser?.name}!</h2>
              <p className="text-sm text-slate-400 font-bold mt-1">Choose how to start your family team</p>
            </div>

            <button
              onClick={handleCreateFamily}
              disabled={isLoading}
              className={`w-full bg-white dark:bg-surface-dark p-8 rounded-[2.5rem] border-2 border-primary/20 hover:border-primary shadow-sm group transition-all text-left ${isLoading ? 'opacity-50' : ''}`}
            >
              <span className="material-symbols-outlined text-primary text-4xl mb-4 group-hover:scale-110 transition-transform">
                {isLoading ? 'autorenew' : 'add_circle'}
              </span>
              <h3 className="text-xl font-black dark:text-white">
                {isLoading ? (language === 'es' ? 'Creando...' : 'Creating...') : (language === 'es' ? 'Crear Nuevo Equipo' : 'Create New Family')}
              </h3>
              <p className="text-xs text-slate-400 font-bold uppercase mt-1">Start as Administrator</p>
            </button>

            <div className="relative py-2 flex items-center">
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
              <span className="flex-shrink mx-4 text-xs font-black text-slate-300 uppercase tracking-[0.2em]">{language === 'es' ? 'o bien' : 'or join'}</span>
              <div className="flex-grow border-t border-slate-200 dark:border-slate-800"></div>
            </div>

            <div className="bg-white dark:bg-surface-dark p-8 rounded-[2.5rem] border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
              <div className="flex items-center gap-3 mb-2">
                <span className="material-symbols-outlined text-primary">link</span>
                <h3 className="font-black dark:text-white">{t('joinFamily', language)}</h3>
              </div>
              <input
                type="text"
                maxLength={6}
                value={joinCode}
                onChange={e => setJoinCode(e.target.value.toUpperCase())}
                placeholder="6-DIGIT CODE"
                className="w-full bg-slate-50 dark:bg-slate-900 border-none rounded-2xl py-4 px-6 font-black text-center tracking-[0.3em] dark:text-white outline-none ring-2 ring-transparent focus:ring-primary/20 transition-all"
              />
              <button
                onClick={handleJoinFamily}
                disabled={joinCode.length < 6 || isLoading}
                className="w-full py-4 bg-slate-900 dark:bg-slate-100 text-white dark:text-black font-black rounded-2xl disabled:opacity-30 transition-all"
              >
                {isLoading ? (language === 'es' ? 'Uniendo...' : 'Joining...') : t('start', language) + '!'}
              </button>
              {error && <p className="text-red-500 text-xs font-bold text-center mt-2">{error}</p>}
            </div>

            <div className="text-center pt-8">
              <button
                onClick={handleLogout}
                className="text-slate-400 font-bold text-xs uppercase tracking-widest hover:text-red-400 transition-colors"
                disabled={isLoading}
              >
                {language === 'es' ? 'Cerrar Sesión' : 'Log Out'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default AuthView;
