# MusicApp 从零部署指南（全新服务器）

适用于**尚未安装 Git、Nginx、Docker 等**的裸机服务器，按顺序执行即可完成部署。

**本文以域名 music.chrisers.cc（主域名 chrisers.cc）为例**，若你使用其他域名，将下文中的 `music.chrisers.cc` 替换为你的子域名即可。

**推荐系统**：Ubuntu 22.04 LTS 或 Debian 12（其他发行版可参考命令自行替换包管理器）。

**前置条件**：
- 一台可 SSH 登录的服务器（root 或具备 sudo 权限）
- 主域名 **chrisers.cc** 已购买并在服务商处管理 DNS
- 将子域名 **music.chrisers.cc** 通过 A 记录解析到该服务器公网 IP（见第 7.1 节）

---

## 目录

- [MusicApp 从零部署指南（全新服务器）](#musicapp-从零部署指南全新服务器)
  - [目录](#目录)
  - [1. 连接服务器并更新系统](#1-连接服务器并更新系统)
  - [2. 安装 Git](#2-安装-git)
  - [3. 安装 Docker 与 Docker Compose](#3-安装-docker-与-docker-compose)
  - [4. 安装 Nginx](#4-安装-nginx)
  - [5. 安装 Certbot（Let's Encrypt）](#5-安装-certbotlets-encrypt)
  - [6. 获取项目代码](#6-获取项目代码)
    - [方式 A：Git 克隆（推荐，便于后续更新）](#方式-agit-克隆推荐便于后续更新)
    - [方式 B：本地上传压缩包](#方式-b本地上传压缩包)
  - [7. 配置域名与 SSL 证书](#7-配置域名与-ssl-证书)
    - [7.1 域名解析（以 music.chrisers.cc 为例）](#71-域名解析以-musicchriserscc-为例)
    - [7.2 申请 Let's Encrypt 证书（HTTP-01，80 端口空闲时用）](#72-申请-lets-encrypt-证书http-0180-端口空闲时用)
  - [8. 配置项目环境变量](#8-配置项目环境变量)
  - [9. 配置 Nginx 反向代理](#9-配置-nginx-反向代理)
  - [10. 启动应用（Docker Compose）](#10-启动应用docker-compose)
  - [11. 防火墙与安全](#11-防火墙与安全)
  - [12. 验证与首次使用](#12-验证与首次使用)
  - [13. 后续：代码更新与维护](#13-后续代码更新与维护)
    - [代码更新（Git 方式）](#代码更新git-方式)
    - [仅改 .env 后重启](#仅改-env-后重启)
    - [证书自动续期](#证书自动续期)
    - [常用命令速查](#常用命令速查)
  - [故障排查简要](#故障排查简要)

---

## 1. 连接服务器并更新系统

```bash
# 使用 SSH 登录（将 root 和 IP 换成你的）
ssh root@你的服务器IP

# 更新软件源并升级
sudo apt update && sudo apt upgrade -y

# 安装常用工具
sudo apt install -y curl wget unzip ufw
```

---

## 2. 安装 Git

```bash
sudo apt install -y git

git --version
# 应输出 git version 2.x.x
```

---

## 3. 安装 Docker 与 Docker Compose

```bash
# 使用官方脚本安装 Docker
curl -fsSL https://get.docker.com | sh

# 将当前用户加入 docker 组（避免每次 sudo）
sudo usermod -aG docker $USER

# 重新登录 SSH 后生效；若不退出，可先执行：
newgrp docker

# 确认 Docker 与 Compose 版本
docker --version
docker compose version
# Compose 应显示 v2.x
```

---

## 4. 安装 Nginx

```bash
sudo apt install -y nginx

# 先不要启动或启用默认站点的 80 占用，后面会配置我们自己的站点
sudo systemctl enable nginx
sudo systemctl start nginx
```

---

## 5. 安装 Certbot（Let's Encrypt）

```bash
sudo apt install -y certbot

# 若使用 Cloudflare 解析，可安装 DNS 插件（可选，见第 7 步）
# sudo apt install -y python3-certbot-dns-cloudflare
```

---

## 6. 获取项目代码

任选一种方式将 MusicApp 放到服务器上。

### 方式 A：Git 克隆（推荐，便于后续更新）

```bash
# 在计划放置项目的目录执行，例如 /opt
sudo mkdir -p /opt
cd /opt

# 若项目在 GitHub/Gitee 等
sudo git clone https://github.com/你的用户名/MusicApp.git
cd MusicApp

# 若为私有仓库，需先配置 SSH key 或使用 HTTPS + 凭据
```

### 方式 B：本地上传压缩包

在**本地**项目目录打包（不包含 node_modules、.next 等）：

```bash
# 本地执行（Windows 可用 7-Zip 等打 zip）
cd E:\Projects\MusicApp
tar --exclude=node_modules --exclude=frontend/node_modules --exclude=frontend/.next --exclude=backend/music --exclude=.git -czvf musicapp.tar.gz .
```

上传到服务器后：

```bash
# 服务器上
sudo mkdir -p /opt/MusicApp
cd /opt/MusicApp
sudo tar -xzvf /path/to/musicapp.tar.gz
```

---

## 7. 配置域名与 SSL 证书

### 7.1 域名解析（以 music.chrisers.cc 为例）

主域为 **chrisers.cc** 时，需要为子域名 **music** 添加一条 **A 记录**，使 `music.chrisers.cc` 指向服务器公网 IP。

在域名服务商（Cloudflare、阿里云、腾讯云、GoDaddy 等）的 DNS 管理页面添加：

| 类型 | 主机记录 / 名称 | 记录值 | TTL |
|------|-----------------|--------|-----|
| A    | **music**       | **你的服务器公网 IP**（如 `123.45.67.89`） | 600 或默认 |

- **主机记录**填 **music**（不要填 `music.chrisers.cc`，多数面板会自动补主域）。
- **记录值**填服务器公网 IP（仅 IPv4 即可）。
- 保存后等待 1–5 分钟生效。

**在服务器上验证解析**：

```bash
ping music.chrisers.cc
# 应显示本机公网 IP；若解析不到，稍等或检查 DNS 是否保存成功
```

### 7.2 申请 Let's Encrypt 证书（HTTP-01，80 端口空闲时用）

因当前服务器 80 端口空闲，可直接用 HTTP-01 验证，无需 DNS 插件。

```bash
# 先确保 Nginx 未占用 80，或临时停掉默认站点
sudo rm -f /etc/nginx/sites-enabled/default
sudo nginx -t && sudo systemctl reload nginx

# 申请证书（以 music.chrisers.cc 为例，邮箱可改为你的）
sudo certbot certonly --standalone \
  --email admin@chrisers.cc \
  --agree-tos \
  --no-eff-email \
  -d music.chrisers.cc
```

按提示完成即可，证书路径为：  
`/etc/letsencrypt/live/music.chrisers.cc/`

**若使用其他域名**：将 `admin@chrisers.cc` 和 `music.chrisers.cc` 换成你的邮箱与子域名。

**若 80 端口已被占用**，请改用 DNS-01 方式，参见 [DEPLOY.md 第 3 节](./DEPLOY.md#3-申请-lets-encrypt-证书dns-01无需-80-端口)。

---

## 8. 配置项目环境变量

```bash
cd /opt/MusicApp

cp .env.example .env
nano .env
```

**必改项**（以 music.chrisers.cc 为例；若用其他域名请替换）：

```env
# MySQL（生产环境务必使用强密码）
MYSQL_ROOT_PASSWORD=请填写至少16位强密码
MYSQL_PASSWORD=请填写至少16位强密码

# JWT 密钥（openssl rand -base64 48 生成）
JWT_SECRET=请用下面命令生成并粘贴

# 前端访问后端的地址（必须为 https，与域名一致）
NEXT_PUBLIC_API_URL=https://music.chrisers.cc

# 后端 CORS 允许的前端来源
FRONTEND_URL=https://music.chrisers.cc

# 容器内音乐目录（与 docker-compose 挂载一致，无需改）
MUSIC_ROOT_PATH=/music

# 外站搜索（可选）
NETEASE_API_URL=
NETEASE_COOKIE=
```

生成 JWT_SECRET：

```bash
openssl rand -base64 48
# 将输出粘贴到 .env 的 JWT_SECRET=
```

保存退出（nano：`Ctrl+O` 回车，`Ctrl+X`）。

---

## 9. 配置 Nginx 反向代理

```bash
# 复制项目内的 Nginx 配置到系统目录
sudo cp /opt/MusicApp/nginx/musicapp.conf /etc/nginx/sites-available/musicapp

# 将配置中的占位域名替换为 music.chrisers.cc
sudo sed -i 's/music\.yourdomain\.com/music.chrisers.cc/g' /etc/nginx/sites-available/musicapp

# 若使用其他域名，把上面 sed 中的 music.chrisers.cc 改成你的域名即可；或手动编辑：
# sudo nano /etc/nginx/sites-available/musicapp
# 确认 server_name、ssl_certificate、ssl_certificate_key 等路径中的域名为 music.chrisers.cc

# 启用站点（并确保没有默认站点占用 80）
sudo ln -sf /etc/nginx/sites-available/musicapp /etc/nginx/sites-enabled/
sudo rm -f /etc/nginx/sites-enabled/default

# 测试配置
sudo nginx -t
# 应显示 syntax is ok 和 test is successful

# 重载 Nginx（此时 Docker 未启动会 502，属正常，下一步再启动 Docker）
sudo systemctl reload nginx
```

**如需 HTTP 自动跳 HTTPS**（推荐）：  
在 `/etc/nginx/sites-available/musicapp` 中取消「HTTP → HTTPS 跳转」那一块 `server { listen 80; ... }` 的注释（其中 `server_name` 已为 `music.chrisers.cc`），再次 `sudo nginx -t` 后 `sudo systemctl reload nginx`。

---

## 10. 启动应用（Docker Compose）

```bash
cd /opt/MusicApp

# 构建并启动所有服务（首次约 5–10 分钟）
docker compose up -d --build

# 查看状态
docker compose ps
# 应看到 mysql、backend、frontend 均为 Up

# 查看后端日志（确认无报错、Prisma 迁移成功）
docker compose logs backend --tail=80
```

**可选：准备音乐文件**

```bash
mkdir -p /opt/MusicApp/backend/music
# 将音视频文件放入 backend/music（可按子目录作为专辑）
# 部署完成后在管理后台「扫描本地目录」入库
```
1. 上传整个本地目录（推荐）
假设你本地的音乐目录是 E:\MusicFiles：
```bash 
scp -P 22 -r "E:\MusicFiles" root@142.171.229.218:/opt/MusicApp/backend/music/
```
-r：递归上传整个目录
远程结果：会变成 /opt/MusicApp/backend/music/MusicFiles/...
如果你想把目录里的内容直接平铺到 music/ 下面，可以在 PowerShell 里用：
```bash
scp -P 22 -r "E:\MusicFiles\*" root@142.171.229.218:/opt/MusicApp/backend/music/
```
2. 上传单个文件
```bash
scp -P 22 "E:\MusicFiles\song1.mp3" root@142.171.229.218:/opt/MusicApp/backend/music/
```
> 注意：scp 命令里不要写 http://，只用纯 IP：142.171.229.218。
> 登录用户名如果不是 root，就把上面的 root@ 换成你的实际用户名。

---

## 11. 防火墙与安全

```bash
# 务必先放行 SSH，再启用防火墙
sudo ufw allow ssh
sudo ufw allow 80/tcp
sudo ufw allow 443/tcp
sudo ufw enable

# 查看规则
sudo ufw status numbered
```

---

## 12. 验证与首次使用

```bash
# 本机检查 API
curl -s http://127.0.0.1:3001/api/health
# 应返回 {"status":"ok",...}

# 通过域名检查（HTTPS）
curl -sI https://music.chrisers.cc
# 应返回 200 或 301/302
```

在浏览器打开：**https://music.chrisers.cc**  
→ 注册第一个账号（自动成为管理员）→ 进入管理后台可扫描本地目录、上传歌曲等。

---

## 13. 后续：代码更新与维护

### 代码更新（Git 方式）

```bash
cd /opt/MusicApp
git pull origin main
docker compose up -d --build
```

### 仅改 .env 后重启

```bash
docker compose up -d backend   # 或 frontend
```

### 证书自动续期

Certbot 会安装 systemd timer，自动续期。续期后需重载 Nginx：

```bash
sudo nano /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
```

写入：

```bash
#!/bin/bash
systemctl reload nginx
```

```bash
sudo chmod +x /etc/letsencrypt/renewal-hooks/deploy/reload-nginx.sh
sudo certbot renew --dry-run   # 测试
```

### 常用命令速查

| 操作           | 命令 |
|----------------|------|
| 查看容器状态   | `docker compose ps` |
| 查看日志       | `docker compose logs -f` |
| 重启所有服务   | `docker compose restart` |
| 停止并删除容器 | `docker compose down` |
| 重载 Nginx     | `sudo systemctl reload nginx` |

---

## 故障排查简要

- **502 Bad Gateway**：先 `docker compose ps` 确认三个服务均为 Up；再 `docker compose logs backend --tail=50` 看后端是否报错。
- **前端能开但接口报错**：检查 `.env` 中 `NEXT_PUBLIC_API_URL` 是否为 `https://music.chrisers.cc`，修改后执行 `docker compose up -d --build frontend`。
- **证书问题**：`sudo certbot certificates` 查看证书；续期失败可看 `sudo certbot renew --force-renewal 2>&1`。

更详细说明见 [DEPLOY.md](./DEPLOY.md)。
