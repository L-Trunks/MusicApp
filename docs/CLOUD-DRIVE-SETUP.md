# 云端网盘音源配置说明

MusicApp 支持从 **Google Drive** 和 **OneDrive** 列举并流式播放音频文件。需在后端 `.env` 中配置对应凭据，播放器「网盘」标签页即可使用。

---

## 一、Google Drive

参考：[Google Drive API - 关于 SDK](https://developers.google.com/drive/api/guides/about-sdk)、[files.get](https://developers.google.com/drive/api/reference/rest/v3/files/get)（`alt=media` 流式下载）

### 1. 创建项目并启用 Drive API

1. 打开 [Google Cloud Console](https://console.cloud.google.com/)
2. 新建项目或选择已有项目
3. 进入「API 和服务」→「库」→ 搜索 **Google Drive API** → 启用

### 2. 创建服务账号

1. 「API 和服务」→「凭据」→「创建凭据」→「服务账号」
2. 填写服务账号名称，完成创建
3. 进入该服务账号 →「密钥」→「添加密钥」→「创建新密钥」→ 选择 **JSON**，下载得到 `xxx.json`

### 3. 共享网盘文件夹给服务账号

- 在 Google Drive 中选中要作为「音乐库」的文件夹（或整个网盘）
- 右键 →「共享」→ 添加 **服务账号的客户端邮箱**（形如 `xxx@xxx.iam.gserviceaccount.com`）为**查看者**
- 复制该文件夹的 ID：在浏览器中打开该文件夹，URL 中 `folders/` 后面的那串即为 `GOOGLE_DRIVE_FOLDER_ID`（若用网盘根目录则可不填，后端默认用 `root`）

### 4. 配置 .env

将下载的 JSON 文件**整份内容**粘贴到一行（或使用单行 JSON），填入：

```env
GOOGLE_DRIVE_CREDENTIALS={"type":"service_account","project_id":"...",...}
GOOGLE_DRIVE_FOLDER_ID=   # 可选，不填则列举根目录
```

注意：JSON 内若有换行需去掉，保持为一行。

---

## 二、OneDrive (Microsoft Graph)

参考：[Download driveItem content](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content)、[Microsoft 标识平台 OAuth 2.0](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow)

### 1. 注册应用

1. 打开 [Azure 门户](https://portal.azure.com/) →「Microsoft Entra ID」→「应用注册」→「新注册」
2. 名称自拟，支持账户类型选「仅此组织」或「任何组织 + 个人」，重定向 URI 可先填 `http://localhost:3000`（仅用于获取 refresh_token 时回调）
3. 注册完成后记下 **应用程序(客户端) ID** 和「证书和密码」里创建的 **客户端密码」→ 对应 `ONEDRIVE_CLIENT_ID`、`ONEDRIVE_CLIENT_SECRET`

### 2. API 权限

1. 进入该应用 →「API 权限」→「添加权限」
2. 选择 **Microsoft Graph** → **委托的权限**
3. 勾选 `Files.Read` 或 `Files.Read.All`（至少需要读文件）
4. 保存并「代表组织授予管理员同意」（若需要）

### 3. 获取 Refresh Token

后端使用 **refresh_token** 在服务端换取 access_token，无需用户每次登录。获取方式之一：

- 使用 OAuth 2.0 授权码流程：让用户访问授权 URL 登录并同意权限，回调中会得到 `code`，再用 `code` 换取 `refresh_token`。
- 或使用 [Microsoft 官方 OAuth 示例 / Postman 等](https://learn.microsoft.com/en-us/entra/identity-platform/v2-oauth2-auth-code-flow) 完成一次「登录 → 用 code 换 token」，从返回的 JSON 中复制 `refresh_token`。

将得到的 **refresh_token** 填入 `.env`：

```env
ONEDRIVE_CLIENT_ID=你的应用(客户端) ID
ONEDRIVE_CLIENT_SECRET=你的客户端密码
ONEDRIVE_REFRESH_TOKEN=上面获取的 refresh_token
```

### 4. 说明

- 当前实现使用 **个人 OneDrive**（`/me/drive`）。若需访问 SharePoint 或团队网盘，需改用相应 [Graph 路径](https://learn.microsoft.com/en-us/graph/api/driveitem-get-content) 并可能需申请应用权限。
- Refresh token 长期有效但可能因策略或用户修改密码失效，届时需重新走授权流程获取新 token。

---

## 三、.env 示例汇总

```env
# Google Drive（可选）
GOOGLE_DRIVE_CREDENTIALS={"type":"service_account",...}
GOOGLE_DRIVE_FOLDER_ID=

# OneDrive（可选）
ONEDRIVE_CLIENT_ID=
ONEDRIVE_CLIENT_SECRET=
ONEDRIVE_REFRESH_TOKEN=
```

配置完成后重启后端，在播放器「网盘」标签页选择 Google Drive 或 OneDrive 并点击「刷新」即可列举音频文件，点击曲目即可流式播放。
