import { Router, Response } from 'express';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

export interface PlaybackStatePayload {
  songIds: number[];
  currentIndex: number;
  currentTime: number;
  playMode: 'sequential' | 'shuffle' | 'repeat-one';
  volume?: number;
  playbackRate?: number;
  shuffleOrder?: number[];
  queueExtra?: Array<{
    title: string;
    artist: string;
    album: string;
    sourcePath: string;
    coverUrl?: string;
    durationSec: number;
    isVideoHint?: boolean;
  }>;
  lastPositionBySongId?: Record<number, number>;
}

const router = Router();

// GET /api/me/playback-state
router.get('/', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  try {
    const row = await prisma.playbackState.findUnique({
      where: { userId },
    });
    if (!row || !row.state) return res.json(null);
    return res.json(row.state as unknown as PlaybackStatePayload);
  } catch (err) {
    console.error('Get playback state error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// PUT /api/me/playback-state
router.put('/', authenticate, async (req: AuthRequest, res: Response) => {
  const userId = req.userId!;
  const body = req.body as PlaybackStatePayload;
  if (!Array.isArray(body.songIds)) {
    return res.status(400).json({ error: 'songIds 必须为数组' });
  }
  const state = {
    songIds: body.songIds,
    currentIndex: typeof body.currentIndex === 'number' ? body.currentIndex : 0,
    currentTime: typeof body.currentTime === 'number' ? body.currentTime : 0,
    playMode: body.playMode || 'sequential',
    volume: body.volume,
    playbackRate: body.playbackRate,
    shuffleOrder: body.shuffleOrder,
    queueExtra: body.queueExtra,
    lastPositionBySongId: body.lastPositionBySongId,
  };
  try {
    await prisma.playbackState.upsert({
      where: { userId },
      create: { userId, state },
      update: { state },
    });
    return res.json({ ok: true });
  } catch (err) {
    console.error('Put playback state error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
