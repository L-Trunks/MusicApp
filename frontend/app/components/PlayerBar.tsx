'use client';

import { Song, PlayMode, formatDuration } from '../lib/types';

const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 2];

// 播放模式图标（SVG，更直观）
const PlayModeIcon = ({ mode, className = 'w-4 h-4' }: { mode: PlayMode; className?: string }) => {
  const c = className;
  // 顺序播放：循环箭头（列表顺序）
  if (mode === 'sequential') {
    return (
      <svg viewBox="0 0 24 24" className={c} fill="currentColor" aria-hidden>
        <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
      </svg>
    );
  }
  if (mode === 'shuffle') {
    return (
      <svg viewBox="0 0 24 24" className={c} fill="currentColor" aria-hidden>
        <path d="M10.59 9.17L5.41 4 4 5.41l5.17 5.17 1.42-1.41zM14.5 4l2.04 2.04-4.18 4.18 1.41 1.41 4.18-4.18L20 9.5V4h-5.5zm.33 9.92l-1.41 1.41 4.18 4.18L14.5 20H20v-5.5l-2.04 2.04-4.18-4.18zm-9.09 1.41L4 18.59 5.41 20l4.17-4.17 1.41 1.42z" />
      </svg>
    );
  }
  // 单曲循环：顺序播放的循环箭头 + 中间数字 1
  return (
    <svg viewBox="0 0 24 24" className={c} fill="currentColor" aria-hidden>
      <path d="M7 7h10v3l4-4-4-4v3H5v6h2V7zm10 10H7v-3l-4 4 4 4v-3h12v-6h-2v4z" />
      <text x="12" y="13.5" textAnchor="middle" fontSize="8" fontWeight="bold" fill="currentColor" fontFamily="system-ui, sans-serif">1</text>
    </svg>
  );
};

const PLAY_MODE_LABELS: Record<PlayMode, string> = {
  sequential: '顺序播放',
  shuffle: '随机播放',
  'repeat-one': '单曲循环',
};

interface Props {
  currentSong: Song | null;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  playMode: PlayMode;
  playbackRate: number;
  showSpeedMenu: boolean;
  onPlayPause: () => void;
  onPrev: () => void;
  onNext: () => void;
  onSeek: (t: number) => void;
  onVolumeChange: (v: number) => void;
  onModeChange: () => void;
  onRateChange: (r: number) => void;
  onToggleSpeedMenu: () => void;
  onSongClick: () => void;
  isVideo: boolean;
  showVideo: boolean;
  onToggleVideo: () => void;
  onOpenPlaylist?: () => void;
  playlistCount?: number;
}

export default function PlayerBar({
  currentSong, isPlaying, currentTime, duration, volume,
  playMode, playbackRate, showSpeedMenu,
  onPlayPause, onPrev, onNext, onSeek, onVolumeChange,
  onModeChange, onRateChange, onToggleSpeedMenu, onSongClick,
  isVideo, showVideo, onToggleVideo,
  onOpenPlaylist, playlistCount = 0,
}: Props) {
  const pct = duration > 0 ? (currentTime / duration) * 100 : 0;
  const modeLabel = PLAY_MODE_LABELS[playMode];

  return (
    <div className="player-bar-bg px-3 sm:px-5 py-2.5 flex-shrink-0 select-none">
      {/* ── Progress bar ── */}
      <div className="flex items-center gap-2 mb-2.5">
        <span className="text-xs text-text-muted w-9 text-right tabular-nums font-mono">
          {formatDuration(Math.floor(currentTime))}
        </span>
        <div className="flex-1 relative group">
          <input
            type="range"
            className="progress-bar w-full"
            min={0}
            max={duration || 100}
            step={0.5}
            value={currentTime}
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            style={{
              background: `linear-gradient(to right, #3b82f6 ${pct}%, rgba(26,38,64,0.8) ${pct}%)`,
            }}
          />
        </div>
        <span className="text-xs text-text-muted w-9 tabular-nums font-mono">
          {formatDuration(Math.floor(duration))}
        </span>
      </div>

      {/* ── Controls row ── */}
      <div className="flex items-center gap-2">
        {/* ── Song info ── */}
        <div
          className="flex items-center gap-2.5 flex-1 min-w-0 cursor-pointer group"
          onClick={currentSong ? onSongClick : undefined}
        >
          {/* Cover art */}
          {currentSong?.coverUrl ? (
            <div className="relative w-10 h-10 flex-shrink-0">
              <img
                src={currentSong.coverUrl}
                alt={currentSong.title}
                className={`w-10 h-10 object-cover flex-shrink-0 ${isPlaying ? 'cover-disc' : 'cover-disc paused'}`}
                style={{
                  boxShadow: isPlaying
                    ? '0 0 12px rgba(37,99,235,0.5), 0 0 24px rgba(37,99,235,0.2)'
                    : '0 2px 8px rgba(0,0,0,0.4)',
                }}
              />
              {/* Center hole */}
              <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="w-2.5 h-2.5 rounded-full bg-bg-primary border border-border/60" />
              </div>
            </div>
          ) : (
            <div
              className={`w-10 h-10 rounded-full flex items-center justify-center flex-shrink-0 transition-all ${isPlaying ? 'cover-disc' : 'cover-disc paused'}`}
              style={{
                background: 'linear-gradient(135deg, rgba(37,99,235,0.3), rgba(6,182,212,0.2))',
                border: '1px solid rgba(37,99,235,0.3)',
                boxShadow: isPlaying ? '0 0 12px rgba(37,99,235,0.4)' : 'none',
              }}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-accent-primary" fill="currentColor">
                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
              </svg>
            </div>
          )}

          {/* Title + artist */}
          <div className="min-w-0">
            <div className={`text-sm font-medium truncate transition-colors duration-200 ${
              currentSong ? 'text-text-primary group-hover:text-accent-glow' : 'text-text-muted'
            }`}>
              {currentSong?.title ?? '未在播放'}
            </div>
            <div className="text-xs text-text-muted truncate">
              {currentSong ? (currentSong.artist || '未知歌手') : '点击歌曲开始播放'}
            </div>
          </div>
        </div>

        {/* ── Center controls ── */}
        <div className="flex items-center gap-1 flex-shrink-0">
          {/* Prev */}
          <button className="btn-icon" onClick={onPrev} title="上一首">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M6 6h2v12H6zm3.5 6 8.5 6V6z" />
            </svg>
          </button>

          {/* Play/Pause */}
          <button
            className={`play-btn-glow ${isPlaying ? 'playing' : ''}`}
            onClick={onPlayPause}
          >
            {isPlaying ? (
              <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                <path d="M6 19h4V5H6v14zm8-14v14h4V5h-4z" />
              </svg>
            ) : (
              <svg viewBox="0 0 24 24" className="w-5 h-5 ml-0.5" fill="currentColor">
                <path d="M8 5v14l11-7z" />
              </svg>
            )}
          </button>

          {/* Next */}
          <button className="btn-icon" onClick={onNext} title="下一首">
            <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
              <path d="M6 18l8.5-6L6 6v12zm2.5-6 5.5 3.9V8.1L8.5 12zM16 6h2v12h-2z" />
            </svg>
          </button>

          {/* Play mode */}
          <button
            className="btn-icon transition-all flex items-center justify-center"
            onClick={onModeChange}
            title={modeLabel}
            style={{
              color: playMode !== 'sequential' ? '#60a5fa' : undefined,
              textShadow: playMode !== 'sequential' ? '0 0 8px #3b82f6' : undefined,
            }}
          >
            <PlayModeIcon mode={playMode} />
          </button>

          {/* 播放列表（当前队列） */}
          {onOpenPlaylist && (
            <button
              className="btn-icon relative flex items-center justify-center"
              onClick={onOpenPlaylist}
              title="当前播放列表"
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
              </svg>
              {playlistCount > 0 && (
                <span className="absolute -top-0.5 -right-0.5 min-w-[14px] h-3.5 px-1 rounded-full flex items-center justify-center text-[10px] font-medium bg-accent-primary text-white">
                  {playlistCount > 99 ? '99+' : playlistCount}
                </span>
              )}
            </button>
          )}
        </div>

        {/* ── Right controls ── */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Video toggle */}
          {isVideo && (
            <button
              className={`btn-icon ${showVideo ? 'text-accent-glow' : 'text-text-muted'}`}
              onClick={onToggleVideo}
              title={showVideo ? '收起视频' : '显示视频'}
              style={showVideo ? { textShadow: '0 0 8px #60a5fa' } : {}}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
              </svg>
            </button>
          )}

          {/* Speed selector — only shown during video playback */}
          {isVideo && (
            <div className="relative">
              <button
                className={`btn-icon text-xs font-mono tabular-nums ${playbackRate !== 1 ? 'text-accent-neon' : 'text-text-muted'}`}
                onClick={onToggleSpeedMenu}
                title="播放速度"
                style={playbackRate !== 1 ? { textShadow: '0 0 6px #06b6d4' } : {}}
              >
                {playbackRate}x
              </button>
              {showSpeedMenu && (
                <div className="absolute bottom-11 right-0 glass-card shadow-2xl z-50 py-1 w-22 overflow-hidden scale-in">
                  {SPEEDS.map((s) => (
                    <button
                      key={s}
                      className={`w-full px-3 py-1.5 text-xs text-left transition-all duration-150 ${
                        s === playbackRate
                          ? 'text-accent-neon font-semibold bg-bg-hover'
                          : 'text-text-secondary hover:bg-bg-hover hover:text-text-primary'
                      }`}
                      onClick={() => { onRateChange(s); onToggleSpeedMenu(); }}
                    >
                      {s === 1 ? '1x 正常' : `${s}x`}
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Volume */}
          <div className="hidden sm:flex items-center gap-1.5">
            <button
              className="btn-icon"
              onClick={() => onVolumeChange(volume > 0 ? 0 : 0.8)}
              title={volume === 0 ? '取消静音' : '静音'}
            >
              {volume === 0 ? (
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-text-muted" fill="currentColor">
                  <path d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z" />
                </svg>
              ) : (
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-text-muted" fill="currentColor">
                  <path d="M3 9v6h4l5 5V4L7 9H3zm13.5 3c0-1.77-1.02-3.29-2.5-4.03v8.05c1.48-.73 2.5-2.25 2.5-4.02z" />
                </svg>
              )}
            </button>
            <input
              type="range"
              className="volume-bar"
              min={0}
              max={1}
              step={0.05}
              value={volume}
              onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
              style={{
                background: `linear-gradient(to right, #60a5fa ${volume * 100}%, rgba(26,38,64,0.8) ${volume * 100}%)`,
              }}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
