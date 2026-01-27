import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import svgr from "vite-plugin-svgr";

export default defineConfig({
  plugins: [react(), svgr()],
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler'
      }
    }
  },
  server: {
    watch: {
      usePolling: true,
    },
    proxy: {
      "/api": {
        target: "http://localhost:4000", // your backend
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, "/api"),
      },
      "/uploads": {
        target: "http://localhost:4000",
        changeOrigin: true,
      },
    },
  },
  assetsInclude: ["**/*.mp4"],
});
