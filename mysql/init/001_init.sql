-- MusicApp 数据库初始化脚本
-- 此脚本在 MySQL 容器首次启动时自动执行（仅当数据库为空时）
-- Prisma 的正式迁移会在 backend 启动时通过 `prisma migrate deploy` 执行

-- 确保使用正确的数据库（docker-compose 中已由环境变量 MYSQL_DATABASE 创建）
USE musicapp;

-- 设置字符集
ALTER DATABASE musicapp CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- 占位标记，实际表结构由 Prisma migrate 管理
-- 你可以在这里添加初始化数据（如默认配置等）
