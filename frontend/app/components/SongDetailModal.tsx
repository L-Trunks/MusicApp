'use client';

import { useState, useEffect, useRef } from 'react';
import { Song, Comment, formatDuration, formatDateTime } from '../lib/types';
import { commentsApi } from '../lib/api';

interface Props {
  song: Song;
  token: string;
  isPlaying: boolean;
  onClose: () => void;
  onPlayPause: () => void;
}

export default function SongDetailModal({ song, token, isPlaying, onClose, onPlayPause }: Props) {
  const [comments, setComments] = useState<Comment[]>([]);
  const [loading, setLoading] = useState(false);
  const [input, setInput] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const isVirtual = song.id === -1;

  useEffect(() => {
    if (isVirtual) return;
    setLoading(true);
    commentsApi.list(token, song.id)
      .then(setComments)
      .catch(() => setComments([]))
      .finally(() => setLoading(false));
  }, [song.id, token, isVirtual]);

  useEffect(() => {
    // 关闭时 Esc
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const submit = async () => {
    if (!input.trim() || isVirtual) return;
    setError(''); setSubmitting(true);
    try {
      const c = await commentsApi.create(token, song.id, input.trim());
      setComments((p) => [...p, c]);
      setInput('');
      setTimeout(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), 100);
    } catch (e) {
      setError(e instanceof Error ? e.message : '评论失败');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center"
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 modal-backdrop" />

      {/* Modal */}
      <div className="relative w-full sm:w-[500px] sm:max-h-[85vh] max-h-[92vh] modal-content rounded-t-2xl sm:rounded-2xl flex flex-col overflow-hidden scale-in">
        {/* Decorative top gradient */}
        <div className="absolute top-0 left-0 right-0 h-32 pointer-events-none"
          style={{ background: 'linear-gradient(to bottom, rgba(37,99,235,0.06), transparent)' }} />

        {/* Header */}
        <div className="relative flex items-center justify-between px-5 py-3.5 border-b flex-shrink-0"
          style={{ borderColor: 'rgba(37,99,235,0.12)' }}>
          <span className="text-sm font-semibold text-text-primary">歌曲详情</span>
          <button className="btn-icon" onClick={onClose}>
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
            </svg>
          </button>
        </div>

        {/* Song info */}
        <div className="relative flex gap-4 px-5 py-4 border-b flex-shrink-0"
          style={{ borderColor: 'rgba(37,99,235,0.1)' }}>
          {song.coverUrl ? (
            <div className="relative flex-shrink-0">
              <img src={song.coverUrl} alt={song.title}
                className={`w-20 h-20 object-cover flex-shrink-0 ${isPlaying ? 'cover-disc' : 'cover-disc paused'}`}
                style={{
                  boxShadow: isPlaying
                    ? '0 0 20px rgba(37,99,235,0.5), 0 0 40px rgba(37,99,235,0.2)'
                    : '0 4px 16px rgba(0,0,0,0.4)',
                }}
              />
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-4 h-4 rounded-full bg-bg-primary/80 border border-border/60" />
              </div>
            </div>
          ) : (
            <div
              className={`w-20 h-20 rounded-full flex items-center justify-center flex-shrink-0 ${isPlaying ? 'cover-disc' : 'cover-disc paused'}`}
              style={{
                background: 'linear-gradient(135deg, rgba(37,99,235,0.3), rgba(6,182,212,0.2))',
                border: '1px solid rgba(37,99,235,0.3)',
                boxShadow: isPlaying ? '0 0 20px rgba(37,99,235,0.4)' : '0 4px 16px rgba(0,0,0,0.4)',
              }}
            >
              <svg viewBox="0 0 24 24" className="w-8 h-8 text-accent-primary" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}
          <div className="flex-1 min-w-0 flex flex-col justify-between">
            <div>
              <h2 className="font-bold text-text-primary text-base truncate">{song.title}</h2>
              <p className="text-sm text-text-secondary mt-0.5 truncate">
                {song.artist || '未知歌手'}
                {song.album && <span className="text-text-muted"> · {song.album}</span>}
              </p>
              <p className="text-xs text-text-muted mt-1">
                {formatDuration(song.durationSec)}
                {song.owner?.username && ` · 上传: ${song.owner.username}`}
              </p>
            </div>
            <div className="flex items-center gap-2 mt-2">
              <span className={`badge-${song.visibility}`}>{song.visibility}</span>
              <button
                className={`play-btn-glow w-8 h-8 ${isPlaying ? 'playing' : ''}`}
                onClick={onPlayPause}
                title={isPlaying ? '暂停' : '播放'}
              >
                {isPlaying ? (
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                    <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
                  </svg>
                ) : (
                  <svg viewBox="0 0 24 24" className="w-4 h-4 ml-0.5" fill="currentColor">
                    <path d="M8 5v14l11-7z" />
                  </svg>
                )}
              </button>
              {isPlaying && (
                <span className="eq-anim ml-1">
                  <span className="eq-bar" />
                  <span className="eq-bar" />
                  <span className="eq-bar" />
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Comments */}
        {isVirtual ? (
          <div className="flex-1 flex flex-col items-center justify-center text-text-muted text-sm p-6 gap-3">
            <svg viewBox="0 0 24 24" className="w-10 h-10 opacity-20" fill="currentColor">
              <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z" />
            </svg>
            <p>外站/URL 播放歌曲暂不支持评论</p>
          </div>
        ) : (
          <>
            <div className="flex-1 overflow-y-auto px-5 py-3 space-y-2.5 min-h-0">
              {loading ? (
                <div className="space-y-2 pt-2">
                  {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="skeleton h-14 w-full" style={{ animationDelay: `${i * 0.1}s` }} />
                  ))}
                </div>
              ) : comments.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-8 gap-2 text-text-muted text-sm">
                  <svg viewBox="0 0 24 24" className="w-8 h-8 opacity-20" fill="currentColor">
                    <path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-2 12H6v-2h12v2zm0-3H6V9h12v2zm0-3H6V6h12v2z" />
                  </svg>
                  <p>暂无评论，来留下第一条吧</p>
                </div>
              ) : (
                comments.map((c, i) => (
                  <div
                    key={c.id}
                    className="glass-card px-3 py-2.5 fade-in-up"
                    style={{ animationDelay: `${i * 0.04}s` }}
                  >
                    <div className="flex items-baseline gap-2 mb-1">
                      <span className="text-xs font-semibold" style={{ color: '#60a5fa' }}>{c.user.username}</span>
                      <span className="text-xs text-text-muted">{formatDateTime(c.createdAt)}</span>
                    </div>
                    <p className="text-sm text-text-primary leading-relaxed break-words">{c.content}</p>
                  </div>
                ))
              )}
              <div ref={endRef} />
            </div>

            {/* Comment input */}
            <div className="px-5 py-3 border-t flex-shrink-0" style={{ borderColor: 'rgba(37,99,235,0.1)' }}>
              {error && <p className="text-red-400 text-xs mb-1.5">{error}</p>}
              <div className="flex gap-2">
                <input
                  className="input-field flex-1 text-sm"
                  placeholder="写评论… Enter 发送"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); submit(); } }}
                />
                <button
                  className="btn-primary text-sm px-3"
                  disabled={!input.trim() || submitting}
                  onClick={submit}
                >
                  {submitting ? '…' : '发送'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
