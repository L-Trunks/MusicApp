// 运行时环境变量（在 Next.js 中 NEXT_PUBLIC_ 前缀的变量会被内联到客户端）
export const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3001';
