'use client';

import { useState, useEffect, useCallback } from 'react';
import { authApi } from '../lib/api';
import { AuthState } from '../lib/types';

interface Props {
  onAuth: (auth: AuthState) => void;
}

export default function LoginPage({ onAuth }: Props) {
  const [tab, setTab] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [captchaId, setCaptchaId] = useState('');
  const [captchaQuestion, setCaptchaQuestion] = useState('');
  const [captchaAnswer, setCaptchaAnswer] = useState('');
  const [loadingCaptcha, setLoadingCaptcha] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const fetchCaptcha = useCallback(async () => {
    setLoadingCaptcha(true);
    setCaptchaAnswer('');
    try {
      const data = await authApi.getCaptcha();
      setCaptchaId(data.captchaId);
      setCaptchaQuestion(data.question);
    } catch {
      setCaptchaId('');
      setCaptchaQuestion('验证码加载失败');
    } finally {
      setLoadingCaptcha(false);
    }
  }, []);

  useEffect(() => {
    fetchCaptcha();
  }, [fetchCaptcha, tab]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    if (!captchaId || !captchaAnswer.trim()) {
      setError('请填写验证码');
      return;
    }
    setLoading(true);
    try {
      const result =
        tab === 'login'
          ? await authApi.login(username, password, captchaId, captchaAnswer.trim())
          : await authApi.register(username, password, captchaId, captchaAnswer.trim());
      localStorage.setItem('token', result.token);
      localStorage.setItem('user', JSON.stringify(result.user));
      onAuth(result);
    } catch (err) {
      setError(err instanceof Error ? err.message : '网络错误，请稍后重试');
      fetchCaptcha(); // 失败后刷新验证码
    } finally {
      setLoading(false);
    }
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4 dot-pattern"
      style={{ background: 'radial-gradient(ellipse at 50% 0%, rgba(37,99,235,0.08) 0%, #070a0e 60%)' }}
    >
      {/* Ambient glows */}
      <div className="fixed top-0 left-1/4 w-96 h-96 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(37,99,235,0.06), transparent 70%)', filter: 'blur(40px)' }} />
      <div className="fixed bottom-1/4 right-1/4 w-64 h-64 rounded-full pointer-events-none"
        style={{ background: 'radial-gradient(circle, rgba(6,182,212,0.04), transparent 70%)', filter: 'blur(40px)' }} />

      <div className="w-full max-w-sm relative scale-in">
        {/* Logo */}
        <div className="text-center mb-8">
          <div
            className="w-20 h-20 mx-auto mb-5 rounded-full flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(37,99,235,0.25), rgba(6,182,212,0.15))',
              border: '1px solid rgba(37,99,235,0.3)',
              boxShadow: '0 0 32px rgba(37,99,235,0.2), 0 0 64px rgba(37,99,235,0.08)',
              animation: 'spinDisc 10s linear infinite',
            }}
          >
            <svg viewBox="0 0 24 24" className="w-9 h-9 text-accent-glow" fill="currentColor"
              style={{ animation: 'spinDisc 10s linear infinite reverse' }}>
              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
            </svg>
          </div>
          <h1
            className="text-2xl font-bold tracking-wider"
            style={{ background: 'linear-gradient(90deg, #f0f4ff 30%, #60a5fa)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent' }}
          >
            MUSIC
          </h1>
          <p className="text-text-muted text-sm mt-1.5">私人音乐空间</p>
        </div>

        {/* Card */}
        <div className="glass-card p-6">
          {/* Tab */}
          <div className="p-1 flex mb-5 rounded-xl" style={{ background: 'rgba(7,10,14,0.6)', border: '1px solid rgba(37,99,235,0.1)' }}>
            {(['login', 'register'] as const).map((t) => (
              <button
                key={t}
                onClick={() => { setTab(t); setError(''); }}
                className="flex-1 py-2 rounded-lg text-sm font-medium transition-all duration-200"
                style={tab === t ? {
                  background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                  color: 'white',
                  boxShadow: '0 0 12px rgba(37,99,235,0.4)',
                } : { color: 'rgba(124,141,181,1)' }}
              >
                {t === 'login' ? '登录' : '注册'}
              </button>
            ))}
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">用户名</label>
              <input
                className="input-field w-full"
                placeholder="请输入用户名"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="username"
                required
              />
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">密码</label>
              <input
                type="password"
                className="input-field w-full"
                placeholder={tab === 'register' ? '至少 6 位' : '请输入密码'}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={tab === 'login' ? 'current-password' : 'new-password'}
                required
              />
            </div>

            {/* 验证码 */}
            <div>
              <label className="block text-xs text-text-muted mb-1.5 uppercase tracking-wide">验证码</label>
              <div className="flex gap-2">
                <div
                  className="input-field flex-1 flex items-center justify-center gap-2 min-h-[42px]"
                  style={{ background: 'rgba(7,10,14,0.6)', border: '1px solid rgba(37,99,235,0.2)' }}
                >
                  {loadingCaptcha ? (
                    <span className="text-text-muted text-sm">加载中…</span>
                  ) : (
                    <span className="text-text-primary font-mono text-sm select-none">{captchaQuestion}</span>
                  )}
                </div>
                <button
                  type="button"
                  onClick={fetchCaptcha}
                  disabled={loadingCaptcha}
                  className="btn-secondary shrink-0 px-3"
                  title="刷新验证码"
                >
                  刷新
                </button>
              </div>
              <input
                type="text"
                inputMode="numeric"
                autoComplete="off"
                className="input-field w-full mt-2"
                placeholder="请输入计算结果"
                value={captchaAnswer}
                onChange={(e) => setCaptchaAnswer(e.target.value)}
              />
            </div>

            {error && (
              <div className="text-red-400 text-xs bg-red-900/20 border border-red-800/30 rounded-lg px-3 py-2 fade-in">
                {error}
              </div>
            )}

            <button type="submit" className="btn-primary w-full py-2.5 mt-1" disabled={loading}>
              {loading ? (
                <span className="flex items-center justify-center gap-2">
                  <span className="eq-anim"><span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" /></span>
                  处理中…
                </span>
              ) : tab === 'login' ? '登录' : '注册'}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
