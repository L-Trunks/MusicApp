# MusicApp

个人 + 小规模多人使用的在线音乐 & 视频播放器，支持 PWA（可添加到手机桌面）、锁屏后台播放、歌单管理、专辑分类、好友权限等特性，UI 风格参考主流音乐播放器，炫酷黑色主题。

---

## 功能一览

| 类别 | 功能 |
|------|------|
| 账户 | 注册/登录（JWT）、admin/普通角色 |
| 播放 | 音频 & 视频双轨、HTTP Range 拖动进度、倍速（视频）、音量控制 |
| 歌单 | 创建/删除歌单、歌曲多选批量加入、顺序 / 随机 / 单曲循环 |
| 专辑 | 子目录自动识别为专辑，侧边栏专辑筛选 |
| 权限 | `public / friends / private` 三级可见性控制 |
| 好友 | 单向好友关系，好友可听 `friends` 权限歌曲 |
| 评论 | 歌曲详情页发表/查看评论 |
| 上传 | 管理员拖拽/点选上传音视频文件（≤500 MB） |
| 外站搜索 | 对接 NeteaseCloudMusicApi，搜索并直接播放外站曲目 |
| URL 播放 | 直接播放任意音频/视频 URL，支持手动指定类型 + HEAD 探测 |
| **播放状态恢复** | 按账号保存当前歌单与播放进度，下次进入自动回显 |
| **云端网盘** | 从 Google Drive / OneDrive 列举并流式播放音频（需配置凭据） |
| **本地缓存** | 音频流边听边存，LRU 淘汰（最多约 100 首），下次直接走缓存 |
| 管理后台 | 用户管理、歌曲增删改查、**批量修改可见性**、**批量删除**（可选同时删文件）、目录扫描（全量同步） |
| PWA | 添加到桌面、锁屏媒体控制（Media Session API） |

---

## 目录结构

```
MusicApp/
├── backend/                  # Node.js + TypeScript + Express + Prisma
│   ├── src/
│   │   ├── routes/           # API 路由
│   │   ├── middleware/        # JWT 鉴权中间件
│   │   └── lib/              # Prisma 客户端
│   ├── prisma/
│   │   ├── schema.prisma     # 数据模型定义
│   │   └── migrations/       # 迁移文件（版本控制）
│   ├── music/                # 本地音乐/视频文件目录（开发时）
│   └── Dockerfile
├── frontend/                 # Next.js 14 + Tailwind CSS + PWA
│   ├── app/
│   │   ├── components/       # React 组件
│   │   └── lib/              # API 客户端 & 类型定义
│   ├── public/               # 静态资源（manifest.json、sw.js、icons）
│   └── Dockerfile
├── mysql/
│   └── init/001_init.sql     # MySQL 首次初始化 SQL
├── nginx/
│   └── musicapp.conf         # Nginx 反向代理配置（生产环境）
├── docker-compose.yml
├── .env.example              # 环境变量模板
├── DEPLOY.md                 # 服务器部署 & Nginx 配置详细指南
├── DEPLOY-FROM-SCRATCH.md    # 从零部署（无 Git/Nginx/Docker 时按此文档操作）
└── README.md
```

---

## 快速开始（Docker 部署）

### 前置要求

- Docker + Docker Compose（v2.x）
- 宿主机上的音乐/视频文件放在 `./backend/music/` 目录（可按专辑建子目录）

### 步骤

**1. 复制并编辑环境变量**

```bash
cp .env.example .env
```

编辑 `.env`，**至少修改以下项**：

```env
# 如果部署到公网服务器或局域网 NAS，改为实际 IP/域名
NEXT_PUBLIC_API_URL=http://你的服务器IP:3001

# 生产环境请换成随机长字符串（openssl rand -base64 48）
JWT_SECRET=your-long-random-secret-here

# MySQL 密码（生产环境必须修改）
MYSQL_ROOT_PASSWORD=强密码
MYSQL_PASSWORD=强密码
```

**2. （可选）准备 PWA 图标**

```bash
cd frontend
npm install sharp
node generate-icons.js
```

> 不执行此步骤也可运行，图标会显示为占位图。

**3. 一键启动**

```bash
docker compose up -d --build
```

首次启动约需 3–5 分钟（拉取镜像 + 编译）。

**4. 验证运行状态**

```bash
docker compose ps
# 查看后端日志（含 Prisma migrate 输出）
docker compose logs backend --tail=50
```

**5. 访问应用**

| 服务     | 地址                            |
|----------|---------------------------------|
| 前端     | http://localhost:3000           |
| 后端 API | http://localhost:3001/api/health |

**6. 注册第一个账号**

打开前端，注册第一个账号 → 自动成为 **admin**，可访问管理后台。

---

## 本地非 Docker 开发

### 前置要求

- Node.js 18+
- MySQL 8.x（本地或 Docker 单独启动）

### 后端

```bash
cd backend

# 1. 安装依赖
npm install

# 2. 配置环境变量
cp .env.example .env
# 编辑 .env，填写本地 MySQL 连接串、JWT_SECRET 等
# MUSIC_ROOT_PATH=./music   ← 相对于 backend/ 目录

# 3. 执行数据库迁移
npx prisma migrate deploy

# 4. 启动开发服务器（热重载）
npm run dev
```

### 前端

```bash
cd frontend

# 1. 安装依赖
npm install

# 2. 配置环境变量
# NEXT_PUBLIC_API_URL=http://localhost:3001（写入 .env.local）
echo "NEXT_PUBLIC_API_URL=http://localhost:3001" > .env.local

# 3. 启动开发服务器
npm run dev
```

访问 http://localhost:3000

---

## 添加音乐 / 视频

### 方式一：扫描本地目录（推荐）

1. 将文件放入 `./backend/music/` 目录：
   - 支持格式：`.mp3` `.flac` `.wav` `.ogg` `.m4a` `.aac` `.opus` `.wma` `.mp4` `.mkv` `.webm` `.avi` `.mov`
   - **子目录自动识别为专辑**，例如 `music/周杰伦/晴天.mp3` → 专辑为「周杰伦」
2. 登录管理员账号 → 管理后台 → 歌曲管理 → 点击「扫描本地目录」
3. 扫描为**全量同步**：新增文件创建记录，已删除文件自动清理数据库记录
4. 扫描完成后歌曲默认为 `private` 权限，在列表中**批量选择后一键改为 `public`**

### 方式二：文件上传（管理员专属）

管理后台 → 上传文件，支持拖拽或点选，最大 500 MB 单文件。

### 方式三：手动填写 URL

管理后台 → 歌曲管理 → 新增歌曲，`sourcePath` 填入 `http(s)://` URL，播放时直接跳转该地址。

### 方式四：客户端直接粘贴 URL 播放

在播放器 → URL 播放标签页，粘贴音视频链接后点击播放。支持：
- 自动识别（通过 URL 路径扩展名或 HEAD 请求探测 Content-Type）
- 手动指定音频/视频类型（点击「音频」/「视频」按钮）
- 点击「探测类型」强制发送 HEAD 请求确认 Content-Type

---

## 歌单管理

- **默认歌单「全部歌曲」**：展示所有有权限访问的歌曲
- 点击侧边栏 `+` 创建自定义歌单
- 在歌曲列表中勾选多首歌曲 → 点击工具栏「加入歌单」
- 支持播放模式：顺序播放 / 随机播放 / 单曲循环

---

## 管理后台批量操作

在「歌曲管理」标签页，表格左侧有勾选框：

- **全选 / 取消**：点击表头勾选框
- **批量修改可见性**：选中歌曲后，从下拉框选择目标权限（public / friends / private）→ 点击「批量修改可见性」
- **批量删除记录**：仅删除数据库记录，保留磁盘文件
- **批量删除+文件**：同时删除数据库记录和磁盘上的物理文件（不可恢复，操作前会弹出确认）

---

## 权限说明

| 权限值    | 可见范围                                              |
|-----------|-------------------------------------------------------|
| `public`  | 所有已登录用户                                        |
| `friends` | 歌曲 owner 将对方加入好友后，对方可见/可播放          |
| `private` | 仅歌曲 owner 本人 + 任意 admin 用户                   |

> 权限校验在**服务端**执行，前端隐藏不可替代服务端校验。

---

## 好友管理

登录管理员账号 → 管理后台 → 好友管理：

- 输入用户名添加好友（单向关系）
- 移除好友后，对方立即无法访问 `friends` 权限的歌曲

---

## 外站音乐搜索

需要在 `.env` 中配置 `NETEASE_API_URL`（自行部署 [NeteaseCloudMusicApi](https://github.com/Binaryify/NeteaseCloudMusicApi) 或使用公共实例）。

```env
NETEASE_API_URL=https://你的netease-api地址
NETEASE_COOKIE=   # 可选，登录 Cookie 可提高搜索质量
```

配置后，播放器「外站搜索」标签页即可搜索网易云曲目并直接播放。

---

## PWA 安装（手机端）

### Android（Chrome / Edge）

1. 用浏览器打开 `http://你的服务器IP:3000`
2. 点右上角菜单 → 「添加到主屏幕」
3. 之后从桌面图标打开，以独立窗口运行
4. 播放音乐后，锁屏通知栏可显示歌名、控制上一首/下一首/暂停

### iOS（Safari）

1. Safari 打开页面
2. 点底部分享按钮 → 「添加到主屏幕」

---

## API 接口一览

### 认证

| 方法 | 路径                | 描述                           |
|------|---------------------|--------------------------------|
| POST | `/api/auth/register`| 注册（首个自动成 admin）        |
| POST | `/api/auth/login`   | 登录，返回 JWT                 |
| GET  | `/api/auth/me`      | 获取当前用户信息               |

### 歌曲

| 方法 | 路径              | 描述                        |
|------|-------------------|-----------------------------|
| GET  | `/api/songs`      | 列表（支持 `?q=` 搜索）     |
| GET  | `/api/songs/:id`  | 单曲详情                    |
| GET  | `/api/stream/:id` | 媒体流（支持 Range 请求）   |

### 播放状态（按用户恢复）

| 方法 | 路径                       | 描述                     |
|------|----------------------------|--------------------------|
| GET  | `/api/me/playback-state`   | 获取当前用户播放状态     |
| PUT  | `/api/me/playback-state`   | 保存歌单、进度、模式等   |

### 云端网盘（可选，需配置凭据）

| 方法 | 路径                                | 描述                     |
|------|-------------------------------------|--------------------------|
| GET  | `/api/cloud/gdrive/list`            | 列举 Google Drive 音频   |
| GET  | `/api/cloud/gdrive/stream/:fileId`  | 流式播放 GDrive 文件     |
| GET  | `/api/cloud/onedrive/list`         | 列举 OneDrive 音频       |
| GET  | `/api/cloud/onedrive/stream/:itemId`| 流式播放 OneDrive 文件   |

### 评论

| 方法 | 路径                        | 描述         |
|------|-----------------------------|--------------|
| GET  | `/api/songs/:id/comments`   | 获取评论列表 |
| POST | `/api/songs/:id/comments`   | 发布评论     |

### 好友

| 方法   | 路径                       | 描述       |
|--------|----------------------------|------------|
| GET    | `/api/me/friends`          | 好友列表   |
| POST   | `/api/me/friends`          | 添加好友   |
| DELETE | `/api/me/friends/:friendId`| 移除好友   |

### 歌单

| 方法   | 路径                              | 描述                    |
|--------|-----------------------------------|-------------------------|
| GET    | `/api/playlists`                  | 我的歌单列表            |
| POST   | `/api/playlists`                  | 创建歌单                |
| DELETE | `/api/playlists/:id`              | 删除歌单                |
| POST   | `/api/playlists/:id/songs`        | 添加歌曲到歌单          |
| DELETE | `/api/playlists/:id/songs/:songId`| 从歌单移除歌曲          |

### 搜索 & 上传

| 方法 | 路径                  | 描述                         |
|------|-----------------------|------------------------------|
| GET  | `/api/search`         | 外站音乐搜索（需配置 Netease API） |
| POST | `/api/upload`         | 上传音视频文件（admin 专属）  |

### 管理后台（需 admin）

| 方法   | 路径                          | 描述                                  |
|--------|-------------------------------|---------------------------------------|
| GET    | `/api/admin/users`            | 用户列表                              |
| PATCH  | `/api/admin/users/:id`        | 修改用户角色                          |
| GET    | `/api/admin/songs`            | 所有歌曲（含路径）                    |
| POST   | `/api/admin/songs`            | 新增歌曲记录                          |
| PUT    | `/api/admin/songs/:id`        | 编辑歌曲                              |
| DELETE | `/api/admin/songs/:id`        | 删除歌曲（`?deleteFile=true` 同时删文件） |
| PATCH  | `/api/admin/songs/batch`      | **批量修改可见性**                    |
| DELETE | `/api/admin/songs/batch`      | **批量删除**（body: `{ids, deleteFiles}`） |
| POST   | `/api/admin/songs/scan-local` | 扫描本地目录（全量同步）              |

---

## 数据库结构更新（Prisma Migrate 工作流）

```bash
cd backend

# 1. 修改 prisma/schema.prisma

# 2. 开发环境生成迁移（会自动应用到本地数据库）
npx prisma migrate dev --name your_migration_name

# 3. 提交 prisma/migrations/ 目录到版本控制

# 4. 生产/Docker 环境部署
npx prisma migrate deploy
# Docker 中 backend 容器启动时自动执行此命令
```

---

## 常见问题

**Q: Docker 启动后 backend 报「无法连接数据库」**

MySQL 健康检查失败可能需要更长时间，等待 30s 后重启 backend：

```bash
docker compose restart backend
```

**Q: 扫描后看不到文件**

1. 检查文件是否放在 `./backend/music/` 目录（本地开发）或 Docker 挂载的 `./backend/music:/music`（Docker 部署）
2. 后台日志确认 `MUSIC_ROOT_PATH` 的值
3. 确认文件扩展名为支持的格式（`.mp3 .flac .wav .ogg .m4a .aac .opus .wma .mp4 .mkv .webm .avi .mov`）

**Q: 音视频播放提示「文件不存在」**

确认 `docker-compose.yml` 中挂载路径：

```yaml
volumes:
  - ./backend/music:/music
```

后台歌曲 `sourcePath` 应为相对于 `./backend/music/` 的路径。

**Q: 手机端无法播放（提示 CORS 或网络错误）**

确保 `.env` 中 `NEXT_PUBLIC_API_URL` 设置为局域网/公网可访问的 IP，而非 `localhost`。

**Q: URL 链接没有扩展名，播放类型判断错误**

在播放器「URL 播放」页面点击「探测类型」按钮，系统会发送 HEAD 请求读取 `Content-Type`，
或手动点击「音频」/「视频」按钮强制指定类型。

**Q: 如何修改数据库密码**

1. 修改 `.env` 中的 `MYSQL_PASSWORD`
2. 删除 MySQL 数据卷（会丢失所有数据）：`docker compose down -v`
3. 重新启动：`docker compose up -d --build`

**Q: 云端网盘（Google Drive / OneDrive）如何配置**

参见 [云端网盘配置说明](./docs/CLOUD-DRIVE-SETUP.md)。需在 `.env` 中配置对应凭据后，播放器「网盘」标签页即可列举并播放云端音频。

---

## 技术栈

| 层次   | 技术                                                        |
|--------|-------------------------------------------------------------|
| 后端   | Node.js 20 + TypeScript + Express + Prisma ORM + multer    |
| 数据库 | MySQL 8.0                                                   |
| 前端   | Next.js 14 + React 18 + Tailwind CSS + PWA                 |
| 鉴权   | JWT（30 天有效期）                                          |
| 部署   | Docker Compose（一键启动）+ Nginx 反向代理（生产环境）      |

> 服务器部署：**全新服务器**（未装 Git/Nginx/Docker）请按 [DEPLOY-FROM-SCRATCH.md](./DEPLOY-FROM-SCRATCH.md) 从零操作；已有环境或需 80 端口占用、DNS-01 证书等详见 [DEPLOY.md](./DEPLOY.md)。
