import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';
import { checkSongAccess } from './songs';

const router = Router();

// GET /api/playlists  — 当前用户的歌单列表
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const playlists = await prisma.playlist.findMany({
      where: { ownerId: req.userId! },
      orderBy: { createdAt: 'asc' },
      include: { _count: { select: { items: true } } },
    });
    res.json(playlists);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// POST /api/playlists  — 创建歌单
router.post('/', authenticate, async (req: AuthRequest, res: Response) => {
  const { name, description } = req.body;
  if (!name?.trim()) {
    res.status(400).json({ error: '歌单名称不能为空' });
    return;
  }
  try {
    const playlist = await prisma.playlist.create({
      data: { name: name.trim(), description: description?.trim() || '', ownerId: req.userId! },
      include: { _count: { select: { items: true } } },
    });
    res.status(201).json(playlist);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// GET /api/playlists/:id  — 歌单详情（含歌曲，做权限过滤）
router.get('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const userId = req.userId!;
  const userRole = req.userRole!;

  try {
    const playlist = await prisma.playlist.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { position: 'asc' },
          include: {
            song: {
              include: { owner: { select: { id: true, username: true } } },
            },
          },
        },
      },
    });

    if (!playlist) {
      res.status(404).json({ error: '歌单不存在' });
      return;
    }
    if (playlist.ownerId !== userId && userRole !== 'admin') {
      res.status(403).json({ error: '无权访问此歌单' });
      return;
    }

    // 过滤用户无权访问的歌曲
    const accessibleItems = await Promise.all(
      playlist.items.map(async (item) => {
        const ok = await checkSongAccess(item.song, userId, userRole);
        return ok ? item : null;
      })
    );

    res.json({
      ...playlist,
      items: accessibleItems.filter(Boolean),
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// PUT /api/playlists/:id  — 修改歌单名称/描述
router.put('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const { name, description } = req.body;

  try {
    const playlist = await prisma.playlist.findUnique({ where: { id } });
    if (!playlist) { res.status(404).json({ error: '歌单不存在' }); return; }
    if (playlist.ownerId !== req.userId! && req.userRole !== 'admin') {
      res.status(403).json({ error: '无权修改此歌单' }); return;
    }

    const updated = await prisma.playlist.update({
      where: { id },
      data: {
        ...(name?.trim() && { name: name.trim() }),
        ...(description !== undefined && { description: description.trim() }),
      },
      include: { _count: { select: { items: true } } },
    });
    res.json(updated);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// DELETE /api/playlists/:id  — 删除歌单
router.delete('/:id', authenticate, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  try {
    const playlist = await prisma.playlist.findUnique({ where: { id } });
    if (!playlist) { res.status(404).json({ error: '歌单不存在' }); return; }
    if (playlist.ownerId !== req.userId! && req.userRole !== 'admin') {
      res.status(403).json({ error: '无权删除此歌单' }); return;
    }
    await prisma.playlist.delete({ where: { id } });
    res.json({ message: '歌单已删除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// POST /api/playlists/:id/songs  — 批量添加歌曲 body: { songIds: number[] }
router.post('/:id/songs', authenticate, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const { songIds } = req.body as { songIds: number[] };

  if (!Array.isArray(songIds) || songIds.length === 0) {
    res.status(400).json({ error: 'songIds 不能为空' });
    return;
  }

  try {
    const playlist = await prisma.playlist.findUnique({ where: { id } });
    if (!playlist) { res.status(404).json({ error: '歌单不存在' }); return; }
    if (playlist.ownerId !== req.userId! && req.userRole !== 'admin') {
      res.status(403).json({ error: '无权修改此歌单' }); return;
    }

    // 获取当前最大 position
    const maxPos = await prisma.playlistSong.aggregate({
      where: { playlistId: id },
      _max: { position: true },
    });
    let pos = (maxPos._max.position ?? -1) + 1;

    // 跳过已存在的，逐个插入
    let added = 0;
    for (const songId of songIds) {
      try {
        await prisma.playlistSong.create({ data: { playlistId: id, songId, position: pos++ } });
        added++;
      } catch {
        // 已存在则跳过 (unique constraint)
      }
    }

    res.json({ message: `已添加 ${added} 首歌曲`, added });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// DELETE /api/playlists/:id/songs/:songId  — 从歌单移除歌曲
router.delete('/:id/songs/:songId', authenticate, async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const songId = parseInt(req.params.songId);

  try {
    const playlist = await prisma.playlist.findUnique({ where: { id } });
    if (!playlist) { res.status(404).json({ error: '歌单不存在' }); return; }
    if (playlist.ownerId !== req.userId! && req.userRole !== 'admin') {
      res.status(403).json({ error: '无权修改此歌单' }); return;
    }

    await prisma.playlistSong.deleteMany({ where: { playlistId: id, songId } });
    res.json({ message: '已从歌单移除' });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
