import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// 构建权限过滤条件
function buildVisibilityFilter(userId: number, userRole: string) {
  if (userRole === 'admin') return {}; // admin 可以看所有歌曲
  return {
    OR: [
      { visibility: 'public' },
      { ownerId: userId },
      {
        visibility: 'friends',
        owner: {
          friends: {
            some: { friendId: userId },
          },
        },
      },
    ],
  };
}

// GET /api/songs?q=keyword
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const q = (req.query.q as string) || '';
  const userId = req.userId!;
  const userRole = req.userRole!;

  try {
    const visFilter = buildVisibilityFilter(userId, userRole);
    const searchFilter = q
      ? {
          OR: [
            { title: { contains: q } },
            { artist: { contains: q } },
            { album: { contains: q } },
          ],
        }
      : {};

    const where = q
      ? { AND: [visFilter, searchFilter] }
      : visFilter;

    const songs = await prisma.song.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        title: true,
        artist: true,
        album: true,
        durationSec: true,
        coverUrl: true,
        visibility: true,
        ownerId: true,
        createdAt: true,
        owner: { select: { username: true } },
      },
    });

    res.json(songs);
  } catch (err) {
    console.error('Songs list error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// GET /api/songs/:id
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const userId = req.userId!;
  const userRole = req.userRole!;

  if (isNaN(id)) {
    res.status(400).json({ error: '无效的歌曲 ID' });
    return;
  }

  try {
    const song = await prisma.song.findUnique({
      where: { id },
      include: { owner: { select: { id: true, username: true } } },
    });

    if (!song) {
      res.status(404).json({ error: '歌曲不存在' });
      return;
    }

    const canAccess = await checkSongAccess(song, userId, userRole);
    if (!canAccess) {
      res.status(403).json({ error: '无权访问此歌曲' });
      return;
    }

    res.json(song);
  } catch (err) {
    console.error('Song detail error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export async function checkSongAccess(
  song: { visibility: string; ownerId: number },
  userId: number,
  userRole: string
): Promise<boolean> {
  if (userRole === 'admin') return true;
  if (song.ownerId === userId) return true;
  if (song.visibility === 'public') return true;
  if (song.visibility === 'friends') {
    const relation = await prisma.userRelation.findUnique({
      where: { userId_friendId: { userId: song.ownerId, friendId: userId } },
    });
    return !!relation;
  }
  return false;
}

export default router;
