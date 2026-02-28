import { Router, Request, Response } from 'express';
import fs from 'fs';
import path from 'path';
import mime from 'mime-types';
import jwt from 'jsonwebtoken';
import prisma from '../lib/prisma';
import { AuthRequest } from '../middleware/auth';
import { checkSongAccess } from './songs';

const router = Router();
const MUSIC_ROOT_PATH = process.env.MUSIC_ROOT_PATH || '/music';
const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';

// 支持 header 或 query 参数传 token（audio 标签不支持自定义 header）
function resolveAuth(req: Request): { userId: number; userRole: string } | null {
  let token: string | undefined;

  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    token = authHeader.slice(7);
  } else if (typeof req.query.t === 'string') {
    token = req.query.t;
  }

  if (!token) return null;
  try {
    const payload = jwt.verify(token, JWT_SECRET) as { userId: number; role: string };
    return { userId: payload.userId, userRole: payload.role };
  } catch {
    return null;
  }
}

// GET /api/stream/:id
router.get('/:id', async (req: AuthRequest, res: Response) => {
  const auth = resolveAuth(req);
  if (!auth) {
    res.status(401).json({ error: '未登录，请先登录' });
    return;
  }
  const { userId, userRole } = auth;
  const id = parseInt(req.params.id);

  if (isNaN(id)) {
    res.status(400).json({ error: '无效的歌曲 ID' });
    return;
  }

  try {
    const song = await prisma.song.findUnique({ where: { id } });

    if (!song) {
      res.status(404).json({ error: '歌曲不存在' });
      return;
    }

    const canAccess = await checkSongAccess(song, userId, userRole);
    if (!canAccess) {
      res.status(403).json({ error: '无权播放此歌曲' });
      return;
    }

    // 网络 URL 直接重定向
    if (song.sourcePath.startsWith('http://') || song.sourcePath.startsWith('https://')) {
      res.redirect(302, song.sourcePath);
      return;
    }

    // 本地文件：安全路径处理（防止路径穿越）
    const relativePath = song.sourcePath.replace(/\.\./g, '').replace(/^\/+/, '');
    const filePath = path.resolve(MUSIC_ROOT_PATH, relativePath);

    // 确保文件路径在 MUSIC_ROOT_PATH 内
    if (!filePath.startsWith(path.resolve(MUSIC_ROOT_PATH))) {
      res.status(400).json({ error: '非法的文件路径' });
      return;
    }

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: '音频文件不存在' });
      return;
    }

    const stat = fs.statSync(filePath);
    const fileSize = stat.size;
    const contentType = (mime.lookup(filePath) || 'audio/mpeg') as string;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, '').split('-');
      const start = parseInt(parts[0], 10);
      const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;

      if (start >= fileSize || end >= fileSize || start > end) {
        res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
        return;
      }

      const chunkSize = end - start + 1;
      const stream = fs.createReadStream(filePath, { start, end });

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${fileSize}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Cache-Control': 'private, max-age=86400',
      });

      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': fileSize,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Cache-Control': 'private, max-age=86400',
      });
      fs.createReadStream(filePath).pipe(res);
    }
  } catch (err) {
    console.error('Stream error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
