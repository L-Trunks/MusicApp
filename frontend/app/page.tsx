'use client';

import { useState, useEffect } from 'react';
import LoginPage from './components/LoginPage';
import PlayerPage from './components/PlayerPage';
import AdminPage from './components/AdminPage';
import { AuthState, User } from './lib/types';
import { authApi } from './lib/api';

type MainTab = 'player' | 'admin';

export default function Home() {
  const [auth, setAuth] = useState<AuthState | null>(null);
  const [activeTab, setActiveTab] = useState<MainTab>('player');
  const [hydrated, setHydrated] = useState(false);

  useEffect(() => {
    const token = localStorage.getItem('token');
    const userStr = localStorage.getItem('user');
    if (token && userStr) {
      try {
        const user = JSON.parse(userStr) as User;
        setAuth({ token, user });
        authApi.me(token).then((data) => {
          setAuth({ token: data.token, user: data.user });
          localStorage.setItem('token', data.token);
          localStorage.setItem('user', JSON.stringify(data.user));
        }).catch(() => {
          localStorage.removeItem('token');
          localStorage.removeItem('user');
          setAuth(null);
        });
      } catch {
        localStorage.removeItem('token');
        localStorage.removeItem('user');
      }
    }
    setHydrated(true);
  }, []);

  const handleAuth = (newAuth: AuthState) => setAuth(newAuth);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    setAuth(null);
    setActiveTab('player');
  };

  const handleUserUpdate = (updatedUser: User) => {
    if (!auth) return;
    const newAuth = { ...auth, user: updatedUser };
    setAuth(newAuth);
    localStorage.setItem('user', JSON.stringify(updatedUser));
  };

  if (!hydrated) {
    return (
      <div className="h-screen bg-bg-primary flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="relative w-14 h-14">
            <div
              className="w-14 h-14 rounded-full border-2 border-accent-primary/30"
              style={{ animation: 'spinDisc 3s linear infinite' }}
            />
            <div className="absolute inset-0 flex items-center justify-center">
              <svg viewBox="0 0 24 24" className="w-5 h-5 text-accent-primary" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          </div>
          <div className="text-text-muted text-xs tracking-widest uppercase">Loading</div>
        </div>
      </div>
    );
  }

  if (!auth) return <LoginPage onAuth={handleAuth} />;

  return (
    <div className="h-screen bg-bg-primary flex flex-col overflow-hidden">
      {/* 顶部导航栏 */}
      <header
        className="header-glow px-4 py-2.5 flex items-center justify-between flex-shrink-0 z-50"
        style={{
          background: 'linear-gradient(to bottom, rgba(11,15,22,0.98), rgba(7,10,14,0.95))',
          borderBottom: '1px solid rgba(37,99,235,0.12)',
          backdropFilter: 'blur(16px)',
        }}
      >
        <div className="flex items-center gap-3">
          {/* Logo */}
          <div
            className="w-8 h-8 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{
              background: 'linear-gradient(135deg, rgba(37,99,235,0.3), rgba(6,182,212,0.2))',
              border: '1px solid rgba(37,99,235,0.3)',
              boxShadow: '0 0 12px rgba(37,99,235,0.2)',
            }}
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4 text-accent-glow" fill="currentColor">
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
          <span
            className="font-bold hidden sm:block tracking-wider text-sm"
            style={{ background: 'linear-gradient(90deg, #f0f4ff, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            MUSIC APP
          </span>
          <span className="text-border/40 hidden sm:block">|</span>
          <span className="text-text-secondary text-sm">{auth.user.username}</span>
          <span className={`text-xs px-1.5 py-0.5 rounded-full ${
            auth.user.role === 'admin'
              ? 'text-accent-glow border'
              : 'bg-bg-card text-text-muted border border-border'
          }`}
            style={auth.user.role === 'admin' ? {
              background: 'rgba(37,99,235,0.15)',
              borderColor: 'rgba(37,99,235,0.3)',
              boxShadow: '0 0 6px rgba(37,99,235,0.2)',
            } : {}}
          >
            {auth.user.role}
          </span>
        </div>

        <div className="flex items-center gap-1">
          {(['player', ...(auth.user.role === 'admin' ? ['admin'] : [])] as MainTab[]).map((t) => (
            <button
              key={t}
              onClick={() => setActiveTab(t)}
              className="px-3 py-1.5 rounded-lg text-sm font-medium transition-all duration-200"
              style={activeTab === t ? {
                background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                color: 'white',
                boxShadow: '0 0 12px rgba(37,99,235,0.4)',
              } : {
                color: 'rgba(124,141,181,1)',
              }}
            >
              {t === 'player' ? '播放器' : '管理后台'}
            </button>
          ))}
          <button
            onClick={handleLogout}
            className="ml-1 px-3 py-1.5 rounded-lg text-sm text-text-muted hover:text-red-400 hover:bg-red-900/20 transition-all duration-200"
          >
            退出
          </button>
        </div>
      </header>

      {/* 主内容区 — PlayerPage 始终挂载，切换 Admin 时仅隐藏，不销毁，保留播放状态 */}
      <main className="flex-1 min-h-0 overflow-hidden">
        <div className={`h-full ${activeTab === 'player' ? '' : 'hidden'}`}>
          <PlayerPage token={auth.token} currentUser={auth.user} />
        </div>
        {activeTab === 'admin' && auth.user.role === 'admin' && (
          <div className="h-full overflow-y-auto p-4">
            <AdminPage token={auth.token} currentUser={auth.user} onUserUpdate={handleUserUpdate} />
          </div>
        )}
      </main>
    </div>
  );
}
