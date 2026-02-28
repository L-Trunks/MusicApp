const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';

async function request<T>(
  path: string,
  options: RequestInit & { token?: string } = {}
): Promise<T> {
  const { token, ...rest } = options;
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(rest.headers as Record<string, string>),
  };
  const res = await fetch(`${API_BASE}${path}`, { ...rest, headers });
  const data = await res.json().catch(() => ({ error: '服务器响应异常' }));
  if (!res.ok) throw new Error(data.error || `请求失败 (${res.status})`);
  return data as T;
}

// ---- Auth ----
export const authApi = {
  getCaptcha: () =>
    request<{ captchaId: string; question: string }>('/api/auth/captcha'),
  register: (
    username: string,
    password: string,
    captchaId: string,
    captchaAnswer: string
  ) =>
    request<{ token: string; user: import('./types').User }>('/api/auth/register', {
      method: 'POST',
      body: JSON.stringify({ username, password, captchaId, captchaAnswer }),
    }),
  login: (
    username: string,
    password: string,
    captchaId: string,
    captchaAnswer: string
  ) =>
    request<{ token: string; user: import('./types').User }>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password, captchaId, captchaAnswer }),
    }),
  me: (token: string) => request<import('./types').User>('/api/auth/me', { token }),
};

// ---- Songs ----
export const songsApi = {
  list: (token: string, q = '') =>
    request<import('./types').Song[]>(`/api/songs${q ? `?q=${encodeURIComponent(q)}` : ''}`, { token }),
  get: (token: string, id: number) =>
    request<import('./types').Song>(`/api/songs/${id}`, { token }),
};

// ---- Stream URL (token as query param for <audio>/<video> src) ----
export function getStreamUrl(id: number, token: string) {
  return `${API_BASE}/api/stream/${id}?t=${encodeURIComponent(token)}`;
}

// ---- Comments ----
export const commentsApi = {
  list: (token: string, songId: number) =>
    request<import('./types').Comment[]>(`/api/songs/${songId}/comments`, { token }),
  create: (token: string, songId: number, content: string) =>
    request<import('./types').Comment>(`/api/songs/${songId}/comments`, {
      method: 'POST', body: JSON.stringify({ content }), token,
    }),
};

// ---- Friends ----
export const friendsApi = {
  list: (token: string) =>
    request<import('./types').Friend[]>('/api/me/friends', { token }),
  add: (token: string, username: string) =>
    request<import('./types').Friend>('/api/me/friends', {
      method: 'POST', body: JSON.stringify({ username }), token,
    }),
  remove: (token: string, friendId: number) =>
    request<{ message: string }>(`/api/me/friends/${friendId}`, { method: 'DELETE', token }),
};

// ---- Playlists ----
export const playlistsApi = {
  list: (token: string) =>
    request<import('./types').Playlist[]>('/api/playlists', { token }),
  get: (token: string, id: number) =>
    request<import('./types').Playlist>(`/api/playlists/${id}`, { token }),
  create: (token: string, name: string, description = '') =>
    request<import('./types').Playlist>('/api/playlists', {
      method: 'POST', body: JSON.stringify({ name, description }), token,
    }),
  update: (token: string, id: number, data: { name?: string; description?: string }) =>
    request<import('./types').Playlist>(`/api/playlists/${id}`, {
      method: 'PUT', body: JSON.stringify(data), token,
    }),
  delete: (token: string, id: number) =>
    request<{ message: string }>(`/api/playlists/${id}`, { method: 'DELETE', token }),
  addSongs: (token: string, id: number, songIds: number[]) =>
    request<{ added: number }>(`/api/playlists/${id}/songs`, {
      method: 'POST', body: JSON.stringify({ songIds }), token,
    }),
  removeSong: (token: string, id: number, songId: number) =>
    request<{ message: string }>(`/api/playlists/${id}/songs/${songId}`, { method: 'DELETE', token }),
};

// ---- Upload ----
export async function uploadFile(
  token: string,
  file: File,
  subPath = ''
): Promise<{ message: string; relativePath: string; song: import('./types').Song; created: boolean }> {
  const form = new FormData();
  form.append('file', file);
  if (subPath) form.append('subPath', subPath);

  const res = await fetch(`${API_BASE}/api/upload`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
    body: form,
  });
  const data = await res.json().catch(() => ({ error: '响应异常' }));
  if (!res.ok) throw new Error(data.error || `上传失败 (${res.status})`);
  return data;
}

// ---- External Search ----
export const searchApi = {
  external: (token: string, q: string, limit = 30) =>
    request<import('./types').ExternalSong[]>(
      `/api/search/external?q=${encodeURIComponent(q)}&limit=${limit}`,
      { token }
    ),
  externalUrl: (token: string, id: string) =>
    request<{ url: string }>(
      `/api/search/external/url?id=${encodeURIComponent(id)}`,
      { token }
    ),
};

// ---- Admin ----
export const adminApi = {
  users: {
    list: (token: string) =>
      request<import('./types').User[]>('/api/admin/users', { token }),
    setRole: (token: string, id: number, role: string) =>
      request<import('./types').User>(`/api/admin/users/${id}`, {
        method: 'PATCH', body: JSON.stringify({ role }), token,
      }),
  },
  songs: {
    list: (token: string, q = '') =>
      request<import('./types').Song[]>(`/api/admin/songs${q ? `?q=${encodeURIComponent(q)}` : ''}`, { token }),
    create: (token: string, data: Partial<import('./types').Song>) =>
      request<import('./types').Song>('/api/admin/songs', {
        method: 'POST', body: JSON.stringify(data), token,
      }),
    update: (token: string, id: number, data: Partial<import('./types').Song>) =>
      request<import('./types').Song>(`/api/admin/songs/${id}`, {
        method: 'PUT', body: JSON.stringify(data), token,
      }),
    delete: (token: string, id: number, deleteFile = false) =>
      request<{ message: string; fileDeleted: boolean }>(
        `/api/admin/songs/${id}${deleteFile ? '?deleteFile=true' : ''}`,
        { method: 'DELETE', token }
      ),
    batchSetVisibility: (token: string, ids: number[], visibility: 'public' | 'friends' | 'private') =>
      request<{ updated: number; message: string }>('/api/admin/songs/batch', {
        method: 'PATCH', body: JSON.stringify({ ids, visibility }), token,
      }),
    batchDelete: (token: string, ids: number[], deleteFiles = false) =>
      request<{ deleted: number; filesDeleted: number; message: string }>('/api/admin/songs/batch', {
        method: 'DELETE', body: JSON.stringify({ ids, deleteFiles }), token,
      }),
    scanLocal: (token: string) =>
      request<{ scanned: number; created: number; removed: number; message: string }>(
        '/api/admin/songs/scan-local', { method: 'POST', token }
      ),
  },
};
