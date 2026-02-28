/**
 * 云端网盘音源：Google Drive / OneDrive
 * 参考：Google Drive API https://developers.google.com/drive/api/reference/rest
 *       Microsoft Graph OneDrive https://learn.microsoft.com/en-us/graph/api/driveitem-get-content
 */
import { Router, Response } from 'express';
import jwt from 'jsonwebtoken';
import { google } from 'googleapis';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

function resolveAuth(req: AuthRequest): boolean {
  if (req.userId) return true;
  let token: string | null = null;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) token = authHeader.slice(7);
  else if (typeof req.query.t === 'string') token = req.query.t;
  if (!token) return false;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number };
    req.userId = payload.userId;
    return true;
  } catch {
    return false;
  }
}

function requireAuthStream(req: AuthRequest, res: Response, next: () => void) {
  if (resolveAuth(req)) return next();
  res.status(401).json({ error: '未登录或 token 无效' });
}

router.use((req: AuthRequest, res: Response, next) => {
  if (req.path.includes('/stream/')) {
    if (resolveAuth(req)) return next();
    return res.status(401).json({ error: '未登录或 token 无效' });
  }
  return authenticate(req, res, next);
});

const AUDIO_MIME_PREFIX = 'audio/';
const AUDIO_EXTS = new Set(['.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma']);

function isAudioFile(name: string, mimeType?: string): boolean {
  if (mimeType?.toLowerCase().startsWith(AUDIO_MIME_PREFIX)) return true;
  const ext = name.includes('.') ? '.' + name.split('.').pop()!.toLowerCase() : '';
  return AUDIO_EXTS.has(ext);
}

// ─── Google Drive ───────────────────────────────────────────────────────────
function getDriveClient() {
  const raw = process.env.GOOGLE_DRIVE_CREDENTIALS;
  if (!raw?.trim()) return null;
  let credentials: Record<string, unknown>;
  try {
    credentials = JSON.parse(raw) as Record<string, unknown>;
  } catch {
    return null;
  }
  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/drive.readonly'],
  });
  const drive = google.drive({ version: 'v3', auth });
  return drive;
}

// GET /api/cloud/gdrive/list?folderId=xxx
router.get('/gdrive/list', async (_req: AuthRequest, res: Response) => {
  const drive = getDriveClient();
  if (!drive) {
    return res.status(503).json({ error: '未配置 Google Drive（GOOGLE_DRIVE_CREDENTIALS）' });
  }
  const folderId = (typeof _req.query.folderId === 'string' && _req.query.folderId)
    ? _req.query.folderId
    : process.env.GOOGLE_DRIVE_FOLDER_ID || 'root';
  try {
    const r = await drive.files.list({
      q: `'${folderId}' in parents and trashed = false`,
      fields: 'files(id,name,mimeType,size)',
      pageSize: 200,
      orderBy: 'name',
    });
    const items: Array<{ type: 'folder' | 'file'; id: string; name: string; mimeType?: string; size: number }> = [];
    for (const f of r.data.files || []) {
      if (!f.id || !f.name) continue;
      const mime = f.mimeType || '';
      if (mime === 'application/vnd.google-apps.folder') {
        items.push({ type: 'folder', id: f.id, name: f.name, size: 0 });
      } else if (isAudioFile(f.name, mime)) {
        items.push({
          type: 'file',
          id: f.id,
          name: f.name,
          mimeType: mime,
          size: f.size ? parseInt(String(f.size), 10) : 0,
        });
      }
    }
    return res.json({ items });
  } catch (e) {
    console.error('GDrive list error:', e);
    return res.status(500).json({ error: '列举 Google Drive 文件失败' });
  }
});

// GET /api/cloud/gdrive/stream/:fileId
router.get('/gdrive/stream/:fileId', async (req: AuthRequest, res: Response) => {
  const drive = getDriveClient();
  if (!drive) {
    return res.status(503).json({ error: '未配置 Google Drive' });
  }
  const fileId = req.params.fileId;
  if (!fileId) return res.status(400).json({ error: '缺少 fileId' });
  try {
    const { data } = await drive.files.get(
      { fileId, alt: 'media' },
      { responseType: 'stream' }
    );
    const stream = data as NodeJS.ReadableStream;
    res.setHeader('Cache-Control', 'private, max-age=86400');
    res.status(200);
    stream.pipe(res);
  } catch (e) {
    console.error('GDrive stream error:', e);
    return res.status(500).json({ error: '流式获取 Google Drive 文件失败' });
  }
});

// ─── OneDrive (Microsoft Graph) ──────────────────────────────────────────────
async function getOneDriveToken(): Promise<string | null> {
  const clientId = process.env.ONEDRIVE_CLIENT_ID;
  const clientSecret = process.env.ONEDRIVE_CLIENT_SECRET;
  const refreshToken = process.env.ONEDRIVE_REFRESH_TOKEN;
  if (!clientId || !clientSecret || !refreshToken) return null;
  const body = new URLSearchParams({
    client_id: clientId,
    client_secret: clientSecret,
    refresh_token: refreshToken,
    grant_type: 'refresh_token',
  });
  const res = await fetch('https://login.microsoftonline.com/common/oauth2/v2.0/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: body.toString(),
  });
  if (!res.ok) return null;
  const data = (await res.json()) as { access_token?: string };
  return data.access_token || null;
}

// GET /api/cloud/onedrive/list?folderId=xxx (folderId 为空则根目录)
router.get('/onedrive/list', async (req: AuthRequest, res: Response) => {
  const token = await getOneDriveToken();
  if (!token) {
    return res.status(503).json({ error: '未配置 OneDrive（ONEDRIVE_CLIENT_ID/SECRET/REFRESH_TOKEN）' });
  }
  const folderId = typeof req.query.folderId === 'string' && req.query.folderId !== ''
    ? req.query.folderId
    : 'root';
  const url = folderId === 'root'
    ? 'https://graph.microsoft.com/v1.0/me/drive/root/children?$select=id,name,size,file,folder'
    : `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(folderId)}/children?$select=id,name,size,file,folder`;
  try {
    const r = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!r.ok) {
      const t = await r.text();
      console.error('OneDrive list error:', r.status, t);
      return res.status(r.status).json({ error: '列举 OneDrive 文件失败' });
    }
    const data = (await r.json()) as {
      value?: Array<{
        id: string;
        name: string;
        size?: number;
        file?: { mimeType?: string };
        folder?: Record<string, unknown>;
      }>;
    };
    const items: Array<{ type: 'folder' | 'file'; id: string; name: string; size: number }> = [];
    for (const f of data.value || []) {
      if (!f.id || !f.name) continue;
      if (f.folder) {
        items.push({ type: 'folder', id: f.id, name: f.name, size: 0 });
      } else if (f.file ? isAudioFile(f.name, f.file.mimeType) : isAudioFile(f.name)) {
        items.push({ type: 'file', id: f.id, name: f.name, size: f.size || 0 });
      }
    }
    return res.json({ items });
  } catch (e) {
    console.error('OneDrive list error:', e);
    return res.status(500).json({ error: '列举 OneDrive 文件失败' });
  }
});

// GET /api/cloud/onedrive/stream/:itemId
router.get('/onedrive/stream/:itemId', async (req: AuthRequest, res: Response) => {
  const token = await getOneDriveToken();
  if (!token) {
    return res.status(503).json({ error: '未配置 OneDrive' });
  }
  const itemId = req.params.itemId;
  if (!itemId) return res.status(400).json({ error: '缺少 itemId' });
  try {
    const metaRes = await fetch(
      `https://graph.microsoft.com/v1.0/me/drive/items/${encodeURIComponent(itemId)}?select=id,@microsoft.graph.downloadUrl`,
      { headers: { Authorization: `Bearer ${token}` } }
    );
    if (!metaRes.ok) {
      return res.status(metaRes.status).json({ error: '获取 OneDrive 文件信息失败' });
    }
    const meta = (await metaRes.json()) as { '@microsoft.graph.downloadUrl'?: string };
    const downloadUrl = meta['@microsoft.graph.downloadUrl'];
    if (!downloadUrl) return res.status(404).json({ error: '无法获取下载地址' });
    const range = req.headers.range;
    const headers: Record<string, string> = {};
    if (range) headers['Range'] = range;
    const streamRes = await fetch(downloadUrl, { headers });
    if (!streamRes.ok) return res.status(streamRes.status).json({ error: '下载失败' });
    res.setHeader('Cache-Control', 'private, max-age=86400');
    const ct = streamRes.headers.get('content-type');
    if (ct) res.setHeader('Content-Type', ct);
    const cl = streamRes.headers.get('content-length');
    if (cl) res.setHeader('Content-Length', cl);
    const cr = streamRes.headers.get('content-range');
    if (cr) res.setHeader('Content-Range', cr);
    res.status(streamRes.status);
    const body = streamRes.body;
    if (body) {
      const reader = body.getReader();
      const pump = (): Promise<void> => {
        return reader.read().then(({ done, value }) => {
          if (done) return;
          res.write(value);
          return pump();
        });
      };
      await pump();
    }
    res.end();
  } catch (e) {
    console.error('OneDrive stream error:', e);
    return res.status(500).json({ error: '流式获取 OneDrive 文件失败' });
  }
});

export default router;
