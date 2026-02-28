import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';

dotenv.config();

import authRoutes from './routes/auth';
import songRoutes from './routes/songs';
import streamRoutes from './routes/stream';
import commentRoutes from './routes/comments';
import friendRoutes from './routes/friends';
import adminRoutes from './routes/admin';
import playlistRoutes from './routes/playlists';
import uploadRoutes from './routes/upload';
import searchRoutes from './routes/search';

const app = express();
const PORT = process.env.PORT || 3001;

app.use(
  cors({
    origin: process.env.FRONTEND_URL || '*',
    credentials: true,
  })
);
app.use(express.json());

// Health check
app.get('/api/health', (_req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

app.use('/api/auth', authRoutes);
app.use('/api/songs', songRoutes);
app.use('/api/songs/:id/comments', commentRoutes);
app.use('/api/stream', streamRoutes);
app.use('/api/me/friends', friendRoutes);
app.use('/api/playlists', playlistRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/admin', adminRoutes);

// 404 handler
app.use((_req, res) => {
  res.status(404).json({ error: '接口不存在' });
});

app.listen(PORT, () => {
  console.log(`🎵 MusicApp backend running on port ${PORT}`);
});
