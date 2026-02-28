import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkSongAccess } from './songs';

const router = Router({ mergeParams: true });

// GET /api/songs/:id/comments
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const songId = parseInt(req.params.id);
  const userId = req.userId!;
  const userRole = req.userRole!;

  if (isNaN(songId)) {
    res.status(400).json({ error: '无效的歌曲 ID' });
    return;
  }

  try {
    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song) {
      res.status(404).json({ error: '歌曲不存在' });
      return;
    }

    const canAccess = await checkSongAccess(song, userId, userRole);
    if (!canAccess) {
      res.status(403).json({ error: '无权访问此歌曲的评论' });
      return;
    }

    const comments = await prisma.comment.findMany({
      where: { songId },
      orderBy: { createdAt: 'asc' },
      include: {
        user: { select: { id: true, username: true } },
      },
    });

    res.json(comments);
  } catch (err) {
    console.error('Get comments error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// POST /api/songs/:id/comments
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const songId = parseInt(req.params.id);
  const userId = req.userId!;
  const userRole = req.userRole!;
  const { content } = req.body;

  if (isNaN(songId)) {
    res.status(400).json({ error: '无效的歌曲 ID' });
    return;
  }
  if (!content || !content.trim()) {
    res.status(400).json({ error: '评论内容不能为空' });
    return;
  }
  if (content.length > 500) {
    res.status(400).json({ error: '评论最长 500 字' });
    return;
  }

  try {
    const song = await prisma.song.findUnique({ where: { id: songId } });
    if (!song) {
      res.status(404).json({ error: '歌曲不存在' });
      return;
    }

    const canAccess = await checkSongAccess(song, userId, userRole);
    if (!canAccess) {
      res.status(403).json({ error: '无权评论此歌曲' });
      return;
    }

    const comment = await prisma.comment.create({
      data: { content: content.trim(), userId, songId },
      include: {
        user: { select: { id: true, username: true } },
      },
    });

    res.status(201).json(comment);
  } catch (err) {
    console.error('Post comment error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
