import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import crypto from 'crypto';
import prisma from '../lib/prisma';
import { authenticate, AuthRequest } from '../middleware/auth';

const JWT_SECRET = process.env.JWT_SECRET || 'change-me-in-production';
const JWT_EXPIRES_IN = '3d'; // 3 天过期，访问时刷新

// ----- 验证码内存存储（captchaId -> { answer, expiresAt }），提交后一次性删除 -----
const CAPTCHA_TTL_MS = 5 * 60 * 1000; // 5 分钟
const captchaStore = new Map<string, { answer: string; expiresAt: number }>();

function generateMathCaptcha(): { question: string; answer: string } {
  const a = Math.floor(Math.random() * 15) + 1;
  const b = Math.floor(Math.random() * 15) + 1;
  return { question: `${a} + ${b} = ?`, answer: String(a + b) };
}

function cleanupExpiredCaptcha() {
  const now = Date.now();
  for (const [id, v] of captchaStore.entries()) {
    if (v.expiresAt < now) captchaStore.delete(id);
  }
}

const router = Router();

// GET /api/auth/captcha — 获取验证码（数学题），用于登录/注册
router.get('/captcha', (_req: Request, res: Response) => {
  cleanupExpiredCaptcha();
  const id = crypto.randomBytes(16).toString('hex');
  const { question, answer } = generateMathCaptcha();
  captchaStore.set(id, { answer, expiresAt: Date.now() + CAPTCHA_TTL_MS });
  res.json({ captchaId: id, question });
});

function verifyCaptcha(captchaId: string, answer: string): boolean {
  if (!captchaId || !answer) return false;
  const entry = captchaStore.get(captchaId);
  captchaStore.delete(captchaId); // 一次性使用
  if (!entry || entry.expiresAt < Date.now()) return false;
  return entry.answer === String(answer).trim();
}

// ----- 登录/注册频率限制（按 IP，防止同一 IP 狂刷） -----
const authRateLimit = new Map<string, { count: number; resetAt: number }>();
const AUTH_RATE_WINDOW_MS = 60 * 1000; // 1 分钟
const AUTH_RATE_MAX = 10; // 每分钟最多 10 次尝试

function getClientIp(req: Request): string {
  const xff = req.headers['x-forwarded-for'];
  if (typeof xff === 'string') return xff.split(',')[0].trim();
  if (Array.isArray(xff) && xff[0]) return xff[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

function checkAuthRateLimit(ip: string): boolean {
  const now = Date.now();
  let entry = authRateLimit.get(ip);
  if (!entry || entry.resetAt < now) {
    entry = { count: 0, resetAt: now + AUTH_RATE_WINDOW_MS };
    authRateLimit.set(ip, entry);
  }
  entry.count++;
  return entry.count <= AUTH_RATE_MAX;
}

// POST /api/auth/register
router.post('/register', async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  if (!checkAuthRateLimit(ip)) {
    res.status(429).json({ error: '尝试次数过多，请稍后再试' });
    return;
  }

  const { username, password, captchaId, captchaAnswer, inviteCode } = req.body;

  if (!captchaId || !captchaAnswer) {
    res.status(400).json({ error: '请完成验证码' });
    return;
  }
  if (!verifyCaptcha(captchaId, captchaAnswer)) {
    res.status(400).json({ error: '验证码错误或已过期，请刷新后重试' });
    return;
  }
  if (!inviteCode || typeof inviteCode !== 'string' || !String(inviteCode).trim()) {
    res.status(400).json({ error: '请输入邀请码' });
    return;
  }
  if (!username || !password) {
    res.status(400).json({ error: '用户名和密码不能为空' });
    return;
  }
  if (username.length < 2 || username.length > 32) {
    res.status(400).json({ error: '用户名长度应为 2-32 个字符' });
    return;
  }
  if (password.length < 6) {
    res.status(400).json({ error: '密码至少 6 位' });
    return;
  }

  try {
    const codeRow = await prisma.inviteCode.findFirst({
      where: { code: String(inviteCode).trim(), usedAt: null },
    });
    if (!codeRow) {
      res.status(400).json({ error: '邀请码无效或已被使用' });
      return;
    }

    const existing = await prisma.user.findUnique({ where: { username } });
    if (existing) {
      res.status(409).json({ error: '用户名已存在' });
      return;
    }

    const userCount = await prisma.user.count();
    const role = userCount === 0 ? 'admin' : 'normal';

    const passwordHash = await bcrypt.hash(password, 12);
    const user = await prisma.user.create({
      data: { username, passwordHash, role },
      select: { id: true, username: true, role: true, createdAt: true },
    });

    await prisma.inviteCode.update({
      where: { id: codeRow.id },
      data: { usedAt: new Date(), usedById: user.id },
    });

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.status(201).json({ token, user });
  } catch (err) {
    console.error('Register error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// POST /api/auth/login
router.post('/login', async (req: Request, res: Response) => {
  const ip = getClientIp(req);
  if (!checkAuthRateLimit(ip)) {
    res.status(429).json({ error: '尝试次数过多，请稍后再试' });
    return;
  }

  const { username, password, captchaId, captchaAnswer } = req.body;

  if (!captchaId || !captchaAnswer) {
    res.status(400).json({ error: '请完成验证码' });
    return;
  }
  if (!verifyCaptcha(captchaId, captchaAnswer)) {
    res.status(400).json({ error: '验证码错误或已过期，请刷新后重试' });
    return;
  }

  if (!username || !password) {
    res.status(400).json({ error: '用户名和密码不能为空' });
    return;
  }

  try {
    const user = await prisma.user.findUnique({ where: { username } });
    if (!user) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }

    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      res.status(401).json({ error: '用户名或密码错误' });
      return;
    }

    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({
      token,
      user: { id: user.id, username: user.username, role: user.role, createdAt: user.createdAt },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// GET /api/auth/me — 返回用户信息；若带有效 token 则同时返回新 token（刷新 3 天过期）
router.get('/me', authenticate, async (req: AuthRequest, res: Response) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.userId },
      select: { id: true, username: true, role: true, createdAt: true, updatedAt: true },
    });
    if (!user) {
      res.status(404).json({ error: '用户不存在' });
      return;
    }
    const token = jwt.sign({ userId: user.id, role: user.role }, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN });
    res.json({ user, token });
  } catch (err) {
    console.error('Me error:', err);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

export default router;
