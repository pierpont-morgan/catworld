import { defineConfig } from "vite";

// Phaser 原型的开发/构建配置。游戏全是前端静态资源，无需后端。
export default defineConfig({
  server: {
    host: true, // 允许局域网内手机/其他设备访问，方便测试
    port: 5173,
  },
  build: {
    target: "es2022",
    sourcemap: true,
  },
});
