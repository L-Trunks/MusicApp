'use client';

import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import {
  songsApi, playlistsApi, searchApi, getStreamUrl, adminApi, playbackStateApi,
} from '../lib/api';
import {
  Song, User, Playlist, PlayMode, ExternalSong,
  isVideoFile, isStreamingVideo, resolveIsVideo, formatDuration, makeVirtualSong,
} from '../lib/types';
import PlayerBar from './PlayerBar';
import SongDetailModal from './SongDetailModal';

// ─── helpers ────────────────────────────────────────────────────────────────
function generateShuffle(len: number, start: number): number[] {
  const arr = Array.from({ length: len }, (_, i) => i);
  arr.splice(arr.indexOf(start), 1);
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return [start, ...arr];
}
function nextIdx(cur: number, total: number, mode: PlayMode, order: number[]) {
  if (!total) return 0;
  if (mode === 'repeat-one') return cur;
  if (mode === 'shuffle') {
    const p = order.indexOf(cur); return order[(p + 1) % order.length];
  }
  return (cur + 1) % total;
}
function prevIdx(cur: number, total: number, mode: PlayMode, order: number[]) {
  if (!total) return 0;
  if (mode === 'repeat-one') return cur;
  if (mode === 'shuffle') {
    const p = order.indexOf(cur); return order[(p - 1 + order.length) % order.length];
  }
  return (cur - 1 + total) % total;
}
function getSongUrl(song: Song, token: string) {
  if (song.id === -1 && song.sourcePath?.startsWith('http')) return song.sourcePath;
  return getStreamUrl(song.id, token);
}

// ─── component ──────────────────────────────────────────────────────────────
interface Props { token: string; currentUser: User; }

export default function PlayerPage({ token, currentUser }: Props) {
  // Playlists
  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [activePlaylistId, setActivePlaylistId] = useState<number | null>(null);
  const [newPlaylistName, setNewPlaylistName] = useState('');
  const [sidebarOpen, setSidebarOpen] = useState(false); // 默认收起

  // Album filter (null = all albums)
  const [albumFilter, setAlbumFilter] = useState<string | null>(null);

  // Songs in current view
  const [allSongs, setAllSongs] = useState<Song[]>([]);
  const [displaySongs, setDisplaySongs] = useState<Song[]>([]);
  const [localSearch, setLocalSearch] = useState('');
  const [loadingSongs, setLoadingSongs] = useState(false);

  // Playback state
  const [currentIndex, setCurrentIndex] = useState(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(1);
  const [playMode, setPlayMode] = useState<PlayMode>('sequential');
  const [shuffleOrder, setShuffleOrder] = useState<number[]>([]);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showVideoPanel, setShowVideoPanel] = useState(true);

  // Multi-select
  const [selectedIds, setSelectedIds] = useState<Set<number>>(new Set());
  const [addToPlaylistOpen, setAddToPlaylistOpen] = useState(false);
  const [newPlaylistFromSelectionName, setNewPlaylistFromSelectionName] = useState('');
  const [creatingPlaylistFromSelection, setCreatingPlaylistFromSelection] = useState(false);

  // Tabs
  const [mainTab, setMainTab] = useState<'local' | 'external' | 'url'>('local');

  // External search
  const [extQuery, setExtQuery] = useState('');
  const [extResults, setExtResults] = useState<ExternalSong[]>([]);
  const [extLoading, setExtLoading] = useState(false);
  const [extError, setExtError] = useState('');
  const [extLoadingId, setExtLoadingId] = useState<string | null>(null);

  // URL direct play
  const [urlInput, setUrlInput] = useState('');
  const [urlTitle, setUrlTitle] = useState('');
  const [urlIsVideo, setUrlIsVideo] = useState(false);
  // null = 未检测, 'probing' = 检测中, 'audio'/'video'/'unknown' = 结果
  const [urlProbeState, setUrlProbeState] = useState<'idle' | 'probing' | 'audio' | 'video' | 'unknown'>('idle');

  // Detail modal
  const [detailSong, setDetailSong] = useState<Song | null>(null);

  // Users (for admin add-to-lib)
  const [users, setUsers] = useState<{ id: number; username: string }[]>([]);

  // Keyboard hint overlay
  const [showKeyHint, setShowKeyHint] = useState(false);

  // 底部播放列表抽屉（当前队列）
  const [showPlaylistDrawer, setShowPlaylistDrawer] = useState(false);

  const mediaRef = useRef<HTMLVideoElement>(null);
  const searchTimeout = useRef<ReturnType<typeof setTimeout>>();
  const songListRef = useRef<HTMLDivElement>(null);
  const savePlaybackStateTimeout = useRef<ReturnType<typeof setTimeout>>();
  const hasRestoredState = useRef(false);
  const skipNextFilterForRestore = useRef(false);
  const restoredQueueActive = useRef(false);
  /** 播放状态恢复失败时重试（下拉刷新/网络慢时最多再试 2 次） */
  const [restoreRetryTick, setRestoreRetryTick] = useState(0);
  // 当前播放的歌曲 ID，用于在筛选/搜索后仍能定位
  const currentSongIdRef = useRef<number>(-1);
  // 当前用于上一首/下一首的列表，与 displaySongs 同步，避免闭包陈旧
  const displaySongsRef = useRef<Song[]>([]);
  const restoreCurrentTimeRef = useRef<number | null>(null);
  const lastPositionBySongIdRef = useRef<Record<number, number>>({});

  const currentSong = currentIndex >= 0 ? displaySongs[currentIndex] : null;
  // resolveIsVideo 优先使用虚拟歌曲的 isVideoHint，其次才走扩展名检测
  const isVideo = currentSong ? resolveIsVideo(currentSong) : false;

  // ── load playlists ─────────────────────────────────────────────────────────
  const loadPlaylists = useCallback(async () => {
    try { setPlaylists(await playlistsApi.list(token)); } catch { /* ignore */ }
  }, [token]);

  useEffect(() => { loadPlaylists(); }, [loadPlaylists]);

  /** token 更新（如 me 刷新）时重置恢复重试次数，以便用新 token 再试 */
  useEffect(() => {
    setRestoreRetryTick(0);
  }, [token]);

  // ── restore playback state (once per session, retry if token refreshes or after failure) ─
  const RESTORE_MAX_ATTEMPTS = 3;
  useEffect(() => {
    if (!token || hasRestoredState.current) return;
    if (restoreRetryTick >= RESTORE_MAX_ATTEMPTS) return;
    let cancelled = false;
    playbackStateApi.get(token).then((state) => {
      if (cancelled) return;
      if (!state || !state.songIds?.length) {
        hasRestoredState.current = true;
        return;
      }
      restoredQueueActive.current = true;
      skipNextFilterForRestore.current = true;
      songsApi.list(token).then((songs) => {
        if (cancelled) return;
        const list: Song[] = state.songIds
          .map((id) => songs.find((s) => s.id === id))
          .filter((s): s is Song => Boolean(s));
        const extra = (state.queueExtra || []).map((e) =>
          makeVirtualSong(e.title, e.artist, e.album, e.sourcePath, e.coverUrl || '', e.durationSec, e.isVideoHint)
        );
        const restored = [...list, ...extra];
        setAllSongs(songs);
        setDisplaySongs(restored);
        displaySongsRef.current = restored;
        const idx = Math.min(state.currentIndex, Math.max(0, restored.length - 1));
        setCurrentIndex(idx);
        setCurrentTime(state.currentTime || 0);
        setPlayMode(state.playMode || 'sequential');
        if (state.volume != null) setVolume(state.volume);
        if (state.playbackRate != null) setPlaybackRate(state.playbackRate);
        if (state.shuffleOrder?.length) setShuffleOrder(state.shuffleOrder);
        const cur = restored[idx];
        if (cur) currentSongIdRef.current = cur.id;
        restoreCurrentTimeRef.current = state.currentTime ?? 0;
        lastPositionBySongIdRef.current = state.lastPositionBySongId ?? {};
        hasRestoredState.current = true;
      }).catch(() => {
        if (!cancelled) {
          hasRestoredState.current = false;
          restoredQueueActive.current = false;
          skipNextFilterForRestore.current = false;
          if (restoreRetryTick < RESTORE_MAX_ATTEMPTS - 1) {
            setTimeout(() => setRestoreRetryTick((t) => t + 1), 1500);
          }
        }
      });
    }).catch(() => {
      if (!cancelled) {
        hasRestoredState.current = false;
        if (restoreRetryTick < RESTORE_MAX_ATTEMPTS - 1) {
          setTimeout(() => setRestoreRetryTick((t) => t + 1), 1500);
        }
      }
    });
    return () => { cancelled = true; };
  }, [token, restoreRetryTick]);

  // ── load songs (always fetches all, filtering is client-side) ──────────────
  const loadSongs = useCallback(async () => {
    setLoadingSongs(true);
    try {
      if (activePlaylistId === null) {
        const data = await songsApi.list(token);
        setAllSongs(data);
      } else {
        const pl = await playlistsApi.get(token, activePlaylistId);
        const songs = (pl.items || []).map((item) => item.song);
        setAllSongs(songs);
      }
    } catch { /* ignore */ } finally {
      setLoadingSongs(false);
    }
  }, [token, activePlaylistId]);

  useEffect(() => { loadSongs(); }, [loadSongs]);

  // ── client-side filter: album + search ─────────────────────────────────────
  useEffect(() => {
    if (restoredQueueActive.current) return;
    if (skipNextFilterForRestore.current) {
      skipNextFilterForRestore.current = false;
      return;
    }
    let filtered = allSongs;

    // Apply album filter only when viewing all songs (not a specific playlist)
    if (activePlaylistId === null && albumFilter !== null) {
      filtered = filtered.filter((s) => (s.album || '(未分类)') === albumFilter);
    }

    // Apply text search
    if (localSearch.trim()) {
      const q = localSearch.toLowerCase();
      filtered = filtered.filter((s) =>
        [s.title, s.artist, s.album].some((f) => (f || '').toLowerCase().includes(q))
      );
    }

    setDisplaySongs(filtered);
    displaySongsRef.current = filtered;

    // Preserve currently-playing song's position in the new list
    if (currentSongIdRef.current > 0 || currentSongIdRef.current === -1) {
      const idx = filtered.findIndex((s) => s.id === currentSongIdRef.current);
      setCurrentIndex(idx >= 0 ? idx : -1);
    }
  }, [allSongs, albumFilter, localSearch, activePlaylistId]); // eslint-disable-line

  useEffect(() => {
    restoredQueueActive.current = false;
  }, [activePlaylistId, albumFilter]);

  // ── media element sync ────────────────────────────────────────────────────
  useEffect(() => {
    const el = mediaRef.current;
    if (!el || !currentSong) return;
    const url = getSongUrl(currentSong, token);
    if (el.src !== url) {
      el.src = url;
      el.load();
    }
    el.playbackRate = playbackRate;
    el.volume = volume;
    if (isPlaying) {
      const doPlay = () => el.play().catch(() => setIsPlaying(false));
      if (el.readyState >= 3) doPlay();
      else el.addEventListener('canplaythrough', doPlay, { once: true });
    } else {
      el.pause();
    }
  }, [currentSong]); // eslint-disable-line

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    el.playbackRate = playbackRate;
  }, [playbackRate]);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    el.volume = volume;
  }, [volume]);

  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    if (isPlaying) {
      const doPlay = () => el.play().catch(() => setIsPlaying(false));
      if (el.readyState >= 3) doPlay();
      else el.addEventListener('canplaythrough', doPlay, { once: true });
    } else {
      el.pause();
    }
  }, [isPlaying]);

  // ── persist playback state (debounced + on page hide) ──────────────────────
  const savePlaybackState = useCallback(() => {
    const list = displaySongsRef.current;
    if (!list.length) return;
    const songIds = list.filter((s) => s.id !== -1).map((s) => s.id);
    const queueExtra = list
      .filter((s) => s.id === -1)
      .map((s) => ({
        title: s.title,
        artist: s.artist || '',
        album: s.album || '',
        sourcePath: s.sourcePath || '',
        coverUrl: s.coverUrl,
        durationSec: s.durationSec || 0,
        isVideoHint: s.isVideoHint,
      }));
    const curIdx = list.findIndex((s) => s.id === currentSongIdRef.current);
    const idx = curIdx >= 0 ? curIdx : 0;
    const el = mediaRef.current;
    const cTime = el ? el.currentTime : 0;
    const curId = currentSongIdRef.current;
    const curSong = list.find((s) => s.id === curId);
    const nextLastPos = { ...lastPositionBySongIdRef.current };
    if (curSong && curSong.durationSec >= 600 && curId > 0) {
      nextLastPos[curId] = cTime;
    }
    playbackStateApi.put(token, {
      songIds,
      queueExtra,
      currentIndex: idx,
      currentTime: cTime,
      playMode,
      volume,
      playbackRate,
      shuffleOrder: shuffleOrder.length ? shuffleOrder : undefined,
      lastPositionBySongId: nextLastPos,
    }).catch(() => {});
  }, [token, playMode, volume, playbackRate, shuffleOrder]);

  useEffect(() => {
    const t = setTimeout(savePlaybackState, 1500);
    return () => clearTimeout(t);
  }, [displaySongs, currentIndex, playMode, volume, playbackRate, shuffleOrder, savePlaybackState]);

  useEffect(() => {
    const onHide = () => savePlaybackState();
    window.addEventListener('visibilitychange', onHide);
    window.addEventListener('pagehide', onHide);
    return () => {
      window.removeEventListener('visibilitychange', onHide);
      window.removeEventListener('pagehide', onHide);
    };
  }, [savePlaybackState]);

  // ── media events ──────────────────────────────────────────────────────────
  useEffect(() => {
    const el = mediaRef.current;
    if (!el) return;
    const onTime = () => setCurrentTime(el.currentTime);
    const onDur  = () => setDuration(el.duration || 0);
    const onCanPlay = () => {
      if (restoreCurrentTimeRef.current != null) {
        const t = restoreCurrentTimeRef.current;
        restoreCurrentTimeRef.current = null;
        if (el.duration && t < el.duration) {
          el.currentTime = t;
          setCurrentTime(t);
        }
      }
    };
    const onEnd  = () => {
      const list = displaySongsRef.current;
      if (!list.length) return;
      const curIdx = list.findIndex((s) => s.id === currentSongIdRef.current);
      const idx = curIdx < 0 ? 0 : curIdx;
      const ni = nextIdx(idx, list.length, playMode, shuffleOrder);
      const nextSong = list[ni];
      if (nextSong) currentSongIdRef.current = nextSong.id;
      setCurrentIndex(ni);
      setIsPlaying(true);
    };
    const onPlay  = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    el.addEventListener('timeupdate', onTime);
    el.addEventListener('durationchange', onDur);
    el.addEventListener('canplay', onCanPlay);
    el.addEventListener('ended', onEnd);
    el.addEventListener('play', onPlay);
    el.addEventListener('pause', onPause);
    return () => {
      el.removeEventListener('timeupdate', onTime);
      el.removeEventListener('durationchange', onDur);
      el.removeEventListener('canplay', onCanPlay);
      el.removeEventListener('ended', onEnd);
      el.removeEventListener('play', onPlay);
      el.removeEventListener('pause', onPause);
    };
  }, [playMode, shuffleOrder]); // eslint-disable-line

  // ── Keyboard shortcuts ────────────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA') return;
      if (e.code === 'Space') {
        e.preventDefault();
        setIsPlaying((p) => !p);
      } else if (e.code === 'ArrowLeft') {
        e.preventDefault();
        const el = mediaRef.current;
        if (el) { el.currentTime = Math.max(0, el.currentTime - 5); }
      } else if (e.code === 'ArrowRight') {
        e.preventDefault();
        const el = mediaRef.current;
        if (el) { el.currentTime = Math.min(el.duration || 0, el.currentTime + 5); }
      } else if (e.code === 'ArrowUp') {
        e.preventDefault();
        setVolume((v) => Math.min(1, Math.round((v + 0.05) * 100) / 100));
      } else if (e.code === 'ArrowDown') {
        e.preventDefault();
        setVolume((v) => Math.max(0, Math.round((v - 0.05) * 100) / 100));
      } else if (e.code === 'Slash' && e.shiftKey) {
        setShowKeyHint((v) => !v);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []); // eslint-disable-line

  // ── Media Session API ─────────────────────────────────────────────────────
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentSong) return;
    navigator.mediaSession.metadata = new MediaMetadata({
      title: currentSong.title,
      artist: currentSong.artist || '未知歌手',
      album: currentSong.album || '',
      artwork: currentSong.coverUrl ? [{ src: currentSong.coverUrl }] : [],
    });
    navigator.mediaSession.setActionHandler('previoustrack', handlePrev);
    navigator.mediaSession.setActionHandler('nexttrack', handleNext);
    navigator.mediaSession.setActionHandler('play', () => setIsPlaying(true));
    navigator.mediaSession.setActionHandler('pause', () => setIsPlaying(false));
  }, [currentSong]); // eslint-disable-line

  // ── playback controls ─────────────────────────────────────────────────────
  const playSongAt = (index: number) => {
    const song = displaySongs[index];
    if (song) {
      currentSongIdRef.current = song.id;
      const savedPos = lastPositionBySongIdRef.current[song.id];
      if (song.durationSec >= 600 && typeof savedPos === 'number' && savedPos > 0) {
        restoreCurrentTimeRef.current = savedPos;
      } else {
        restoreCurrentTimeRef.current = null;
      }
    }
    setCurrentIndex(index);
    setIsPlaying(true);
    if (playMode === 'shuffle') {
      setShuffleOrder(generateShuffle(displaySongs.length, index));
    }
  };

  const handlePrev = () => {
    const list = displaySongsRef.current;
    if (!list.length) return;
    const curIdx = list.findIndex((s) => s.id === currentSongIdRef.current);
    const idx = curIdx < 0 ? 0 : curIdx;
    const prev = prevIdx(idx, list.length, playMode, shuffleOrder);
    const prevSong = list[prev];
    if (prevSong) currentSongIdRef.current = prevSong.id;
    setCurrentIndex(prev);
    setIsPlaying(true);
  };
  const handleNext = () => {
    const list = displaySongsRef.current;
    if (!list.length) return;
    const curIdx = list.findIndex((s) => s.id === currentSongIdRef.current);
    const idx = curIdx < 0 ? 0 : curIdx;
    const next = nextIdx(idx, list.length, playMode, shuffleOrder);
    const nextSong = list[next];
    if (nextSong) currentSongIdRef.current = nextSong.id;
    setCurrentIndex(next);
    setIsPlaying(true);
  };

  const cycleMode = () => {
    setPlayMode((m) => {
      const next: PlayMode = m === 'sequential' ? 'shuffle' : m === 'shuffle' ? 'repeat-one' : 'sequential';
      if (next === 'shuffle') {
        const list = displaySongsRef.current;
        const idx = list.findIndex((s) => s.id === currentSongIdRef.current);
        const i = idx >= 0 ? idx : 0;
        setShuffleOrder(generateShuffle(list.length, i));
      }
      return next;
    });
  };

  // ── multi-select ──────────────────────────────────────────────────────────
  const toggleSelect = (id: number) => {
    setSelectedIds((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const addSelectedToPlaylist = async (playlistId: number) => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    try {
      await playlistsApi.addSongs(token, playlistId, ids);
      clearSelection();
      setAddToPlaylistOpen(false);
      alert(`已添加 ${ids.length} 首到歌单`);
    } catch (e) { alert(e instanceof Error ? e.message : '添加失败'); }
  };

  /** 将当前选中的歌曲创建为新歌单，并可选设为当前播放列表 */
  const createPlaylistFromSelection = async () => {
    const ids = Array.from(selectedIds);
    const name = newPlaylistFromSelectionName.trim();
    if (!ids.length || !name) return;
    setCreatingPlaylistFromSelection(true);
    try {
      const pl = await playlistsApi.create(token, name);
      await playlistsApi.addSongs(token, pl.id, ids);
      setPlaylists((p) => [...p, pl]);
      setNewPlaylistFromSelectionName('');
      clearSelection();
      setActivePlaylistId(pl.id);
      setAlbumFilter(null);
      loadSongs();
      alert(`已创建歌单「${name}」并添加 ${ids.length} 首歌曲`);
    } catch (e) {
      alert(e instanceof Error ? e.message : '创建失败');
    } finally {
      setCreatingPlaylistFromSelection(false);
    }
  };

  // ── create playlist ───────────────────────────────────────────────────────
  const createPlaylist = async () => {
    if (!newPlaylistName.trim()) return;
    try {
      const pl = await playlistsApi.create(token, newPlaylistName.trim());
      setPlaylists((p) => [...p, pl]);
      setNewPlaylistName('');
    } catch (e) { alert(e instanceof Error ? e.message : '创建失败'); }
  };

  const deletePlaylist = async (id: number) => {
    if (!confirm('确定删除该歌单？')) return;
    await playlistsApi.delete(token, id);
    setPlaylists((p) => p.filter((pl) => pl.id !== id));
    if (activePlaylistId === id) setActivePlaylistId(null);
  };

  // ── local search (client-side only, no API call) ─────────────────────────
  const handleLocalSearch = (q: string) => {
    setLocalSearch(q);
    // Debounce is fine but not strictly needed since filtering is synchronous
    clearTimeout(searchTimeout.current);
    searchTimeout.current = setTimeout(() => setLocalSearch(q), 0);
  };

  // ── derived album list ────────────────────────────────────────────────────
  const albums = useMemo(() => {
    const set = new Set<string>();
    allSongs.forEach((s) => set.add(s.album?.trim() || '(未分类)'));
    return Array.from(set).sort((a, b) => {
      if (a === '(未分类)') return 1;
      if (b === '(未分类)') return -1;
      return a.localeCompare(b, 'zh-CN');
    });
  }, [allSongs]);

  // ── scroll to current song ────────────────────────────────────────────────
  const scrollToCurrent = () => {
    if (currentIndex < 0 || !songListRef.current) return;
    const rows = songListRef.current.querySelectorAll('[data-song-idx]');
    const target = rows[currentIndex] as HTMLElement;
    if (target) target.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  // ── external search ───────────────────────────────────────────────────────
  const runExtSearch = async () => {
    if (!extQuery.trim()) return;
    setExtLoading(true); setExtError(''); setExtResults([]);
    try {
      setExtResults(await searchApi.external(token, extQuery));
    } catch (e) {
      setExtError(e instanceof Error ? e.message : '搜索失败');
    } finally { setExtLoading(false); }
  };

  const playExtSong = async (s: ExternalSong) => {
    setExtLoadingId(s.externalId);
    try {
      const { url } = await searchApi.externalUrl(token, s.externalId);
      const vSong = makeVirtualSong(s.title, s.artist, s.album, url, s.albumCover, s.durationSec);
      currentSongIdRef.current = vSong.id;
      setDisplaySongs([vSong]);
      setCurrentIndex(0);
      setIsPlaying(true);
    } catch (e) { alert(e instanceof Error ? e.message : '获取链接失败'); }
    finally { setExtLoadingId(null); }
  };

  const saveExtToLib = async (s: ExternalSong, url: string) => {
    if (currentUser.role !== 'admin') { alert('仅管理员可保存到媒体库'); return; }
    try {
      await adminApi.songs.create(token, {
        title: s.title, artist: s.artist, album: s.album,
        durationSec: s.durationSec, coverUrl: s.albumCover || '',
        sourcePath: url, visibility: 'private', ownerId: currentUser.id,
      } as Parameters<typeof adminApi.songs.create>[1]);
      alert('已保存到媒体库（默认 private 权限）');
    } catch (e) { alert(e instanceof Error ? e.message : '保存失败'); }
  };

  // ── URL direct play ───────────────────────────────────────────────────────

  /** 快速同步检测（扩展名 / 流媒体标志）；无法判断时返回 null */
  const quickDetect = (url: string): boolean | null => {
    if (!url) return null;
    if (isVideoFile(url) || isStreamingVideo(url)) return true;
    if (/\.(mp3|flac|wav|ogg|m4a|aac|opus|wma)(\?|#|$)/i.test(url)) return false;
    return null; // 无法从 URL 判断
  };

  /** 异步探测：发 HEAD 请求读 Content-Type */
  const probeUrl = useCallback(async (url: string) => {
    if (!url.startsWith('http')) {
      setUrlProbeState('unknown');
      return;
    }
    setUrlProbeState('probing');
    try {
      const ctrl = new AbortController();
      const timer = setTimeout(() => ctrl.abort(), 5000);
      const res = await fetch(url, { method: 'HEAD', signal: ctrl.signal });
      clearTimeout(timer);
      const ct = (res.headers.get('content-type') || '').toLowerCase();
      if (ct.startsWith('video/') || ct.includes('mpegurl') || ct.includes('dash+xml')) {
        setUrlProbeState('video');
        setUrlIsVideo(true);
      } else if (ct.startsWith('audio/')) {
        setUrlProbeState('audio');
        setUrlIsVideo(false);
      } else {
        setUrlProbeState('unknown');
      }
    } catch {
      setUrlProbeState('unknown'); // CORS 或网络错误
    }
  }, []);

  const handleUrlInput = (val: string) => {
    setUrlInput(val);
    setUrlProbeState('idle');
    const quick = quickDetect(val.trim());
    if (quick === true)  { setUrlIsVideo(true);  setUrlProbeState('video'); }
    if (quick === false) { setUrlIsVideo(false); setUrlProbeState('audio'); }
    // quick === null → 需要手动选择或探测
  };

  const playUrl = () => {
    if (!urlInput.trim()) return;
    const vSong = makeVirtualSong(
      urlTitle.trim() || 'URL 播放', '', '',
      urlInput.trim(), '', 0,
      urlIsVideo  // 将用户明确的选择传入虚拟歌曲
    );
    currentSongIdRef.current = vSong.id;
    setDisplaySongs([vSong]);
    setCurrentIndex(0);
    setIsPlaying(true);
    setMainTab('local');
  };

  // ─── render ───────────────────────────────────────────────────────────────
  const PLAYER_BAR_H = 80;
  return (
    <div className="h-full flex flex-col overflow-hidden player-page-bottom-spacer">
      {/* ── main area: sidebar + song list（仅此区域可滚动）── */}
      <div className="flex flex-1 min-h-0 overflow-hidden">

        {/* ── Playlist Sidebar ── */}
        <div className={`${sidebarOpen ? 'w-48 sm:w-56' : 'w-0'} flex-shrink-0 overflow-hidden transition-all duration-300 border-r flex flex-col`}
          style={{ borderColor: 'rgba(37,99,235,0.12)', background: 'linear-gradient(to bottom, rgba(11,15,22,0.9), rgba(7,10,14,0.95))' }}
        >
          <div className="p-3 border-b flex-shrink-0" style={{ borderColor: 'rgba(37,99,235,0.1)' }}>
            <p className="text-xs font-semibold mb-2 flex items-center gap-1.5" style={{ color: 'rgba(96,165,250,0.8)' }}>
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
              </svg>
              我的歌单
            </p>
            <div className="flex gap-1">
              <input
                className="input-field flex-1 min-w-0 max-w-[calc(100%-2rem)] text-xs py-1.5 px-2"
                placeholder="新建歌单…"
                value={newPlaylistName}
                onChange={(e) => setNewPlaylistName(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && createPlaylist()}
              />
              <button
                className="w-7 h-7 flex-shrink-0 flex items-center justify-center rounded-lg text-sm text-white transition-all duration-200 hover:scale-110 active:scale-95"
                style={{ background: 'linear-gradient(135deg, #2563eb, #1d4ed8)', boxShadow: '0 0 8px rgba(37,99,235,0.4)' }}
                onClick={createPlaylist}
              >+</button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto py-1">
            {/* All songs */}
            <button
              className={`w-full text-left px-3 py-2.5 text-sm flex items-center gap-2 transition-colors ${
                activePlaylistId === null ? 'playlist-item-active' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
              }`}
              onClick={() => { setActivePlaylistId(null); setAlbumFilter(null); setMainTab('local'); }}
            >
              <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0" fill="currentColor">
                <path d="M4 6H2v14c0 1.1.9 2 2 2h14v-2H4V6zm16-4H8c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm-1 9h-4v4h-2v-4H9V9h4V5h2v4h4v2z" />
              </svg>
              <span className="truncate">所有歌曲</span>
            </button>

            {/* User playlists */}
            {playlists.map((pl) => (
              <div
                key={pl.id}
                className={`group flex items-center px-3 py-2.5 cursor-pointer transition-colors ${
                  activePlaylistId === pl.id ? 'playlist-item-active' : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                }`}
                onClick={() => { setActivePlaylistId(pl.id); setAlbumFilter(null); setMainTab('local'); }}
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4 flex-shrink-0 mr-2" fill="currentColor">
                  <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                </svg>
                <span className="flex-1 text-sm truncate">{pl.name}</span>
                <span className="text-xs text-text-muted mr-1">{pl._count?.items ?? 0}</span>
                <button
                  className="opacity-0 group-hover:opacity-100 text-text-muted hover:text-red-400 transition-all"
                  onClick={(e) => { e.stopPropagation(); deletePlaylist(pl.id); }}
                >×</button>
              </div>
            ))}

            {/* Albums section */}
            {albums.length > 0 && (
              <div className="mt-1">
                <div className="border-t pt-1 mt-1" style={{ borderColor: 'rgba(37,99,235,0.08)' }}>
                  <p className="text-xs font-semibold px-3 pt-1.5 pb-1 flex items-center gap-1.5"
                    style={{ color: 'rgba(96,165,250,0.6)' }}>
                    <svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor">
                      <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
                    </svg>
                    专辑
                  </p>
                  {albums.map((album) => (
                    <button
                      key={album}
                      className={`w-full text-left px-3 py-2 text-xs flex items-center gap-2 transition-colors ${
                        albumFilter === album && activePlaylistId === null
                          ? 'playlist-item-active'
                          : 'text-text-secondary hover:text-text-primary hover:bg-bg-hover'
                      }`}
                      onClick={() => {
                        setActivePlaylistId(null);
                        setAlbumFilter(albumFilter === album ? null : album);
                        setMainTab('local');
                      }}
                    >
                      <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 flex-shrink-0 opacity-60" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
                      </svg>
                      <span className="truncate">{album}</span>
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* ── Main Content ── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden">
          {/* Toolbar */}
          <div className="border-b border-border/60 flex-shrink-0">
            {/* Row 1: sidebar toggle + tabs + actions */}
            <div className="flex items-center gap-2 px-3 pt-2.5 pb-2">
              <button className="btn-icon" onClick={() => setSidebarOpen(!sidebarOpen)} title="歌单栏">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M3 18h18v-2H3v2zm0-5h18v-2H3v2zm0-7v2h18V6H3z" />
                </svg>
              </button>

              {/* Tab switcher */}
              <div className="flex gap-0.5 bg-bg-card/80 rounded-lg p-0.5 text-xs" style={{ border: '1px solid rgba(37,99,235,0.1)' }}>
                {([['local', '本地库'], ['external', '外站搜索'], ['url', 'URL 播放']] as const).map(([k, label]) => (
                  <button
                    key={k}
                    onClick={() => setMainTab(k)}
                    className={`px-2.5 py-1 rounded-md transition-all duration-200 ${
                      mainTab === k
                        ? 'text-white'
                        : 'text-text-muted hover:text-text-primary'
                    }`}
                    style={mainTab === k ? {
                      background: 'linear-gradient(135deg, #2563eb, #1d4ed8)',
                      boxShadow: '0 0 8px rgba(37,99,235,0.4)',
                    } : {}}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex-1" />

              {/* Scroll to current */}
              {currentIndex >= 0 && mainTab === 'local' && (
                <button
                  className="btn-icon"
                  onClick={scrollToCurrent}
                  title="定位到当前歌曲"
                >
                  <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                    <path d="M12 8l-6 6 1.41 1.41L12 10.83l4.59 4.58L18 14z" />
                  </svg>
                </button>
              )}

              {/* Keyboard hint toggle */}
              <button
                className="btn-icon"
                onClick={() => setShowKeyHint((v) => !v)}
                title="快捷键 (Shift+/)"
              >
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M20 5H4c-1.1 0-1.99.9-1.99 2L2 17c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm-9 3h2v2h-2V8zm0 3h2v2h-2v-2zM8 8h2v2H8V8zm0 3h2v2H8v-2zm-1 5H5v-2h2v2zm9 0H8v-2h8v2zm0-3h-2v-2h2v2zm0-3h-2V8h2v2zm3 6h-2v-2h2v2zm0-3h-2v-2h2v2zm0-3h-2V8h2v2z" />
                </svg>
              </button>

              {/* Refresh */}
              <button className="btn-icon" onClick={() => loadSongs()} title="刷新">
                <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                  <path d="M17.65 6.35A7.96 7.96 0 0 0 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08A5.99 5.99 0 0 1 12 18c-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z" />
                </svg>
              </button>
            </div>

            {/* Row 2: active filter chips + search bar (local tab only) */}
            {mainTab === 'local' && (
              <div className="px-3 pb-2.5 space-y-1.5">
                {/* Active filter chips */}
                {(albumFilter || activePlaylistId !== null) && (
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {albumFilter && activePlaylistId === null && (
                      <span
                        className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded-full cursor-pointer transition-all hover:opacity-80"
                        style={{ background: 'rgba(37,99,235,0.2)', border: '1px solid rgba(37,99,235,0.3)', color: '#60a5fa' }}
                        onClick={() => setAlbumFilter(null)}
                        title="点击清除专辑过滤"
                      >
                        <svg viewBox="0 0 24 24" className="w-3 h-3" fill="currentColor">
                          <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 14.5c-2.49 0-4.5-2.01-4.5-4.5S9.51 7.5 12 7.5s4.5 2.01 4.5 4.5-2.01 4.5-4.5 4.5zm0-5.5c-.55 0-1 .45-1 1s.45 1 1 1 1-.45 1-1-.45-1-1-1z" />
                        </svg>
                        {albumFilter}
                        <span className="opacity-60">×</span>
                      </span>
                    )}
                  </div>
                )}
                <input
                  className="input-field w-full text-sm"
                  placeholder="搜索标题 / 歌手 / 专辑…"
                  value={localSearch}
                  onChange={(e) => handleLocalSearch(e.target.value)}
                />
              </div>
            )}

            {/* Keyboard shortcuts hint */}
            {showKeyHint && (
              <div className="px-3 pb-2.5 fade-in">
                <div className="glass-card px-3 py-2.5 text-xs text-text-muted flex flex-wrap gap-x-4 gap-y-1">
                  <span><kbd className="kbd-hint">Space</kbd> 播放/暂停</span>
                  <span><kbd className="kbd-hint">←</kbd><kbd className="kbd-hint">→</kbd> 快退/快进 5s</span>
                  <span><kbd className="kbd-hint">↑</kbd><kbd className="kbd-hint">↓</kbd> 音量</span>
                  <span><kbd className="kbd-hint">Shift+/</kbd> 关闭提示</span>
                </div>
              </div>
            )}
          </div>

          {/* ── Local Tab ── */}
          {mainTab === 'local' && (
            <>
              {/* Multi-select actions */}
              {selectedIds.size > 0 && (
                <div className="px-3 py-2 bg-bg-active border-b border-border flex flex-wrap items-center gap-2 flex-shrink-0 text-sm">
                  <span className="text-text-secondary flex-1">已选 <span className="text-accent-glow font-medium">{selectedIds.size}</span> 首</span>

                  {/* 将选中项创建为新歌单 */}
                  <div className="flex items-center gap-1.5">
                    <input
                      className="input-field text-xs py-1 px-2 w-32"
                      placeholder="新歌单名称"
                      value={newPlaylistFromSelectionName}
                      onChange={(e) => setNewPlaylistFromSelectionName(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && createPlaylistFromSelection()}
                    />
                    <button
                      className="btn-primary text-xs py-1"
                      disabled={!newPlaylistFromSelectionName.trim() || creatingPlaylistFromSelection}
                      onClick={createPlaylistFromSelection}
                    >
                      {creatingPlaylistFromSelection ? '…' : '创建为新歌单'}
                    </button>
                  </div>

                  <div className="relative">
                    <button className="btn-secondary text-xs py-1" onClick={() => setAddToPlaylistOpen(!addToPlaylistOpen)}>
                      添加到歌单 ▾
                    </button>
                    {addToPlaylistOpen && (
                      <div className="absolute top-8 right-0 bg-bg-card border border-border rounded-xl shadow-xl z-20 py-1 w-44">
                        {playlists.length === 0 ? (
                          <p className="text-text-muted text-xs px-3 py-2">先创建一个歌单</p>
                        ) : playlists.map((pl) => (
                          <button
                            key={pl.id}
                            className="w-full text-left px-3 py-2 text-sm text-text-secondary hover:bg-bg-hover hover:text-text-primary"
                            onClick={() => addSelectedToPlaylist(pl.id)}
                          >
                            {pl.name}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                  <button className="btn-secondary text-xs py-1" onClick={clearSelection}>取消</button>
                </div>
              )}

              {/* Song list */}
              <div className="flex-1 overflow-y-auto" ref={songListRef}>
                {loadingSongs ? (
                  <div className="p-4 space-y-2">
                    {Array.from({ length: 6 }).map((_, i) => (
                      <div key={i} className="skeleton h-12 w-full" style={{ animationDelay: `${i * 0.08}s` }} />
                    ))}
                  </div>
                ) : displaySongs.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-16 text-text-muted text-sm gap-3 fade-in-up">
                    <div className="w-16 h-16 rounded-full bg-bg-active flex items-center justify-center">
                      <svg viewBox="0 0 24 24" className="w-8 h-8 opacity-30" fill="currentColor">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                      </svg>
                    </div>
                    <p>{localSearch ? `未找到 "${localSearch}"` : '暂无歌曲'}</p>
                    {!localSearch && (
                      <p className="text-xs text-text-muted/60">将音乐文件放入 backend/music 目录后扫描</p>
                    )}
                  </div>
                ) : (
                  displaySongs.map((song, idx) => {
                    const active = currentIndex === idx && currentSong?.id === song.id;
                    const checked = selectedIds.has(song.id);
                    return (
                      <div
                        key={`${song.id}-${idx}`}
                        data-song-idx={idx}
                        className={`song-row ${active ? 'active' : ''}`}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('[data-song-check]')) return;
                          playSongAt(idx);
                        }}
                      >
                        {/* 多选：独立可点区域，阻止冒泡到行点击 */}
                        <div
                          data-song-check
                          className="song-row-check flex items-center justify-center w-8 flex-shrink-0 cursor-pointer"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <label className="cursor-pointer flex items-center justify-center p-1.5 rounded hover:bg-white/5">
                            <input
                              type="checkbox"
                              className="song-check"
                              checked={checked}
                              onChange={() => toggleSelect(song.id)}
                              onClick={(e) => e.stopPropagation()}
                            />
                          </label>
                        </div>
                        {/* Index / playing indicator */}
                        <div className="w-6 text-center text-xs flex-shrink-0 flex items-center justify-center">
                          {active && isPlaying ? (
                            <span className="eq-anim">
                              <span className="eq-bar" />
                              <span className="eq-bar" />
                              <span className="eq-bar" />
                            </span>
                          ) : active ? (
                            <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-accent-glow" fill="currentColor">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          ) : (
                            <span className="text-text-muted">{idx + 1}</span>
                          )}
                        </div>
                        {/* Cover */}
                        {song.coverUrl ? (
                          <img src={song.coverUrl} alt="" className="w-8 h-8 rounded-md object-cover flex-shrink-0 mx-2" />
                        ) : (
                          <div className="w-8 h-8 rounded-md bg-bg-active flex items-center justify-center flex-shrink-0 mx-2">
                            {isVideoFile(song.sourcePath || '') ? (
                              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-text-muted" fill="currentColor">
                                <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-text-muted" fill="currentColor">
                                <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                              </svg>
                            )}
                          </div>
                        )}
                        {/* Info */}
                        <div className="flex-1 min-w-0">
                          <button
                            className={`text-sm font-medium truncate block w-full text-left hover:text-accent-glow transition-colors ${active ? 'text-accent-glow' : 'text-text-primary'}`}
                            onClick={(e) => { e.stopPropagation(); setDetailSong(song); }}
                          >
                            {song.title}
                          </button>
                          <div className="text-xs text-text-muted truncate">
                            {[song.artist, song.album].filter(Boolean).join(' · ') || '未知'}
                          </div>
                        </div>
                        {/* Right */}
                        <div className="flex items-center gap-2 ml-2 flex-shrink-0">
                          <span className="text-xs text-text-muted hidden sm:block tabular-nums">
                            {formatDuration(song.durationSec)}
                          </span>
                          <span className={`badge-${song.visibility}`}>{song.visibility}</span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </>
          )}

          {/* ── External Search Tab ── */}
          {mainTab === 'external' && (
            <div className="flex-1 overflow-y-auto p-3 space-y-3">
              <div className="flex gap-2">
                <input
                  className="input-field flex-1 text-sm"
                  placeholder="搜索歌曲名 / 歌手（需配置 NETEASE_API_URL）"
                  value={extQuery}
                  onChange={(e) => setExtQuery(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && runExtSearch()}
                />
                <button className="btn-primary text-sm" onClick={runExtSearch} disabled={extLoading}>
                  {extLoading ? '…' : '搜索'}
                </button>
              </div>
              {extError && (
                <div className="text-red-400 text-sm bg-red-900/20 border border-red-900/30 rounded-lg px-3 py-2">
                  {extError}
                </div>
              )}
              {extResults.map((s) => (
                <div key={s.externalId} className="glass-card px-3 py-3 flex items-center gap-3 fade-in-up transition-all hover:border-accent-primary/20">
                  {s.albumCover && (
                    <img src={s.albumCover} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                  )}
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-text-primary truncate">{s.title}</p>
                    <p className="text-xs text-text-muted truncate">{s.artist} · {s.album}</p>
                    <p className="text-xs text-text-muted">{formatDuration(s.durationSec)}</p>
                  </div>
                  <button
                    className="btn-primary text-xs py-1 px-2 flex-shrink-0"
                    disabled={extLoadingId === s.externalId}
                    onClick={() => playExtSong(s)}
                  >
                    {extLoadingId === s.externalId ? '…' : '▶ 播放'}
                  </button>
                  {currentUser.role === 'admin' && (
                    <button
                      className="btn-secondary text-xs py-1 px-2 flex-shrink-0"
                      onClick={async () => {
                        setExtLoadingId(s.externalId);
                        try {
                          const { url } = await searchApi.externalUrl(token, s.externalId);
                          await saveExtToLib(s, url);
                        } catch (e) { alert(e instanceof Error ? e.message : '失败'); }
                        finally { setExtLoadingId(null); }
                      }}
                    >
                      + 存库
                    </button>
                  )}
                </div>
              ))}
              {!extLoading && extResults.length === 0 && extQuery && !extError && (
                <p className="text-text-muted text-sm text-center py-8">无结果</p>
              )}
            </div>
          )}

          {/* ── URL Direct Play Tab ── */}
          {mainTab === 'url' && (
            <div className="flex-1 overflow-y-auto p-4 space-y-4 dot-pattern">
              <div className="glass-card p-4 space-y-4 fade-in-up">
                <div className="flex items-center gap-2">
                  <svg viewBox="0 0 24 24" className="w-4 h-4 text-accent-glow flex-shrink-0" fill="currentColor">
                    <path d="M3.9 12c0-1.71 1.39-3.1 3.1-3.1h4V7H7c-2.76 0-5 2.24-5 5s2.24 5 5 5h4v-1.9H7c-1.71 0-3.1-1.39-3.1-3.1zM8 13h8v-2H8v2zm9-6h-4v1.9h4c1.71 0 3.1 1.39 3.1 3.1s-1.39 3.1-3.1 3.1h-4V17h4c2.76 0 5-2.24 5-5s-2.24-5-5-5z" />
                  </svg>
                  <p className="text-sm text-text-secondary">粘贴任意 URL 直接播放（MP3、MP4、M3U8、无扩展名链接均可）</p>
                </div>

                {/* URL 输入 + 探测状态 */}
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">播放链接</label>
                  <div className="flex gap-2">
                    <input
                      className="input-field flex-1 text-sm"
                      placeholder="https://example.com/stream"
                      value={urlInput}
                      onChange={(e) => handleUrlInput(e.target.value)}
                      onKeyDown={(e) => e.key === 'Enter' && playUrl()}
                    />
                    {/* 探测按钮：只在无法自动判断时显示 */}
                    {urlInput.trim() && urlProbeState === 'idle' && (
                      <button
                        className="btn-secondary text-xs px-3 flex-shrink-0"
                        onClick={() => probeUrl(urlInput.trim())}
                        title="发 HEAD 请求探测 Content-Type"
                      >
                        探测类型
                      </button>
                    )}
                    {urlProbeState === 'probing' && (
                      <div className="flex items-center gap-1.5 px-3 text-xs text-text-muted flex-shrink-0">
                        <span className="eq-anim"><span className="eq-bar"/><span className="eq-bar"/><span className="eq-bar"/></span>
                        探测中…
                      </div>
                    )}
                  </div>

                  {/* 探测结果提示 */}
                  {urlInput.trim() && urlProbeState !== 'idle' && urlProbeState !== 'probing' && (
                    <div className={`mt-1.5 text-xs flex items-center gap-1.5 ${
                      urlProbeState === 'video' ? 'text-blue-400' :
                      urlProbeState === 'audio' ? 'text-emerald-400' : 'text-amber-400'
                    }`}>
                      {urlProbeState === 'video' && (
                        <><svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/></svg>自动识别为视频</>
                      )}
                      {urlProbeState === 'audio' && (
                        <><svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/></svg>自动识别为音频</>
                      )}
                      {urlProbeState === 'unknown' && (
                        <><svg viewBox="0 0 24 24" className="w-3.5 h-3.5" fill="currentColor"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>无法自动识别（CORS 限制），请手动选择↓</>
                      )}
                    </div>
                  )}
                  {urlInput.trim() && urlProbeState === 'idle' && (
                    <p className="mt-1 text-xs text-text-muted/60">URL 无明显扩展名，点「探测类型」或手动选择↓</p>
                  )}
                </div>

                {/* 标题 */}
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">标题（可选）</label>
                  <input
                    className="input-field w-full text-sm"
                    placeholder="自定义标题…"
                    value={urlTitle}
                    onChange={(e) => setUrlTitle(e.target.value)}
                  />
                </div>

                {/* 媒体类型选择 — 取代原先不显眼的 checkbox */}
                <div>
                  <label className="block text-xs text-text-muted mb-2">媒体类型</label>
                  <div className="flex gap-2">
                    <button
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium border transition-all duration-200"
                      style={!urlIsVideo ? {
                        background: 'linear-gradient(135deg, rgba(16,185,129,0.2), rgba(16,185,129,0.1))',
                        borderColor: 'rgba(16,185,129,0.4)',
                        color: '#34d399',
                        boxShadow: '0 0 12px rgba(16,185,129,0.15)',
                      } : {
                        background: 'rgba(16,22,31,0.6)',
                        borderColor: 'rgba(26,38,64,0.6)',
                        color: 'rgba(124,141,181,0.7)',
                      }}
                      onClick={() => setUrlIsVideo(false)}
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                        <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z"/>
                      </svg>
                      音频
                    </button>
                    <button
                      className="flex-1 flex items-center justify-center gap-2 py-2 rounded-xl text-sm font-medium border transition-all duration-200"
                      style={urlIsVideo ? {
                        background: 'linear-gradient(135deg, rgba(37,99,235,0.25), rgba(37,99,235,0.12))',
                        borderColor: 'rgba(37,99,235,0.4)',
                        color: '#60a5fa',
                        boxShadow: '0 0 12px rgba(37,99,235,0.2)',
                      } : {
                        background: 'rgba(16,22,31,0.6)',
                        borderColor: 'rgba(26,38,64,0.6)',
                        color: 'rgba(124,141,181,0.7)',
                      }}
                      onClick={() => setUrlIsVideo(true)}
                    >
                      <svg viewBox="0 0 24 24" className="w-4 h-4" fill="currentColor">
                        <path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>
                      </svg>
                      视频
                    </button>
                  </div>
                </div>

                <button
                  className="btn-primary w-full py-2.5"
                  onClick={playUrl}
                  disabled={!urlInput.trim()}
                >
                  ▶ 立即播放
                </button>
              </div>
            </div>
          )}

        </div>
      </div>

      {/* ── Video Panel ── */}
      {isVideo && showVideoPanel && (
        <div className="flex-shrink-0 video-container relative" style={{ maxHeight: '50vh' }}>
          <button
            className="absolute top-3 right-3 z-20 rounded-full w-8 h-8 flex items-center justify-center text-white text-base transition-all hover:scale-110 active:scale-95"
            style={{ background: 'rgba(0,0,0,0.7)', backdropFilter: 'blur(8px)', border: '1px solid rgba(255,255,255,0.1)' }}
            onClick={() => setShowVideoPanel(false)}
          >×</button>
          <video ref={mediaRef} controls className="w-full" style={{ maxHeight: '50vh' }} />
        </div>
      )}

      {/* ── Hidden media element (audio or hidden video) ── */}
      {(!isVideo || !showVideoPanel) && (
        <video
          ref={mediaRef}
          className="hidden"
        />
      )}

      {/* ── Player Bar（固定底部）── */}
      <div className="player-bar-fixed fixed bottom-0 left-0 right-0 z-30" style={{ minHeight: PLAYER_BAR_H }}>
        <PlayerBar
        currentSong={currentSong}
        isPlaying={isPlaying}
        currentTime={currentTime}
        duration={duration}
        volume={volume}
        playMode={playMode}
        playbackRate={playbackRate}
        showSpeedMenu={showSpeedMenu}
        onPlayPause={() => setIsPlaying(!isPlaying)}
        onPrev={handlePrev}
        onNext={handleNext}
        onSeek={(t) => {
          const el = mediaRef.current;
          if (el) { el.currentTime = t; setCurrentTime(t); }
        }}
        onVolumeChange={setVolume}
        onModeChange={cycleMode}
        onRateChange={(r) => { setPlaybackRate(r); if (mediaRef.current) mediaRef.current.playbackRate = r; }}
        onToggleSpeedMenu={() => setShowSpeedMenu(!showSpeedMenu)}
        onSongClick={() => currentSong && setDetailSong(currentSong)}
        isVideo={isVideo}
        showVideo={showVideoPanel}
        onToggleVideo={() => setShowVideoPanel(!showVideoPanel)}
        onOpenPlaylist={() => setShowPlaylistDrawer(true)}
        playlistCount={displaySongs.length}
      />
      </div>

      {/* ── 当前播放列表抽屉（底部弹出） ── */}
      {showPlaylistDrawer && (
        <>
          <div
            className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm fade-in"
            onClick={() => setShowPlaylistDrawer(false)}
            aria-hidden
          />
          <div
            className="fixed left-0 right-0 bottom-0 z-[91] max-h-[70vh] flex flex-col rounded-t-2xl overflow-hidden animate-slide-up"
            style={{
              background: 'linear-gradient(180deg, rgba(11,15,22,0.98) 0%, rgba(7,10,14,0.99) 100%)',
              border: '1px solid rgba(37,99,235,0.15)',
              borderBottom: 'none',
              boxShadow: '0 -8px 32px rgba(0,0,0,0.5), 0 0 0 1px rgba(37,99,235,0.08)',
            }}
          >
            <div className="flex items-center justify-between px-4 py-3 border-b flex-shrink-0" style={{ borderColor: 'rgba(37,99,235,0.12)' }}>
              <h3 className="text-sm font-semibold text-text-primary flex items-center gap-2">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-accent-glow" fill="currentColor">
                  <path d="M15 6H3v2h12V6zm0 4H3v2h12v-2zM3 16h8v-2H3v2zM17 6v8.18c-.31-.11-.65-.18-1-.18-1.66 0-3 1.34-3 3s1.34 3 3 3 3-1.34 3-3V8h3V6h-5z" />
                </svg>
                当前播放
                <span className="text-text-muted font-normal">共 {displaySongs.length} 首</span>
              </h3>
              <button
                className="btn-icon p-1.5"
                onClick={() => setShowPlaylistDrawer(false)}
                title="关闭"
              >
                <svg viewBox="0 0 24 24" className="w-5 h-5" fill="currentColor">
                  <path d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-y-auto min-h-0">
              {displaySongs.length === 0 ? (
                <p className="text-text-muted text-sm text-center py-8">暂无歌曲</p>
              ) : (
                <div className="py-1">
                  {displaySongs.map((song, idx) => {
                    const active = currentIndex === idx && currentSong?.id === song.id;
                    return (
                      <div
                        key={`pl-${song.id}-${idx}`}
                        className={`flex items-center gap-3 px-4 py-2.5 cursor-pointer transition-colors ${
                          active ? 'bg-accent-primary/15' : 'hover:bg-bg-hover'
                        }`}
                        onClick={() => {
                          playSongAt(idx);
                          setShowPlaylistDrawer(false);
                        }}
                      >
                        <div className="w-6 text-center flex-shrink-0 flex items-center justify-center">
                          {active && isPlaying ? (
                            <span className="eq-anim">
                              <span className="eq-bar" /><span className="eq-bar" /><span className="eq-bar" />
                            </span>
                          ) : active ? (
                            <svg viewBox="0 0 24 24" className="w-4 h-4 text-accent-glow" fill="currentColor">
                              <path d="M8 5v14l11-7z" />
                            </svg>
                          ) : (
                            <span className="text-text-muted text-xs">{idx + 1}</span>
                          )}
                        </div>
                        {song.coverUrl ? (
                          <img src={song.coverUrl} alt="" className="w-10 h-10 rounded-lg object-cover flex-shrink-0" />
                        ) : (
                          <div className="w-10 h-10 rounded-lg bg-bg-active flex items-center justify-center flex-shrink-0">
                            <svg viewBox="0 0 24 24" className="w-5 h-5 text-text-muted" fill="currentColor">
                              <path d="M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z" />
                            </svg>
                          </div>
                        )}
                        <div className="flex-1 min-w-0">
                          <p className={`text-sm font-medium truncate ${active ? 'text-accent-glow' : 'text-text-primary'}`}>
                            {song.title}
                          </p>
                          <p className="text-xs text-text-muted truncate">
                            {[song.artist, song.album].filter(Boolean).join(' · ') || '未知'}
                          </p>
                        </div>
                        <span className="text-xs text-text-muted tabular-nums flex-shrink-0">
                          {formatDuration(song.durationSec)}
                        </span>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </>
      )}

      {/* ── Song Detail Modal ── */}
      {detailSong && (
        <SongDetailModal
          song={detailSong}
          token={token}
          isPlaying={isPlaying && currentSong?.id === detailSong.id}
          onClose={() => setDetailSong(null)}
          onPlayPause={() => {
            const idx = displaySongs.findIndex((s) => s.id === detailSong.id);
            if (idx >= 0 && currentIndex !== idx) {
              playSongAt(idx);
            } else {
              setIsPlaying(!isPlaying);
            }
          }}
        />
      )}

      {/* Click outside to close speed menu */}
      {showSpeedMenu && (
        <div className="fixed inset-0 z-40" onClick={() => setShowSpeedMenu(false)} />
      )}
    </div>
  );
}
