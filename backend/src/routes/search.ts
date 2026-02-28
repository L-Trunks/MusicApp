import { Router, Request, Response } from 'express';
import { authenticate } from '../middleware/auth';

const router = Router();

const NETEASE_API_URL = (process.env.NETEASE_API_URL || '').replace(/\/$/, '');
const NETEASE_COOKIE = process.env.NETEASE_COOKIE || '';

function neteaseHeaders() {
  const h: Record<string, string> = { 'User-Agent': 'Mozilla/5.0' };
  if (NETEASE_COOKIE) h['Cookie'] = NETEASE_COOKIE;
  return h;
}

// GET /api/search/external?q=xxx&limit=30
router.get('/external', authenticate, async (req: Request, res: Response) => {
  const q = (req.query.q as string || '').trim();
  const limit = Math.min(parseInt(req.query.limit as string) || 30, 50);

  if (!q) { res.status(400).json({ error: '搜索词不能为空' }); return; }
  if (!NETEASE_API_URL) {
    res.status(503).json({ error: '外站搜索未配置，请在 .env 中设置 NETEASE_API_URL' });
    return;
  }

  try {
    const url = `${NETEASE_API_URL}/search?keywords=${encodeURIComponent(q)}&limit=${limit}&type=1`;
    const resp = await fetch(url, { headers: neteaseHeaders() });
    const data = await resp.json() as {
      result?: { songs?: Array<{
        id: number; name: string;
        artists?: Array<{ name: string }>;
        album?: { name: string; picUrl?: string };
        duration?: number;
      }> };
    };

    const songs = (data.result?.songs || []).map((s) => ({
      externalId: String(s.id),
      title: s.name,
      artist: s.artists?.map((a) => a.name).join(' / ') || '',
      album: s.album?.name || '',
      albumCover: s.album?.picUrl || '',
      durationSec: Math.floor((s.duration || 0) / 1000),
      platform: 'netease' as const,
    }));

    res.json(songs);
  } catch (err) {
    console.error('External search error:', err);
    res.status(500).json({ error: '外站搜索失败，请检查 NETEASE_API_URL 是否可访问' });
  }
});

// GET /api/search/external/url?id=xxx
router.get('/external/url', authenticate, async (req: Request, res: Response) => {
  const id = (req.query.id as string || '').trim();
  if (!id) { res.status(400).json({ error: 'id 不能为空' }); return; }
  if (!NETEASE_API_URL) {
    res.status(503).json({ error: '外站搜索未配置' });
    return;
  }

  try {
    const url = `${NETEASE_API_URL}/song/url/v1?id=${id}&level=exhigh`;
    const resp = await fetch(url, { headers: neteaseHeaders() });
    const data = await resp.json() as {
      data?: Array<{ id: number; url: string | null }>;
    };

    const entry = data.data?.[0];
    if (!entry?.url) {
      res.status(404).json({ error: '无法获取播放链接（VIP 歌曲或已下架）' });
      return;
    }
    res.json({ url: entry.url });
  } catch (err) {
    console.error('Get song URL error:', err);
    res.status(500).json({ error: '获取播放链接失败' });
  }
});

export default router;
