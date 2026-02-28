'use client';

import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { adminApi, friendsApi, uploadFile, cloudApi, type CloudItem } from '../lib/api';
import { User, Song, Friend } from '../lib/types';

interface Props {
  token: string;
  currentUser: User;
  onUserUpdate: (user: User) => void;
}

type AdminTab = 'upload' | 'songs' | 'friends' | 'users' | 'invites' | 'cloud';

const VISIBILITY_OPTIONS = ['public', 'friends', 'private'] as const;

function Badge({ v }: { v: string }) {
  return <span className={`badge-${v}`}>{v}</span>;
}

export default function AdminPage({ token, currentUser, onUserUpdate }: Props) {
  const [activeTab, setActiveTab] = useState<AdminTab>('upload');

  // Upload state
  const [uploadFiles, setUploadFiles] = useState<File[]>([]);
  const [uploadSubPath, setUploadSubPath] = useState('');
  const [uploadProgress, setUploadProgress] = useState<Record<string, string>>({});
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Friends state
  const [friends, setFriends] = useState<Friend[]>([]);
  const [addFriendUsername, setAddFriendUsername] = useState('');
  const [friendMsg, setFriendMsg] = useState({ text: '', ok: true });
  const [loadingFriends, setLoadingFriends] = useState(false);

  // Songs state
  const [songs, setSongs] = useState<Song[]>([]);
  const [songSearch, setSongSearch] = useState('');
  const [adminAlbumFilter, setAdminAlbumFilter] = useState<string | null>(null);
  const [loadingSongs, setLoadingSongs] = useState(false);
  const [selectedSong, setSelectedSong] = useState<Song | null>(null);
  const [scanResult, setScanResult] = useState('');
  const [scanning, setScanning] = useState(false);
  const [users, setUsers] = useState<User[]>([]);
  const [songError, setSongError] = useState('');

  const [newSong, setNewSong] = useState<{
    title: string; artist: string; album: string; sourcePath: string;
    coverUrl: string; durationSec: number;
    visibility: 'public' | 'friends' | 'private'; ownerId: number;
  }>({ title: '', artist: '', album: '', sourcePath: '', coverUrl: '', durationSec: 0, visibility: 'private', ownerId: currentUser.id });

  const [editSong, setEditSong] = useState<Partial<Song>>({});

  // Delete confirmation dialog state
  const [deleteTarget, setDeleteTarget] = useState<Song | null>(null);

  // Song form modals: new / edit (edit = selected song)
  const [showNewSongModal, setShowNewSongModal] = useState(false);
  const [showEditSongModal, setShowEditSongModal] = useState(false);

  // Batch selection state
  const [selectedSongIds, setSelectedSongIds] = useState<Set<number>>(new Set());
  const [batchVisibility, setBatchVisibility] = useState<'public' | 'friends' | 'private'>('public');
  const [batchLoading, setBatchLoading] = useState(false);
  const [batchResult, setBatchResult] = useState('');

  // Users state
  const [allUsers, setAllUsers] = useState<User[]>([]);
  const [loadingUsers, setLoadingUsers] = useState(false);

  // Invite codes
  const [inviteCodes, setInviteCodes] = useState<Array<{ id: number; code: string; usedAt: string | null; usedById: number | null; createdAt: string }>>([]);
  const [loadingInvites, setLoadingInvites] = useState(false);
  const [creatingInvite, setCreatingInvite] = useState(false);

  // 网盘（仅后台展示）：子目录即专辑，文件即歌曲列表
  const [cloudProvider, setCloudProvider] = useState<'gdrive' | 'onedrive' | null>(null);
  const [cloudFolderStack, setCloudFolderStack] = useState<Array<{ id: string; name: string }>>([]);
  const [cloudItems, setCloudItems] = useState<CloudItem[]>([]);
  const [cloudLoading, setCloudLoading] = useState(false);
  const [cloudError, setCloudError] = useState('');

  const loadFriends = useCallback(async () => {
    setLoadingFriends(true);
    try { setFriends(await friendsApi.list(token)); } finally { setLoadingFriends(false); }
  }, [token]);

  const loadSongs = useCallback(async (q = '') => {
    setLoadingSongs(true);
    setSelectedSongIds(new Set());
    try { setSongs(await adminApi.songs.list(token, q)); } finally { setLoadingSongs(false); }
  }, [token]);

  const loadUsers = useCallback(async () => {
    setLoadingUsers(true);
    try { const d = await adminApi.users.list(token); setAllUsers(d); setUsers(d); } finally { setLoadingUsers(false); }
  }, [token]);

  const loadInviteCodes = useCallback(async () => {
    setLoadingInvites(true);
    try { setInviteCodes(await adminApi.inviteCodes.list(token)); } finally { setLoadingInvites(false); }
  }, [token]);

  const loadCloudItems = useCallback(async (provider: 'gdrive' | 'onedrive', folderId?: string) => {
    setCloudLoading(true);
    setCloudError('');
    try {
      const api = provider === 'gdrive' ? cloudApi.gdrive : cloudApi.onedrive;
      const res = await api.list(token, folderId);
      setCloudItems(res.items || []);
      setCloudProvider(provider);
    } catch (e) {
      setCloudError(e instanceof Error ? e.message : '加载网盘失败');
      setCloudItems([]);
    } finally {
      setCloudLoading(false);
    }
  }, [token]);

  const openCloudFolder = useCallback((item: CloudItem) => {
    if (item.type !== 'folder') return;
    setCloudFolderStack((prev) => [...prev, { id: item.id, name: item.name }]);
    loadCloudItems(cloudProvider!, item.id);
  }, [cloudProvider, loadCloudItems]);

  const goBackCloudFolder = useCallback((index: number) => {
    setCloudFolderStack((prev) => prev.slice(0, index));
    const folderId = index === 0 ? undefined : cloudFolderStack[index - 1]?.id;
    loadCloudItems(cloudProvider!, folderId);
  }, [cloudProvider, cloudFolderStack, loadCloudItems]);

  const adminAlbums = useMemo(() => {
    const set = new Set(songs.map((s) => s.album || '(未分类)'));
    return Array.from(set).sort((a, b) => a.localeCompare(b));
  }, [songs]);

  const displaySongs = useMemo(() => {
    if (!adminAlbumFilter) return songs;
    return songs.filter((s) => (s.album || '(未分类)') === adminAlbumFilter);
  }, [songs, adminAlbumFilter]);

  useEffect(() => {
    if (activeTab === 'friends') loadFriends();
    if (activeTab === 'songs') { loadSongs(); loadUsers(); }
    if (activeTab === 'users') loadUsers();
    if (activeTab === 'invites') loadInviteCodes();
    if (activeTab === 'cloud') {
      setCloudFolderStack([]);
      loadCloudItems('gdrive').catch(() => loadCloudItems('onedrive'));
    }
  }, [activeTab, loadFriends, loadSongs, loadUsers, loadInviteCodes, loadCloudItems]);

  // ─── Upload ─────────────────────────────────────────────────────────────
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.size > 0);
    setUploadFiles((prev) => [...prev, ...files]);
  };

  const runUpload = async () => {
    if (!uploadFiles.length) return;
    const results: Record<string, string> = {};
    for (const file of uploadFiles) {
      results[file.name] = '上传中…';
      setUploadProgress({ ...results });
      try {
        const r = await uploadFile(token, file, uploadSubPath);
        results[file.name] = r.created ? `✓ 已创建: ${r.relativePath}` : `⚠ 已存在: ${r.relativePath}`;
      } catch (e) {
        results[file.name] = `✗ ${e instanceof Error ? e.message : '失败'}`;
      }
      setUploadProgress({ ...results });
    }
    setUploadFiles([]);
  };

  // ─── Friends ────────────────────────────────────────────────────────────
  const addFriend = async () => {
    setFriendMsg({ text: '', ok: true });
    try {
      const f = await friendsApi.add(token, addFriendUsername.trim());
      setFriends((p) => [f, ...p]);
      setAddFriendUsername('');
      setFriendMsg({ text: `已添加好友 ${f.friendUsername}`, ok: true });
    } catch (e) {
      setFriendMsg({ text: e instanceof Error ? e.message : '添加失败', ok: false });
    }
  };

  // ─── Songs ──────────────────────────────────────────────────────────────
  const createSong = async () => {
    setSongError('');
    try {
      const song = await adminApi.songs.create(token, newSong);
      setSongs((p) => [song, ...p]);
      setNewSong({ title: '', artist: '', album: '', sourcePath: '', coverUrl: '', durationSec: 0, visibility: 'private', ownerId: currentUser.id });
      setShowNewSongModal(false);
    } catch (e) { setSongError(e instanceof Error ? e.message : '创建失败'); }
  };

  const updateSong = async () => {
    if (!selectedSong) return;
    setSongError('');
    try {
      const updated = await adminApi.songs.update(token, selectedSong.id, editSong);
      setSongs((p) => p.map((s) => (s.id === updated.id ? updated : s)));
      setSelectedSong(updated);
      setEditSong({ ...updated });
      setShowEditSongModal(false);
    } catch (e) { setSongError(e instanceof Error ? e.message : '更新失败'); }
  };

  const deleteSong = async (id: number, deleteFile: boolean) => {
    setSongError('');
    setDeleteTarget(null);
    try {
      await adminApi.songs.delete(token, id, deleteFile);
      setSongs((p) => p.filter((s) => s.id !== id));
      if (selectedSong?.id === id) setSelectedSong(null);
    } catch (e) { setSongError(e instanceof Error ? e.message : '删除失败'); }
  };

  const toggleSelectSong = (id: number) => {
    setSelectedSongIds((prev) => {
      const s = new Set(prev);
      s.has(id) ? s.delete(id) : s.add(id);
      return s;
    });
  };

  const toggleSelectAll = () => {
    if (displaySongs.length > 0 && selectedSongIds.size === displaySongs.length) {
      const toRemove = new Set(displaySongs.map((s) => s.id));
      setSelectedSongIds((prev) => new Set(Array.from(prev).filter((id) => !toRemove.has(id))));
    } else {
      setSelectedSongIds((prev) => new Set(Array.from(prev).concat(displaySongs.map((s) => s.id))));
    }
  };

  const batchUpdateVisibility = async () => {
    const ids = Array.from(selectedSongIds);
    if (!ids.length) return;
    setBatchLoading(true); setBatchResult('');
    try {
      const r = await adminApi.songs.batchSetVisibility(token, ids, batchVisibility);
      setBatchResult(r.message);
      setSongs((prev) => prev.map((s) => ids.includes(s.id) ? { ...s, visibility: batchVisibility } : s));
      setSelectedSongIds(new Set());
    } catch (e) { setBatchResult(e instanceof Error ? e.message : '操作失败'); }
    finally { setBatchLoading(false); }
  };

  const batchDelete = async (deleteFiles: boolean) => {
    const ids = Array.from(selectedSongIds);
    if (!ids.length) return;
    if (!confirm(`确定删除选中的 ${ids.length} 首歌曲${deleteFiles ? '（同时删除磁盘文件）' : ''}？`)) return;
    setBatchLoading(true); setBatchResult('');
    try {
      const r = await adminApi.songs.batchDelete(token, ids, deleteFiles);
      setBatchResult(r.message);
      setSongs((prev) => prev.filter((s) => !ids.includes(s.id)));
      setSelectedSongIds(new Set());
    } catch (e) { setBatchResult(e instanceof Error ? e.message : '操作失败'); }
    finally { setBatchLoading(false); }
  };

  const scanLocal = async () => {
    setScanning(true); setScanResult('');
    try {
      const r = await adminApi.songs.scanLocal(token);
      setScanResult(r.message);
      await loadSongs(songSearch);
    } catch (e) { setScanResult(e instanceof Error ? e.message : '扫描失败'); }
    finally { setScanning(false); }
  };

  const setUserRole = async (userId: number, role: string) => {
    try {
      const updated = await adminApi.users.setRole(token, userId, role);
      setAllUsers((p) => p.map((u) => (u.id === updated.id ? updated : u)));
      if (updated.id === currentUser.id) onUserUpdate(updated);
    } catch (e) { alert(e instanceof Error ? e.message : '操作失败'); }
  };

  // ─── render ─────────────────────────────────────────────────────────────
  const tabs: { key: AdminTab; label: string }[] = [
    { key: 'upload', label: '上传文件' },
    { key: 'songs', label: '歌曲管理' },
    { key: 'friends', label: '好友管理' },
    { key: 'users', label: '用户管理' },
    { key: 'invites', label: '邀请码' },
    { key: 'cloud', label: '网盘' },
  ];

  return (
    <>
    <div className="space-y-4 max-w-5xl mx-auto">
      {/* Sub-tabs */}
      <div className="flex gap-1 bg-bg-card rounded-xl border border-border p-1">
        {tabs.map((t) => (
          <button
            key={t.key}
            onClick={() => setActiveTab(t.key)}
            className={`flex-1 py-1.5 rounded-lg text-sm font-medium transition-all ${
              activeTab === t.key ? 'bg-accent-primary text-white' : 'text-text-secondary hover:text-text-primary'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* ── 上传文件 ── */}
      {activeTab === 'upload' && (
        <div className="space-y-4">
          {/* Drag & Drop zone */}
          <div
            className={`border-2 border-dashed rounded-xl p-8 text-center transition-all cursor-pointer ${
              isDragging ? 'border-accent-primary bg-accent-primary/10' : 'border-border hover:border-border-light hover:bg-bg-hover'
            }`}
            onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
            onClick={() => fileInputRef.current?.click()}
          >
            <svg viewBox="0 0 24 24" className="w-10 h-10 mx-auto mb-3 text-text-muted" fill="currentColor">
              <path d="M19.35 10.04A7.49 7.49 0 0 0 12 4C9.11 4 6.6 5.64 5.35 8.04A5.994 5.994 0 0 0 0 14c0 3.31 2.69 6 6 6h13c2.76 0 5-2.24 5-5 0-2.64-2.05-4.78-4.65-4.96zM14 13v4h-4v-4H7l5-5 5 5h-3z" />
            </svg>
            <p className="text-text-secondary text-sm">拖放音视频文件到此处，或点击选择文件</p>
            <p className="text-text-muted text-xs mt-1">支持 MP3 / FLAC / WAV / OGG / M4A / MP4 / MKV / WEBM 等，单文件最大 500MB</p>
            <input
              ref={fileInputRef}
              type="file"
              className="hidden"
              multiple
              accept=".mp3,.flac,.wav,.ogg,.m4a,.aac,.opus,.wma,.mp4,.mkv,.webm,.avi,.mov,.m4v,.flv"
              onChange={(e) => {
                const files = Array.from(e.target.files || []);
                setUploadFiles((p) => [...p, ...files]);
                e.target.value = '';
              }}
            />
          </div>

          {/* Subfolder input */}
          <div className="panel-card p-4 space-y-3">
            <div>
              <label className="block text-xs text-text-muted mb-1.5">保存到子目录（可选，如 <code className="bg-bg-active px-1 rounded">albums/2024</code>）</label>
              <input
                className="input-field w-full text-sm"
                placeholder="留空则保存到根目录"
                value={uploadSubPath}
                onChange={(e) => setUploadSubPath(e.target.value)}
              />
            </div>

            {/* File queue */}
            {uploadFiles.length > 0 && (
              <div className="space-y-1">
                <p className="text-xs text-text-muted">待上传 {uploadFiles.length} 个文件：</p>
                {uploadFiles.map((f, i) => (
                  <div key={i} className="flex items-center justify-between bg-bg-card rounded-lg px-3 py-1.5 text-xs">
                    <span className="text-text-secondary truncate flex-1">{f.name}</span>
                    <span className="text-text-muted ml-2">{(f.size / 1024 / 1024).toFixed(1)}MB</span>
                    <button
                      className="ml-2 text-text-muted hover:text-red-400"
                      onClick={() => setUploadFiles((p) => p.filter((_, j) => j !== i))}
                    >×</button>
                  </div>
                ))}
              </div>
            )}

            <button className="btn-primary w-full" onClick={runUpload} disabled={!uploadFiles.length}>
              开始上传
            </button>
          </div>

          {/* Upload results */}
          {Object.keys(uploadProgress).length > 0 && (
            <div className="panel-card p-4 space-y-1.5">
              <p className="text-xs text-text-muted font-medium mb-2">上传结果：</p>
              {Object.entries(uploadProgress).map(([name, status]) => (
                <div key={name} className="flex gap-2 text-xs">
                  <span className={`flex-shrink-0 ${status.startsWith('✓') ? 'text-emerald-400' : status.startsWith('⚠') ? 'text-yellow-400' : status.startsWith('✗') ? 'text-red-400' : 'text-text-muted'}`}>
                    {status.split(':')[0]}
                  </span>
                  <span className="text-text-secondary truncate">{name}</span>
                  {status.includes(':') && <span className="text-text-muted truncate">{status.split(':').slice(1).join(':')}</span>}
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 歌曲管理 ── */}
      {activeTab === 'songs' && (
        <div className="space-y-4">
          <div className="flex gap-2 flex-wrap items-center">
            <input
              className="input-field flex-1 min-w-32 text-sm"
              placeholder="搜索标题 / 歌手 / 路径…"
              value={songSearch}
              onChange={(e) => setSongSearch(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && loadSongs(songSearch)}
            />
            <select
              className="input-field text-sm min-w-28"
              value={adminAlbumFilter ?? ''}
              onChange={(e) => setAdminAlbumFilter(e.target.value === '' ? null : e.target.value)}
              title="按专辑筛选"
            >
              <option value="">全部专辑</option>
              {adminAlbums.map((album) => (
                <option key={album} value={album}>{album}</option>
              ))}
            </select>
            <button className="btn-secondary" onClick={() => loadSongs(songSearch)}>刷新</button>
            <button className="btn-primary" onClick={() => setShowNewSongModal(true)}>新增歌曲</button>
            <button className="btn-secondary" onClick={scanLocal} disabled={scanning}>
              {scanning ? '扫描中…' : '扫描本地目录'}
            </button>
          </div>
          {scanResult && (
            <div className="text-sm rounded-lg px-3 py-2.5 flex items-start gap-2"
              style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-accent-glow flex-shrink-0 mt-0.5" fill="currentColor">
                <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z" />
              </svg>
              <span className="text-text-secondary">{scanResult}</span>
            </div>
          )}
          {songError && <p className="text-red-400 text-xs">{songError}</p>}

          {/* Batch action toolbar */}
          {selectedSongIds.size > 0 && (
            <div className="glass-card px-4 py-3 flex flex-wrap items-center gap-3 fade-in">
              <span className="text-sm font-medium" style={{ color: '#60a5fa' }}>
                已选 {selectedSongIds.size} / {displaySongs.length} 首
              </span>
              <button
                className="btn-ghost text-xs"
                onClick={() => setSelectedSongIds(new Set())}
              >取消全选</button>

              <div className="flex-1" />

              {/* Batch visibility */}
              <div className="flex items-center gap-1.5">
                <span className="text-xs text-text-muted">改为</span>
                <select
                  className="input-field text-xs py-1 px-2"
                  value={batchVisibility}
                  onChange={(e) => setBatchVisibility(e.target.value as 'public' | 'friends' | 'private')}
                >
                  <option value="public">public</option>
                  <option value="friends">friends</option>
                  <option value="private">private</option>
                </select>
                <button
                  className="btn-secondary text-xs"
                  disabled={batchLoading}
                  onClick={batchUpdateVisibility}
                >批量修改可见性</button>
              </div>

              {/* Batch delete */}
              <button
                className="btn-danger text-xs"
                disabled={batchLoading}
                onClick={() => batchDelete(false)}
              >批量删除记录</button>
              <button
                className="text-xs px-3 py-1.5 rounded-lg border transition-all duration-200"
                style={{ background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' }}
                disabled={batchLoading}
                onClick={() => batchDelete(true)}
              >批量删除+文件</button>
            </div>
          )}
          {batchResult && (
            <div className="text-sm rounded-lg px-3 py-2 flex items-center gap-2 fade-in"
              style={{ background: 'rgba(37,99,235,0.08)', border: '1px solid rgba(37,99,235,0.2)', color: '#a0aec0' }}>
              <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-accent-glow flex-shrink-0" fill="currentColor">
                <path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z" />
              </svg>
              {batchResult}
              <button className="ml-auto text-text-muted hover:text-text-primary" onClick={() => setBatchResult('')}>×</button>
            </div>
          )}

          {/* Song table */}
          <div className="panel-card p-4 overflow-x-auto">
            {loadingSongs ? (
              <p className="text-text-muted text-sm text-center py-8">加载中…</p>
            ) : displaySongs.length === 0 ? (
              <p className="text-text-muted text-sm text-center py-8">
                {songs.length === 0 ? '暂无歌曲' : '当前专辑下无歌曲'}
              </p>
            ) : (
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-text-muted border-b border-border">
                    <th className="py-2 pr-3 w-8">
                      <input
                        type="checkbox"
                        className="song-check"
                        checked={displaySongs.length > 0 && selectedSongIds.size === displaySongs.length}
                        onChange={toggleSelectAll}
                        title="全选/取消当前列表"
                      />
                    </th>
                    {['标题', '歌手', '专辑', '可见性', '用户', '路径', '操作'].map((h) => (
                      <th key={h} className="text-left py-2 pr-3 font-medium whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {displaySongs.map((song) => {
                    const isChecked = selectedSongIds.has(song.id);
                    return (
                      <tr
                        key={song.id}
                        className={`border-b border-border/40 cursor-pointer transition-colors ${
                          isChecked ? 'bg-accent-primary/8' :
                          selectedSong?.id === song.id ? 'bg-accent-primary/10' : 'hover:bg-bg-hover'
                        }`}
                        onClick={(e) => {
                          if ((e.target as HTMLElement).closest('input[type="checkbox"]') || (e.target as HTMLElement).closest('button')) return;
                          setSelectedSong(song); setEditSong({ ...song });
                        }}
                      >
                        <td className="py-2 pr-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            className="song-check"
                            checked={isChecked}
                            onChange={() => toggleSelectSong(song.id)}
                          />
                        </td>
                        <td className="py-2 pr-3 max-w-40 truncate text-text-primary">{song.title}</td>
                        <td className="py-2 pr-3 max-w-28 truncate text-text-secondary">{song.artist || '—'}</td>
                        <td className="py-2 pr-3 max-w-28 truncate text-text-secondary">{song.album || '—'}</td>
                        <td className="py-2 pr-3"><Badge v={song.visibility} /></td>
                        <td className="py-2 pr-3 text-text-muted">{song.owner?.username}</td>
                        <td className="py-2 pr-3 text-text-muted text-xs max-w-36 truncate">{song.sourcePath}</td>
                        <td className="py-2" onClick={(e) => e.stopPropagation()}>
                          <div className="flex gap-1.5">
                            <button
                              className="btn-secondary text-xs"
                              onClick={() => { setSelectedSong(song); setEditSong({ ...song }); setShowEditSongModal(true); }}
                            >编辑</button>
                            <button
                              className="btn-danger text-xs"
                              onClick={() => setDeleteTarget(song)}
                            >删除</button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* ── 好友管理 ── */}
      {activeTab === 'friends' && (
        <div className="panel-card p-4 space-y-4">
          <p className="text-sm text-text-secondary">
            将某用户加入好友后，他可以访问你设置为 <span className="badge-friends">friends</span> 的歌曲。
          </p>
          <div className="flex gap-2">
            <input className="input-field flex-1 text-sm" placeholder="输入用户名添加好友"
              value={addFriendUsername}
              onChange={(e) => setAddFriendUsername(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && addFriend()}
            />
            <button className="btn-primary" onClick={addFriend} disabled={!addFriendUsername.trim()}>添加</button>
          </div>
          {friendMsg.text && (
            <p className={`text-xs ${friendMsg.ok ? 'text-emerald-400' : 'text-red-400'}`}>{friendMsg.text}</p>
          )}
          {loadingFriends ? (
            <p className="text-text-muted text-sm text-center py-6">加载中…</p>
          ) : friends.length === 0 ? (
            <p className="text-text-muted text-sm text-center py-6">暂无好友</p>
          ) : (
            <div className="space-y-2">
              {friends.map((f) => (
                <div key={f.friendId} className="flex items-center justify-between bg-bg-card rounded-lg px-3 py-2">
                  <div>
                    <span className="text-sm text-text-primary">{f.friendUsername}</span>
                    <span className="text-xs text-text-muted ml-2">{new Date(f.createdAt).toLocaleDateString('zh-CN')}</span>
                  </div>
                  <button className="btn-danger text-xs"
                    onClick={async () => { await friendsApi.remove(token, f.friendId); setFriends((p) => p.filter((x) => x.friendId !== f.friendId)); }}
                  >移除</button>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── 用户管理 ── */}
      {activeTab === 'users' && (
        <div className="panel-card p-4 overflow-x-auto">
          {loadingUsers ? (
            <p className="text-text-muted text-sm text-center py-8">加载中…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  {['用户名', '角色', '注册时间', '操作'].map((h) => (
                    <th key={h} className="text-left py-2 pr-4 font-medium">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {allUsers.map((u) => (
                  <tr key={u.id} className="border-b border-border/40">
                    <td className="py-2.5 pr-4 text-text-primary font-medium">
                      {u.username}{u.id === currentUser.id && <span className="text-xs text-text-muted ml-1">(我)</span>}
                    </td>
                    <td className="py-2.5 pr-4">
                      <span className={u.role === 'admin'
                        ? 'text-xs bg-accent-primary/20 text-accent-glow border border-accent-primary/30 px-2 py-0.5 rounded-full'
                        : 'text-xs bg-bg-card text-text-secondary border border-border px-2 py-0.5 rounded-full'
                      }>{u.role}</span>
                    </td>
                    <td className="py-2.5 pr-4 text-text-muted text-xs">{new Date(u.createdAt).toLocaleDateString('zh-CN')}</td>
                    <td className="py-2.5">
                      <div className="flex gap-1.5">
                        {(['admin', 'normal'] as const).map((r) => (
                          <button
                            key={r}
                            disabled={u.role === r}
                            onClick={() => setUserRole(u.id, r)}
                            className={`text-xs px-2 py-1 rounded-lg border transition-all ${u.role === r
                              ? r === 'admin' ? 'border-accent-primary/30 bg-accent-primary/20 text-accent-glow opacity-40 cursor-default'
                                : 'border-border bg-bg-card text-text-secondary opacity-40 cursor-default'
                              : r === 'admin' ? 'border-accent-primary/30 bg-accent-primary/10 text-accent-glow hover:bg-accent-primary/20'
                                : 'border-border bg-bg-card text-text-secondary hover:bg-bg-hover'
                            }`}
                          >
                            {r}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── 邀请码 ── */}
      {activeTab === 'invites' && (
        <div className="panel-card p-4 space-y-4">
          <p className="text-text-muted text-sm">生成邀请码供新用户注册使用，每个邀请码仅能使用一次。</p>
          <div className="flex items-center gap-2">
            <button
              className="btn-primary"
              disabled={creatingInvite}
              onClick={async () => {
                setCreatingInvite(true);
                try {
                  const row = await adminApi.inviteCodes.create(token);
                  setInviteCodes((prev) => [{ ...row, usedAt: null, usedById: null }, ...prev]);
                  await navigator.clipboard.writeText(row.code);
                  alert(`已生成并已复制到剪贴板：${row.code}`);
                } catch (e) {
                  alert(e instanceof Error ? e.message : '生成失败');
                } finally {
                  setCreatingInvite(false);
                }
              }}
            >
              {creatingInvite ? '…' : '生成邀请码'}
            </button>
            <button className="btn-secondary" onClick={loadInviteCodes} disabled={loadingInvites}>刷新</button>
          </div>
          {loadingInvites ? (
            <p className="text-text-muted text-sm">加载中…</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-text-muted border-b border-border">
                  <th className="text-left py-2 pr-4 font-medium">邀请码</th>
                  <th className="text-left py-2 pr-4 font-medium">状态</th>
                  <th className="text-left py-2 pr-4 font-medium">创建时间</th>
                </tr>
              </thead>
              <tbody>
                {inviteCodes.map((row) => (
                  <tr key={row.id} className="border-b border-border/40">
                    <td className="py-2.5 pr-4 font-mono text-text-primary">{row.code}</td>
                    <td className="py-2.5 pr-4">
                      {row.usedAt
                        ? <span className="text-xs text-text-muted">已使用</span>
                        : <span className="text-xs text-emerald-500">未使用</span>}
                    </td>
                    <td className="py-2.5 pr-4 text-text-muted text-xs">{new Date(row.createdAt).toLocaleString('zh-CN')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {!loadingInvites && inviteCodes.length === 0 && (
            <p className="text-text-muted text-sm">暂无邀请码，点击「生成邀请码」创建。</p>
          )}
        </div>
      )}

      {/* ── 网盘（仅后台展示，子目录即专辑） ── */}
      {activeTab === 'cloud' && (
        <div className="panel-card p-4 space-y-4">
          <p className="text-text-muted text-sm">网盘仅在此处查看，读取规则与本地库一致：子目录视为专辑，文件为歌曲。若未配置网盘则此处无数据。</p>
          {/* 面包屑 */}
          <div className="flex flex-wrap items-center gap-1 text-sm">
            <button
              type="button"
              className="text-text-muted hover:text-text-primary transition-colors"
              onClick={() => { setCloudFolderStack([]); if (cloudProvider) loadCloudItems(cloudProvider); }}
            >
              根目录
            </button>
            {cloudFolderStack.map((f, i) => (
              <span key={f.id} className="flex items-center gap-1">
                <span className="text-text-muted">/</span>
                <button
                  type="button"
                  className="text-text-muted hover:text-text-primary transition-colors truncate max-w-32"
                  onClick={() => goBackCloudFolder(i)}
                >
                  {f.name}
                </button>
              </span>
            ))}
          </div>
          {cloudError && <p className="text-red-400 text-sm">{cloudError}</p>}
          {cloudLoading ? (
            <p className="text-text-muted text-sm">加载中…</p>
          ) : cloudItems.length === 0 ? (
            <p className="text-text-muted text-sm">当前目录为空或未配置网盘。</p>
          ) : (
            <div className="space-y-2">
              <p className="text-xs text-text-muted font-medium">专辑（子目录）</p>
              <div className="flex flex-wrap gap-2">
                {cloudItems.filter((i) => i.type === 'folder').map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex items-center gap-2 px-3 py-2 rounded-lg border border-border bg-bg-card hover:bg-bg-hover transition-colors text-left"
                    onClick={() => openCloudFolder(item)}
                  >
                    <svg viewBox="0 0 24 24" className="w-5 h-5 text-text-muted flex-shrink-0" fill="currentColor">
                      <path d="M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z" />
                    </svg>
                    <span className="text-sm text-text-primary truncate max-w-48">{item.name}</span>
                  </button>
                ))}
              </div>
              <p className="text-xs text-text-muted font-medium mt-4">歌曲（音频文件）</p>
              <ul className="divide-y divide-border/60 rounded-lg border border-border overflow-hidden">
                {cloudItems.filter((i) => i.type === 'file').map((item) => (
                  <li key={item.id} className="flex items-center justify-between px-3 py-2 bg-bg-card hover:bg-bg-hover text-sm">
                    <span className="text-text-primary truncate flex-1">{item.name}</span>
                    <span className="text-text-muted text-xs ml-2">{(item.size / 1024).toFixed(1)} KB</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>

    {/* ── 新增歌曲弹窗 ── */}
    {showNewSongModal && (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 modal-backdrop"
        onClick={(e) => { if (e.target === e.currentTarget) setShowNewSongModal(false); }}
      >
        <div className="modal-content rounded-2xl w-full max-w-md p-5 space-y-4 scale-in max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-semibold text-text-primary">新增歌曲</h3>
            <button className="btn-ghost p-1 rounded-lg text-text-muted hover:text-text-primary" onClick={() => setShowNewSongModal(false)} aria-label="关闭">
              <svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
          <div className="space-y-3">
            {(['title', 'artist', 'album', 'sourcePath', 'coverUrl'] as const).map((f) => (
              <div key={f}>
                <label className="block text-xs text-text-muted mb-1">
                  {f === 'sourcePath' ? '路径/URL' : f === 'coverUrl' ? '封面 URL' : f}
                </label>
                <input className="input-field w-full text-sm"
                  value={String(newSong[f] ?? '')}
                  onChange={(e) => setNewSong((p) => ({ ...p, [f]: e.target.value }))}
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-text-muted mb-1">时长(秒)</label>
                <input type="number" className="input-field w-full text-sm"
                  value={newSong.durationSec}
                  onChange={(e) => setNewSong((p) => ({ ...p, durationSec: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">可见性</label>
                <select className="input-field w-full text-sm" value={newSong.visibility}
                  onChange={(e) => setNewSong((p) => ({ ...p, visibility: e.target.value as typeof newSong.visibility }))}>
                  {VISIBILITY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">所属用户</label>
              <select className="input-field w-full text-sm" value={newSong.ownerId}
                onChange={(e) => setNewSong((p) => ({ ...p, ownerId: Number(e.target.value) }))}>
                {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
            </div>
          </div>
          {songError && <p className="text-red-400 text-xs">{songError}</p>}
          <div className="flex gap-2 pt-1">
            <button className="flex-1 btn-secondary text-sm" onClick={() => setShowNewSongModal(false)}>取消</button>
            <button className="flex-1 btn-primary text-sm" onClick={createSong} disabled={!newSong.title || !newSong.sourcePath}>新增</button>
          </div>
        </div>
      </div>
    )}

    {/* ── 编辑歌曲弹窗 ── */}
    {showEditSongModal && selectedSong && (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 modal-backdrop"
        onClick={(e) => { if (e.target === e.currentTarget) setShowEditSongModal(false); }}
      >
        <div className="modal-content rounded-2xl w-full max-w-md p-5 space-y-4 scale-in max-h-[90vh] overflow-y-auto">
          <div className="flex items-center justify-between border-b border-border pb-3">
            <h3 className="text-sm font-semibold text-text-primary">编辑歌曲 — {selectedSong.title}</h3>
            <button className="btn-ghost p-1 rounded-lg text-text-muted hover:text-text-primary" onClick={() => setShowEditSongModal(false)} aria-label="关闭">
              <svg viewBox="0 0 24 24" className="w-5 h-5"><path fill="currentColor" d="M19 6.41L17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
            </button>
          </div>
          <div className="space-y-3">
            {(['title', 'artist', 'album', 'sourcePath', 'coverUrl'] as const).map((f) => (
              <div key={f}>
                <label className="block text-xs text-text-muted mb-1">
                  {f === 'sourcePath' ? '路径/URL' : f === 'coverUrl' ? '封面 URL' : f}
                </label>
                <input className="input-field w-full text-sm"
                  value={String((editSong as Record<string, unknown>)[f] ?? '')}
                  onChange={(e) => setEditSong((p) => ({ ...p, [f]: e.target.value }))}
                />
              </div>
            ))}
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label className="block text-xs text-text-muted mb-1">时长(秒)</label>
                <input type="number" className="input-field w-full text-sm"
                  value={editSong.durationSec ?? 0}
                  onChange={(e) => setEditSong((p) => ({ ...p, durationSec: Number(e.target.value) }))}
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1">可见性</label>
                <select className="input-field w-full text-sm" value={editSong.visibility ?? 'private'}
                  onChange={(e) => setEditSong((p) => ({ ...p, visibility: e.target.value as Song['visibility'] }))}>
                  {VISIBILITY_OPTIONS.map((v) => <option key={v} value={v}>{v}</option>)}
                </select>
              </div>
            </div>
            <div>
              <label className="block text-xs text-text-muted mb-1">所属用户</label>
              <select className="input-field w-full text-sm" value={editSong.ownerId ?? currentUser.id}
                onChange={(e) => setEditSong((p) => ({ ...p, ownerId: Number(e.target.value) }))}>
                {users.map((u) => <option key={u.id} value={u.id}>{u.username}</option>)}
              </select>
            </div>
          </div>
          {songError && <p className="text-red-400 text-xs">{songError}</p>}
          <div className="flex gap-2 pt-1">
            <button className="flex-1 btn-secondary text-sm" onClick={() => setShowEditSongModal(false)}>取消</button>
            <button className="flex-1 btn-primary text-sm" onClick={updateSong}>保存修改</button>
          </div>
        </div>
      </div>
    )}

    {/* ── Delete Confirmation Dialog ── */}
    
    {deleteTarget && (
      <div
        className="fixed inset-0 z-[200] flex items-center justify-center p-4 modal-backdrop"
        onClick={(e) => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
      >
        <div className="modal-content rounded-2xl w-full max-w-sm p-5 space-y-4 scale-in">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0"
              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)' }}>
              <svg viewBox="0 0 24 24" className="w-4 h-4 text-red-400" fill="currentColor">
                <path d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z" />
              </svg>
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-text-primary">确认删除歌曲</p>
              <p className="text-xs text-text-muted mt-0.5 break-all">《{deleteTarget.title}》</p>
              {deleteTarget.sourcePath && !deleteTarget.sourcePath.startsWith('http') && (
                <p className="text-xs text-text-muted mt-1 break-all opacity-60">{deleteTarget.sourcePath}</p>
              )}
            </div>
          </div>

          <div className="text-xs text-text-muted border rounded-lg px-3 py-2.5 space-y-1"
            style={{ borderColor: 'rgba(37,99,235,0.15)', background: 'rgba(37,99,235,0.05)' }}>
            <p>请选择删除方式：</p>
            <p>• <strong className="text-text-secondary">仅删除记录</strong> — 保留磁盘文件，仅清除数据库记录</p>
            {deleteTarget.sourcePath && !deleteTarget.sourcePath.startsWith('http') && (
              <p>• <strong className="text-red-400">同时删除文件</strong> — 数据库记录和磁盘文件一并删除（不可恢复）</p>
            )}
          </div>

          <div className="flex gap-2 pt-1">
            <button
              className="flex-1 btn-secondary text-sm"
              onClick={() => setDeleteTarget(null)}
            >
              取消
            </button>
            <button
              className="flex-1 btn-secondary text-sm"
              onClick={() => deleteSong(deleteTarget.id, false)}
            >
              仅删记录
            </button>
            {deleteTarget.sourcePath && !deleteTarget.sourcePath.startsWith('http') && (
              <button
                className="flex-1 text-sm px-3 py-1.5 rounded-lg border transition-all duration-200"
                style={{ background: 'rgba(239,68,68,0.15)', borderColor: 'rgba(239,68,68,0.3)', color: '#f87171' }}
                onClick={() => deleteSong(deleteTarget.id, true)}
              >
                删记录+文件
              </button>
            )}
          </div>
        </div>
      </div>
    )}
    </>
  );
}
