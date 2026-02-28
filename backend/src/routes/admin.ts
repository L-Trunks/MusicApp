import { Router, Response } from 'express';
import fs from 'fs';
import path from 'path';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
const MUSIC_ROOT_PATH = process.env.MUSIC_ROOT_PATH || '/music';
const AUDIO_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma',
  '.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v', '.flv',
]);

router.use(authenticate, requireAdmin);

// ============ 用户管理 ============

// GET /api/admin/users
router.get('/users', async (_req: AuthRequest, res: Response) => {
  try {
    const users = await prisma.user.findMany({
      select: { id: true, username: true, role: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });
    res.json(users);
  } catch (err) {
    console.error('Admin get users error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// PATCH /api/admin/users/:id  body: { role }
router.patch('/users/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  const { role } = req.body;

  if (isNaN(id)) {
    res.status(400).json({ error: '无效的用户 ID' });
    return;
  }
  if (!['admin', 'normal'].includes(role)) {
    res.status(400).json({ error: 'role 只能是 admin 或 normal' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { id } });
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role },
      select: { id: true, username: true, role: true, createdAt: true },
    });
    res.json(updated);
  } catch (err) {
    console.error('Admin update user error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// ============ 歌曲管理 ============

// GET /api/admin/songs?q=keyword
router.get('/songs', async (req: AuthRequest, res: Response) => {
  const q = (req.query.q as string) || '';

  try {
    const where = q
      ? {
          OR: [
            { title: { contains: q } },
            { artist: { contains: q } },
            { album: { contains: q } },
            { sourcePath: { contains: q } },
          ],
        }
      : {};

    const songs = await prisma.song.findMany({
      where,
      orderBy: { createdAt: 'desc' },
      include: {
        owner: { select: { id: true, username: true } },
      },
    });
    res.json(songs);
  } catch (err) {
    console.error('Admin get songs error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// POST /api/admin/songs
router.post('/songs', async (req: AuthRequest, res: Response) => {
  const { title, artist, album, durationSec, coverUrl, sourcePath, visibility, ownerId } = req.body;

  if (!title || !sourcePath) {
    res.status(400).json({ error: 'title 和 sourcePath 不能为空' });
    return;
  }

  try {
    const owner = await prisma.user.findUnique({ where: { id: Number(ownerId) } });
    if (!owner) {
      res.status(400).json({ error: '指定的 ownerId 用户不存在' });
      return;
    }

    const song = await prisma.song.create({
      data: {
        title,
        artist: artist || '',
        album: album || '',
        durationSec: Number(durationSec) || 0,
        coverUrl: coverUrl || '',
        sourcePath,
        visibility: ['public', 'friends', 'private'].includes(visibility) ? visibility : 'private',
        ownerId: Number(ownerId),
      },
      include: { owner: { select: { id: true, username: true } } },
    });
    res.status(201).json(song);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2002') {
      res.status(409).json({ error: '该 sourcePath 已存在' });
      return;
    }
    console.error('Admin create song error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// PUT /api/admin/songs/:id
router.put('/songs/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: '无效的歌曲 ID' });
    return;
  }

  const { title, artist, album, durationSec, coverUrl, sourcePath, visibility, ownerId } = req.body;

  try {
    const song = await prisma.song.findUnique({ where: { id } });
    if (!song) {
      res.status(404).json({ error: '歌曲不存在' });
      return;
    }

    const updated = await prisma.song.update({
      where: { id },
      data: {
        ...(title !== undefined && { title }),
        ...(artist !== undefined && { artist }),
        ...(album !== undefined && { album }),
        ...(durationSec !== undefined && { durationSec: Number(durationSec) }),
        ...(coverUrl !== undefined && { coverUrl }),
        ...(sourcePath !== undefined && { sourcePath }),
        ...(visibility !== undefined && {
          visibility: ['public', 'friends', 'private'].includes(visibility) ? visibility : song.visibility,
        }),
        ...(ownerId !== undefined && { ownerId: Number(ownerId) }),
      },
      include: { owner: { select: { id: true, username: true } } },
    });
    res.json(updated);
  } catch (err: unknown) {
    const e = err as { code?: string };
    if (e.code === 'P2002') {
      res.status(409).json({ error: '该 sourcePath 已存在' });
      return;
    }
    console.error('Admin update song error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// DELETE /api/admin/songs/:id?deleteFile=true
router.delete('/songs/:id', async (req: AuthRequest, res: Response) => {
  const id = parseInt(req.params.id);
  if (isNaN(id)) {
    res.status(400).json({ error: '无效的歌曲 ID' });
    return;
  }
  const deleteFile = req.query.deleteFile === 'true';

  try {
    const song = await prisma.song.findUnique({ where: { id } });
    if (!song) {
      res.status(404).json({ error: '歌曲不存在' });
      return;
    }

    // 删除关联数据，再删歌曲（PlaylistSong 由 DB 级联）
    await prisma.comment.deleteMany({ where: { songId: id } });
    await prisma.song.delete({ where: { id } });

    // 可选：同时删除磁盘文件（仅本地文件，防止路径穿越）
    let fileDeleted = false;
    if (deleteFile && song.sourcePath && !song.sourcePath.startsWith('http')) {
      const safeRoot = path.resolve(MUSIC_ROOT_PATH);
      const filePath = path.resolve(MUSIC_ROOT_PATH, song.sourcePath);
      if (filePath.startsWith(safeRoot) && fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
        fileDeleted = true;
      }
    }

    res.json({ message: fileDeleted ? '歌曲记录及文件已删除' : '歌曲已删除', fileDeleted });
  } catch (err) {
    console.error('Admin delete song error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// PATCH /api/admin/songs/batch — 批量修改可见性
router.patch('/songs/batch', async (req: AuthRequest, res: Response) => {
  const { ids, visibility } = req.body as { ids: number[]; visibility: string };

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: '请提供歌曲 ID 列表' });
    return;
  }
  if (!['public', 'friends', 'private'].includes(visibility)) {
    res.status(400).json({ error: '无效的可见性值' });
    return;
  }

  try {
    await prisma.song.updateMany({
      where: { id: { in: ids } },
      data: { visibility: visibility as 'public' | 'friends' | 'private' },
    });
    res.json({ updated: ids.length, message: `已将 ${ids.length} 首歌曲改为 ${visibility}` });
  } catch (err) {
    console.error('Batch update visibility error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// DELETE /api/admin/songs/batch — 批量删除（可选同时删文件）
router.delete('/songs/batch', async (req: AuthRequest, res: Response) => {
  const { ids, deleteFiles } = req.body as { ids: number[]; deleteFiles?: boolean };

  if (!Array.isArray(ids) || ids.length === 0) {
    res.status(400).json({ error: '请提供歌曲 ID 列表' });
    return;
  }

  try {
    const songs = await prisma.song.findMany({
      where: { id: { in: ids } },
      select: { id: true, sourcePath: true },
    });

    await prisma.$transaction([
      prisma.comment.deleteMany({ where: { songId: { in: ids } } }),
      prisma.song.deleteMany({ where: { id: { in: ids } } }),
    ]);

    let filesDeleted = 0;
    if (deleteFiles) {
      const safeRoot = path.resolve(MUSIC_ROOT_PATH);
      for (const song of songs) {
        if (!song.sourcePath || song.sourcePath.startsWith('http')) continue;
        const filePath = path.resolve(MUSIC_ROOT_PATH, song.sourcePath);
        if (filePath.startsWith(safeRoot) && fs.existsSync(filePath)) {
          try { fs.unlinkSync(filePath); filesDeleted++; } catch { /* 忽略 */ }
        }
      }
    }

    res.json({
      deleted: ids.length,
      filesDeleted,
      message: `已删除 ${ids.length} 首歌曲${filesDeleted ? `，同时删除 ${filesDeleted} 个文件` : ''}`,
    });
  } catch (err) {
    console.error('Batch delete error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// POST /api/admin/songs/scan-local  — 全量同步：新增 + 清理失效记录
router.post('/songs/scan-local', async (req: AuthRequest, res: Response) => {
  const adminId = req.userId!;

  try {
    if (!fs.existsSync(MUSIC_ROOT_PATH)) {
      res.status(400).json({ error: `MUSIC_ROOT_PATH 目录不存在: ${MUSIC_ROOT_PATH}` });
      return;
    }

    // ── 第一步：遍历磁盘，收集所有有效音频文件的相对路径 ──────────────────
    const allDiskFiles = walkDir(MUSIC_ROOT_PATH);
    const diskPaths = new Set<string>();
    for (const filePath of allDiskFiles) {
      const ext = path.extname(filePath).toLowerCase();
      if (!AUDIO_EXTENSIONS.has(ext)) continue;
      diskPaths.add(path.relative(MUSIC_ROOT_PATH, filePath).replace(/\\/g, '/'));
    }

    // ── 第二步：查出 DB 中所有本地歌曲（排除 HTTP URL） ───────────────────
    const dbLocalSongs = await prisma.song.findMany({
      where: {
        NOT: [
          { sourcePath: { startsWith: 'http://' } },
          { sourcePath: { startsWith: 'https://' } },
        ],
      },
      select: { id: true, sourcePath: true },
    });

    // ── 第三步：清理"磁盘已不存在"的 DB 记录 ────────────────────────────
    const staleIds = dbLocalSongs
      .filter((s) => s.sourcePath && !diskPaths.has(s.sourcePath))
      .map((s) => s.id);

    let removed = 0;
    if (staleIds.length > 0) {
      await prisma.$transaction([
        prisma.comment.deleteMany({ where: { songId: { in: staleIds } } }),
        prisma.song.deleteMany({ where: { id: { in: staleIds } } }),
      ]);
      removed = staleIds.length;
    }

    // ── 第四步：对磁盘新文件创建 DB 记录 ────────────────────────────────
    const existingPaths = new Set(
      dbLocalSongs.filter((s) => !staleIds.includes(s.id)).map((s) => s.sourcePath)
    );

    let created = 0;
    for (const relativePath of diskPaths) {
      if (existingPaths.has(relativePath)) continue;

      const ext = path.extname(relativePath);
      const nameWithoutExt = path.basename(relativePath, ext);
      const parts = relativePath.split('/');
      const albumFromDir = parts.length > 1 ? parts[0] : '';

      await prisma.song.create({
        data: {
          title: nameWithoutExt,
          artist: '',
          album: albumFromDir,
          durationSec: 0,
          coverUrl: '',
          sourcePath: relativePath,
          visibility: 'private',
          ownerId: adminId,
        },
      });
      created++;
    }

    res.json({
      scanned: diskPaths.size,
      created,
      removed,
      message: `磁盘 ${diskPaths.size} 个文件 · 新增 ${created} 条 · 清理 ${removed} 条失效记录`,
    });
  } catch (err) {
    console.error('Scan local error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

function walkDir(dir: string): string[] {
  const results: string[] = [];
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        results.push(...walkDir(fullPath));
      } else if (entry.isFile()) {
        results.push(fullPath);
      }
    }
  } catch {
    // 忽略无权限目录
  }
  return results;
}

export default router;
