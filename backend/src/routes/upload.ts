import { Router, Response } from 'express';
import multer from 'multer';
import path from 'path';
import fs from 'fs';
import prisma from '../lib/prisma';
import { authenticate, requireAdmin, AuthRequest } from '../middleware/auth';

const router = Router();
const MUSIC_ROOT_PATH = process.env.MUSIC_ROOT_PATH || '/music';

const ALLOWED_EXTENSIONS = new Set([
  '.mp3', '.flac', '.wav', '.ogg', '.m4a', '.aac', '.opus', '.wma',
  '.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v', '.flv',
]);

const storage = multer.diskStorage({
  destination: (req, _file, cb) => {
    const subPath = ((req.body.subPath as string) || '').replace(/\.\./g, '').replace(/^\/+/, '');
    const targetDir = subPath
      ? path.resolve(MUSIC_ROOT_PATH, subPath)
      : MUSIC_ROOT_PATH;

    if (!targetDir.startsWith(path.resolve(MUSIC_ROOT_PATH))) {
      cb(new Error('非法路径'), '');
      return;
    }

    fs.mkdirSync(targetDir, { recursive: true });
    cb(null, targetDir);
  },
  filename: (_req, file, cb) => {
    // 保留原始文件名，过滤危险字符
    const safe = Buffer.from(file.originalname, 'latin1').toString('utf8')
      .replace(/[<>:"/\\|?*\x00-\x1f]/g, '_');
    cb(null, safe);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 1024 * 1024 * 500 }, // 500 MB
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXTENSIONS.has(ext)) {
      cb(null, true);
    } else {
      cb(new Error(`不支持的文件类型: ${ext}`));
    }
  },
});

// POST /api/upload  (admin only)
// form-data: file, subPath (optional)
router.post(
  '/',
  authenticate,
  requireAdmin,
  (req: AuthRequest, res: Response, next) => {
    upload.single('file')(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        res.status(400).json({ error: `上传失败: ${err.message}` });
        return;
      }
      if (err) {
        res.status(400).json({ error: err.message });
        return;
      }
      next();
    });
  },
  async (req: AuthRequest, res: Response) => {
    const file = req.file;
    if (!file) {
      res.status(400).json({ error: '未收到文件' });
      return;
    }

    const relativePath = path.relative(MUSIC_ROOT_PATH, file.path).replace(/\\/g, '/');
    const ext = path.extname(file.originalname).toLowerCase();
    const titleName = path.basename(file.originalname, ext);

    // 检查是否已存在相同路径
    const existing = await prisma.song.findUnique({ where: { sourcePath: relativePath } });
    if (existing) {
      res.json({
        message: '文件已存在，跳过创建歌曲记录',
        relativePath,
        song: existing,
        created: false,
      });
      return;
    }

    // 自动创建 Song 记录
    const song = await prisma.song.create({
      data: {
        title: titleName,
        artist: '',
        album: '',
        durationSec: 0,
        coverUrl: '',
        sourcePath: relativePath,
        visibility: 'private',
        ownerId: req.userId!,
      },
      include: { owner: { select: { id: true, username: true } } },
    });

    res.status(201).json({
      message: '上传成功',
      relativePath,
      song,
      created: true,
    });
  }
);

export default router;
