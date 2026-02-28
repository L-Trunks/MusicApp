export interface User {
  id: number;
  username: string;
  role: 'admin' | 'normal';
  createdAt: string;
  updatedAt?: string;
}

export interface Song {
  id: number;
  title: string;
  artist: string;
  album: string;
  durationSec: number;
  coverUrl: string;
  sourcePath?: string;
  visibility: 'public' | 'friends' | 'private';
  ownerId: number;
  createdAt: string;
  updatedAt?: string;
  owner?: { id?: number; username: string };
  /** 虚拟歌曲（URL/外站）的显式类型标记；undefined = 自动检测 */
  isVideoHint?: boolean;
}

export interface Comment {
  id: number;
  content: string;
  createdAt: string;
  userId: number;
  songId: number;
  user: { id: number; username: string };
}

export interface Friend {
  friendId: number;
  friendUsername: string;
  createdAt: string;
}

export interface Playlist {
  id: number;
  name: string;
  description: string;
  ownerId: number;
  createdAt: string;
  updatedAt: string;
  _count?: { items: number };
  items?: PlaylistSong[];
}

export interface PlaylistSong {
  id: number;
  playlistId: number;
  songId: number;
  position: number;
  createdAt: string;
  song: Song;
}

export interface AuthState {
  token: string;
  user: User;
}

export type PlayMode = 'sequential' | 'shuffle' | 'repeat-one';

export interface ExternalSong {
  externalId: string;
  title: string;
  artist: string;
  album: string;
  albumCover?: string;
  durationSec: number;
  platform: 'netease' | string;
}

// 虚拟歌曲（外站/URL 直播，无 DB id）用 id=-1 标识
export function makeVirtualSong(
  title: string,
  artist: string,
  album: string,
  directUrl: string,
  coverUrl = '',
  durationSec = 0,
  isVideoHint?: boolean   // 明确指定媒体类型，undefined = 自动检测
): Song {
  return {
    id: -1,
    title,
    artist,
    album,
    durationSec,
    coverUrl,
    sourcePath: directUrl,
    visibility: 'public',
    ownerId: 0,
    createdAt: new Date().toISOString(),
    isVideoHint,
  };
}

const VIDEO_EXTS = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v', '.flv']);

/**
 * 判断路径/URL 是否为视频。
 * 正确处理 URL 格式：只检查 pathname 部分，忽略 query/hash。
 */
export function isVideoFile(sourcePath = ''): boolean {
  let pathPart = sourcePath;
  try {
    if (/^https?:\/\//i.test(sourcePath)) {
      pathPart = new URL(sourcePath).pathname;
    }
  } catch { /* 非合法 URL，原样使用 */ }

  // 去除残余 query/hash（非 URL 字符串兜底）
  pathPart = pathPart.split('?')[0].split('#')[0];

  const segments = pathPart.split('.');
  if (segments.length < 2) return false;
  const ext = '.' + segments[segments.length - 1].toLowerCase();
  return VIDEO_EXTS.has(ext);
}

/** HLS (.m3u8) / MPEG-DASH (.mpd) 流媒体播放列表，本质是视频 */
export function isStreamingVideo(url = ''): boolean {
  return /\.(m3u8|mpd)(\?|#|$)/i.test(url);
}

/** 综合判断：isVideoFile OR 流媒体协议 OR 显式标记 */
export function resolveIsVideo(song: Song): boolean {
  if (song.isVideoHint !== undefined) return song.isVideoHint;
  return isVideoFile(song.sourcePath || '') || isStreamingVideo(song.sourcePath || '');
}

export function formatDuration(sec: number): string {
  if (!sec) return '--:--';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60);
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function formatDateTime(dateStr: string): string {
  return new Date(dateStr).toLocaleString('zh-CN', {
    month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit',
  });
}
