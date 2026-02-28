# MusicApp 服务器部署与 Nginx 配置指南

本文档面向 **Ubuntu 22.04 / Debian 12** 服务器（其他 Linux 发行版操作类似），
假设端口 **80 已被占用**，使用 **Let's Encrypt DNS-01 验证**获取免费证书（无需 80 端口），并配置自动续期。

---

## 目录

1. [架构概览](#1-架构概览)
2. [服务器初始环境准备](#2-服务器初始环境准备)
3. [申请 Let's Encrypt 证书（DNS-01，无需 80 端口）](#3-申请-lets-encrypt-证书dns-01无需-80-端口)
4. [配置 Nginx 反向代理](#4-配置-nginx-反向代理)
5. [配置项目环境变量](#5-配置项目环境变量)
6. [首次部署](#6-首次部署)
7. [防火墙配置](#7-防火墙配置)
8. [验证部署](#8-验证部署)
9. [配置证书自动续期](#9-配置证书自动续期)
10. [代码更新流程](#10-代码更新流程)
11. [常见问题排查](#11-常见问题排查)

---

## 1. 架构概览

```
用户浏览器
    │
    │ HTTPS (443)
    ▼
┌─────────────────────────────────┐
│  Nginx (宿主机)                  │
│  music.yourdomain.com:443       │
│   /api/*  ──▶  127.0.0.1:3001  │  ← Docker backend
│   /*      ──▶  127.0.0.1:3000  │  ← Docker frontend
└─────────────────────────────────┘
         │               │
   ┌─────┘         ┌─────┘
   ▼               ▼
backend:3001    frontend:3000
   │
   ▼
mysql:3306 (仅 Docker 网络内可达)
```

**端口分配**

| 用途 | 宿主机端口 | 说明 |
|------|-----------|------|
| HTTPS | 443 | 对外唯一入口，Nginx 处理 |
| HTTP | 80 | 已被占用，本项目不使用 |
| 前端 | 127.0.0.1:3000 | 仅本机内部访问 |
| 后端 | 127.0.0.1:3001 | 仅本机内部访问 |
| MySQL | 无（不暴露） | 仅 Docker 网络内部 |

---

## 2. 服务器初始环境准备

```bash
# 更新系统
sudo apt update && sudo apt upgrade -y

# 安装必要工具
sudo apt install -y git curl unzip ufw

# 安装 Docker
curl -fsSL https://get.docker.com | sh
sudo usermod -aG docker $USER
# 重新登录 SSH 使 docker 权限生效，或执行：
newgrp docker

# 安装 Docker Compose（已内置于 Docker 新版，确认版本）
docker compose version
# 若输出 v2.x 即正常

# 安装 Nginx
sudo apt install -y nginx

# 安装 Certbot
sudo apt install -y certbot
```

---

## 3. 申请 Let's Encrypt 证书（DNS-01，无需 80 端口）

> **为什么用 DNS-01？**
> 80 端口已被占用时，Let's Encrypt 的 HTTP-01 验证无法直接使用。
> DNS-01 验证通过在域名 DNS 中添加一条 TXT 记录来证明域名所有权，
> 完全不依赖 80 端口。

### 3.1 手动 DNS-01 申请（适用任何 DNS 提供商）

```bash
sudo certbot certonly \
  --manual \
  --preferred-challenges dns \
  --email admin@yourdomain.com \
  --agree-tos \
  --no-eff-email \
  -d music.yourdomain.com
```

命令执行后会提示：

```
Please deploy a DNS TXT record under the name:
_acme-challenge.music.yourdomain.com
with the following value:
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx

Press Enter to Continue
```

**操作步骤：**
1. 登录你的域名 DNS 控制台（阿里云、Cloudflare、腾讯云等）
2. 添加一条 TXT 记录：
   - 主机记录：`_acme-challenge.music`
   - 记录值：`xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx`
3. 等待 DNS 生效（通常 30 秒到 2 分钟，可用下面命令验证）：
   ```bash
   # 验证 DNS TXT 是否生效
   dig TXT _acme-challenge.music.yourdomain.com +short
   # 或
   nslookup -type=TXT _acme-challenge.music.yourdomain.com 8.8.8.8
   ```
4. 看到记录值出现后，回到终端按 **Enter**
5. 证书申请成功，文件位于：`/etc/letsencrypt/live/music.yourdomain.com/`

---

### 3.2 Cloudflare 自动 DNS-01（推荐，支持无人值守续期）

如果你的域名托管在 **Cloudflare**，可以自动化整个 DNS 验证过程：

```bash
# 安装 Cloudflare 插件
sudo apt install -y python3-certbot-dns-cloudflare

# 创建 Cloudflare API Token 配置文件
sudo mkdir -p /etc/letsencrypt
sudo nano /etc/letsencrypt/cloudflare.ini
```

文件内容（填入你在 Cloudflare 生成的 API Token）：

```ini
# Cloudflare API token（在 Cloudflare 控制台 → 我的个人资料 → API 令牌 → 创建令牌）
# 所需权限：Zone / DNS / Edit
dns_cloudflare_api_token = YOUR_CLOUDFLARE_API_TOKEN_HERE
```

```bash
# 锁定权限（重要！）
sudo chmod 600 /etc/letsencrypt/cloudflare.ini

# 申请证书
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  --email admin@yourdomain.com \
  --agree-tos \
  --no-eff-email \
  -d music.yourdomain.com
```

申请成功后，证书在 `/etc/letsencrypt/live/music.yourdomain.com/`，
后续续期**完全自动**，无需人工干预。

---

### 3.3 其他 DNS 提供商

| 提供商 | 插件包名 | 参考文档 |
|--------|---------|---------|
| 阿里云 / DNSPod | `certbot-dns-aliyun`（第三方） | https://github.com/tengattack/certbot-dns-aliyun |
| AWS Route53 | `python3-certbot-dns-route53` | certbot 官方插件 |
| Google Cloud DNS | `python3-certbot-dns-google` | certbot 官方插件 |
| 其他 | 手动 DNS-01（参考 3.1） | — |

---

## 4. 配置 Nginx 反向代理

### 4.1 复制配置文件

```bash
# 将项目中的 Nginx 配置复制到系统目录
sudo cp /path/to/MusicApp/nginx/musicapp.conf /etc/nginx/sites-available/musicapp

# 编辑配置，将所有 music.yourdomain.com 替换为真实域名
sudo nano /etc/nginx/sites-available/musicapp
# 或使用 sed 批量替换：
sudo sed -i 's/music\.yourdomain\.com/music.你的域名.com/g' /etc/nginx/sites-available/musicapp

# 启用配置
sudo ln -sf /etc/nginx/sites-available/musicapp /etc/nginx/sites-enabled/musicapp

# 检查配置语法
sudo nginx -t
```

输出应为：
```
nginx: the configuration file /etc/nginx/nginx.conf syntax is ok
nginx: configuration file /etc/nginx/nginx.conf test is successful
```

### 4.2 处理 80 端口（已被占用的情况）

由于你的 80 端口已被其他服务占用，有两种处理方案：

**方案 A：在现有 80 端口服务中添加 HTTP → HTTPS 跳转（推荐）**

找到负责 80 端口的 Nginx server 块（通常在 `/etc/nginx/sites-enabled/` 中），
在对应文件里追加：

```nginx
server {
    listen 80;
    server_name music.yourdomain.com;

    location / {
        return 301 https://music.yourdomain.com$request_uri;
    }
}
```

**方案 B：不配置 HTTP 跳转（用户直接访问 https://）**

直接跳过，用户输入 `https://music.yourdomain.com` 即可正常访问。

### 4.3 重载 Nginx

```bash
sudo systemctl reload nginx
```

---

## 5. 配置项目环境变量

在服务器上进入项目目录，创建 `.env` 文件：

```bash
cd /opt/MusicApp          # 或你克隆项目的路径
cp .env.example .env
nano .env
```

`.env` 关键配置：

```env
# MySQL
MYSQL_ROOT_PASSWORD=换成强密码_至少16位
MYSQL_PASSWORD=换成强密码_至少16位

# JWT（生产环境必须修改！用随机字符串）
JWT_SECRET=生成方式：openssl rand -base64 48

# 前端访问后端的地址 ← 设置为你的域名（带 https）
NEXT_PUBLIC_API_URL=https://music.yourdomain.com

# 后端允许的前端来源（CORS）
FRONTEND_URL=https://music.yourdomain.com

# Docker 容器内音乐文件挂载路径（固定为 /music，宿主机目录见 docker-compose.yml）
MUSIC_ROOT_PATH=/music

# 外站搜索（可选，自部署 NeteaseCloudMusicApi 后填写）
NETEASE_API_URL=
NETEASE_COOKIE=
```

> **生成随机 JWT_SECRET：**
> ```bash
> openssl rand -base64 48
> ```

---

## 6. 首次部署

```bash
cd /opt/MusicApp

# 1. 确认 .env 已配置好
cat .env

# 2. 构建并启动所有服务（约 5-10 分钟，取决于网速）
docker compose up -d --build

# 3. 查看启动状态
docker compose ps

# 4. 查看后端日志（含 Prisma 迁移输出）
docker compose logs backend --tail=50

# 5. 健康检查
curl http://127.0.0.1:3001/api/health
# 应返回：{"status":"ok","timestamp":"..."}
```

**期望的 `docker compose ps` 输出：**

```
NAME                 IMAGE                STATUS
musicapp_mysql       mysql:8.0            Up (healthy)
musicapp_backend     musicapp-backend     Up
musicapp_frontend    musicapp-frontend    Up
```

### 6.2 添加音乐文件

将音乐/视频文件放入宿主机的 `./backend/music/` 目录（即 docker-compose.yml 挂载源）：

```bash
# 在项目根目录下
mkdir -p backend/music

# 支持子目录作为专辑，例如：
#   backend/music/周杰伦/晴天.mp3      → 专辑：周杰伦
#   backend/music/流行精选/xxx.flac    → 专辑：流行精选
#   backend/music/单曲.mp3             → 无专辑
```

支持格式：`.mp3` `.flac` `.wav` `.ogg` `.m4a` `.aac` `.opus` `.wma` `.mp4` `.mkv` `.webm` `.avi` `.mov`

放入文件后，登录管理后台 → 歌曲管理 → 点击「扫描本地目录」完成入库。
扫描为**全量同步**：新增文件入库，已删除文件自动清理数据库记录。

### 6.3 首次注册管理员账号

打开浏览器访问 `https://music.yourdomain.com`，
点击「注册」，**第一个注册的账号自动成为 admin**。

---

## 7. 防火墙配置

```bash
# 查看当前状态
sudo ufw status

# 允许 SSH（确保先允许 SSH，否则会被锁在外面！）
sudo ufw allow ssh

# 允许 HTTPS
sudo ufw allow 443/tcp

# 如果你仍需要 HTTP（用于其他服务），保留开启
sudo ufw allow 80/tcp

# 拒绝直接访问 Docker 服务端口（Nginx 会代理）
# （Docker 已绑定到 127.0.0.1，UFW 对其无效，但明确规则更安全）

# 启用防火墙
sudo ufw enable

# 确认规则
sudo ufw status numbered
```

---

## 8. 验证部署

```bash
# 验证 HTTPS 证书
curl -I https://music.yourdomain.com
# 应看到 HTTP/2 200 和 strict-transport-security 头

# 验证 API 通过 Nginx 代理
curl https://music.yourdomain.com/api/health
# 应返回：{"status":"ok",...}

# 验证 SSL 评级（可选，需要在线访问）
# https://www.ssllabs.com/ssltest/analyze.html?d=music.yourdomain.com
```

---

## 9. 配置证书自动续期

### 9.1 手动触发续期测试

```bash
# 模拟续期（dry-run），不会真正更新证书
sudo certbot renew --dry-run

# 输出类似：
# Simulating renewal of an existing certificate for music.yourdomain.com
# Congratulations, all simulated renewals succeeded:
#   /etc/letsencrypt/live/music.yourdomain.com/fullchain.pem (success)
```

### 9.2 自动续期（Certbot 已自动配置）

Certbot 安装时会自动创建一个 **systemd timer**，每天检查证书是否需要续期
（Let's Encrypt 证书有效期 90 天，Certbot 在剩余 30 天时自动续期）：

```bash
# 查看 certbot 定时任务
sudo systemctl status certbot.timer
sudo systemctl list-timers certbot*
```

### 9.3 续期后自动重载 Nginx

默认情况下续期后 Nginx 不会自动重载新证书，需要配置 `deploy-hook`：

```bash
# 方式一：创建 deploy-hook 脚本（推荐）
sudo nano /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

脚本内容：

```bash
#!/bin/bash
systemctl reload nginx
echo "[$(date)] Nginx reloaded after cert renewal" >> /var/log/letsencrypt/nginx-reload.log
```

```bash
# 赋予执行权限
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh

# 验证 hook 是否正确（dry-run 时也会触发 hook）
sudo certbot renew --dry-run
# 日志末尾应出现 Running deploy-hook command: reload-nginx.sh
```

### 9.4 验证定时任务（可选）

```bash
# 查看下次自动续期时间
sudo systemctl list-timers certbot.timer

# 手动触发定时任务（用于测试）
sudo systemctl start certbot.service
sudo journalctl -u certbot.service -n 20
```

---

## 10. 代码更新流程

### 10.1 只更新配置（无代码变更）

```bash
cd /opt/MusicApp

# 修改 .env 后重启受影响的服务
docker compose up -d backend      # 仅重启后端
# 或
docker compose up -d frontend     # 仅重启前端
```

### 10.2 完整代码更新

```bash
cd /opt/MusicApp

# 1. 拉取最新代码
git pull origin main

# 2. 重新构建并启动（--build 强制重新构建镜像）
docker compose up -d --build

# ⚠️ 说明：
#   - MySQL 数据持久化在 docker volume，不会丢失
#   - backend 容器启动时自动执行 prisma migrate deploy
#   - 前端镜像会以 .env 中的 NEXT_PUBLIC_API_URL 重新构建

# 3. 查看更新日志
docker compose logs backend --tail=30
docker compose logs frontend --tail=20
```

### 10.3 仅更新后端（快速）

```bash
cd /opt/MusicApp

# 只重新构建并重启后端，不影响前端和数据库
docker compose up -d --build backend
docker compose logs backend -f
```

### 10.4 仅更新前端（快速）

```bash
cd /opt/MusicApp

# 前端重新构建时需要 NEXT_PUBLIC_API_URL 参数（构建阶段注入）
docker compose up -d --build frontend
```

### 10.5 数据库结构变更（Prisma Migrate）

如果改了 `prisma/schema.prisma`，需要手动执行迁移：

```bash
# 本地开发：生成迁移文件
cd backend
npx prisma migrate dev --name your_change_name

# 提交迁移文件到 Git
git add prisma/migrations
git commit -m "db: add your_change_name migration"
git push

# 服务器上：拉取并部署
cd /opt/MusicApp
git pull
docker compose up -d --build backend
# backend 容器启动时会自动执行 prisma migrate deploy
```

### 10.6 更新 Nginx 配置

```bash
# 编辑配置
sudo nano /etc/nginx/sites-available/musicapp

# 检查语法
sudo nginx -t

# 无缝重载（不中断现有连接）
sudo systemctl reload nginx
```

---

## 11. 常见问题排查

### Nginx 报 502 Bad Gateway

```bash
# 检查 Docker 服务是否运行
docker compose ps

# 检查端口是否监听
ss -tlnp | grep -E '3000|3001'
# 应看到 127.0.0.1:3000 和 127.0.0.1:3001

# 查看后端日志
docker compose logs backend --tail=50
```

### 证书续期失败

```bash
# 查看详细日志
sudo certbot renew --force-renewal 2>&1

# 手动重新申请
sudo certbot certonly \
  --dns-cloudflare \
  --dns-cloudflare-credentials /etc/letsencrypt/cloudflare.ini \
  -d music.yourdomain.com \
  --force-renewal
```

### 前端显示 API 连接失败

1. 检查 `.env` 中 `NEXT_PUBLIC_API_URL` 是否为 `https://music.yourdomain.com`
2. 前端是**构建时**注入环境变量，修改 `.env` 后必须重新构建：
   ```bash
   docker compose up -d --build frontend
   ```

### 音频/视频无法拖动进度

Nginx 的 `proxy_buffering off` 已在配置中设置，如仍有问题：
```bash
# 检查 Nginx 是否正确传递 Accept-Ranges 头
curl -I "https://music.yourdomain.com/api/stream/1?t=TOKEN" | grep -i range
# 应看到 Accept-Ranges: bytes
```

### sing-box / 其他代理工具与 Nginx 共存

如果服务器上已运行 sing-box 等代理工具并监听了 443 端口，需要协调端口分配：

**方案 A：sing-box 监听非标准端口，Nginx 继续使用 443**

修改 sing-box 配置，将入站端口改为如 `8443`，再用 Nginx 做 SNI 路由：

```nginx
# nginx.conf stream 块（四层代理，按域名分流）
stream {
    map $ssl_preread_server_name $backend {
        music.yourdomain.com  127.0.0.1:3000_internal;
        ~.                    127.0.0.1:8443;
    }
}
```

**方案 B：MusicApp 使用不同端口（如 8443）**

修改 `nginx/musicapp.conf` 中的 `listen 443 ssl` → `listen 8443 ssl`，
并将 `NEXT_PUBLIC_API_URL` 改为 `https://music.yourdomain.com:8443`。

**方案 C：域名已有证书则直接复用**

如果 sing-box 已为该域名申请了证书，修改 `nginx/musicapp.conf` 中的证书路径指向已有证书即可，无需重新申请。

### MySQL 数据库备份

```bash
# 备份
docker compose exec mysql mysqldump \
  -u root -p${MYSQL_ROOT_PASSWORD} musicapp > backup_$(date +%Y%m%d).sql

# 恢复
docker compose exec -T mysql mysql \
  -u root -p${MYSQL_ROOT_PASSWORD} musicapp < backup_20240301.sql
```

---

## 附：完整操作速查表

| 操作 | 命令 |
|------|------|
| 首次部署 | `docker compose up -d --build` |
| 查看运行状态 | `docker compose ps` |
| 查看实时日志 | `docker compose logs -f` |
| 代码更新后重部署 | `docker compose up -d --build` |
| 仅重启某个服务 | `docker compose restart backend` |
| 停止所有服务 | `docker compose down` |
| 停止并删除数据 | `docker compose down -v` ⚠️ 会删数据 |
| 检查证书有效期 | `sudo certbot certificates` |
| 手动续期测试 | `sudo certbot renew --dry-run` |
| 重载 Nginx | `sudo systemctl reload nginx` |
| 查看 Nginx 错误 | `sudo tail -f /var/log/nginx/musicapp_error.log` |
| 数据库备份 | `docker compose exec mysql mysqldump -uroot -p$PASS musicapp > bak.sql` |
