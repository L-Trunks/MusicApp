import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const router = Router();

// GET /api/me/friends
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;

  try {
    const relations = await prisma.userRelation.findMany({
      where: { userId },
      include: {
        friend: { select: { id: true, username: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    const friends = relations.map((r) => ({
      friendId: r.friendId,
      friendUsername: r.friend.username,
      createdAt: r.createdAt,
    }));

    res.json(friends);
  } catch (err) {
    console.error('Get friends error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// POST /api/me/friends  body: { username }
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const { username } = req.body;

  if (!username) {
    res.status(400).json({ error: '用户名不能为空' });
    return;
  }

  try {
    const friend = await prisma.user.findUnique({
      where: { username },
      select: { id: true, username: true },
    });

    if (!friend) {
      res.status(404).json({ error: `用户 "${username}" 不存在` });
      return;
    }

    if (friend.id === userId) {
      res.status(400).json({ error: '不能添加自己为好友' });
      return;
    }

    const existing = await prisma.userRelation.findUnique({
      where: { userId_friendId: { userId, friendId: friend.id } },
    });

    if (existing) {
      res.status(409).json({ error: '该用户已在好友列表中' });
      return;
    }

    const relation = await prisma.userRelation.create({
      data: { userId, friendId: friend.id },
    });

    res.status(201).json({
      friendId: friend.id,
      friendUsername: friend.username,
      createdAt: relation.createdAt,
    });
  } catch (err) {
    console.error('Add friend error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// DELETE /api/me/friends/:friendId
router.delete('/:friendId', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const friendId = parseInt(req.params.friendId);

  if (isNaN(friendId)) {
    res.status(400).json({ error: '无效的好友 ID' });
    return;
  }

  try {
    const relation = await prisma.userRelation.findUnique({
      where: { userId_friendId: { userId, friendId } },
    });

    if (!relation) {
      res.status(404).json({ error: '好友关系不存在' });
      return;
    }

    await prisma.userRelation.delete({
      where: { userId_friendId: { userId, friendId } },
    });

    res.json({ message: '已移除好友' });
  } catch (err) {
    console.error('Remove friend error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
