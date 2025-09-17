import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    port: 3001,
    host: true,
    allowedHosts: ['98f47a5be1c9f6c953b91ad07961dcee.serveo.net', '.serveo.net', 'novel-ai-frontend.loca.lt', '.loca.lt']
  },
  build: {
    // Enable source maps for debugging (disable in production if needed)
    sourcemap: false,
    // Optimize build output
    minify: 'terser',
    // Remove console logs in production
    terserOptions: {
      compress: {
        drop_console: true,
        drop_debugger: true
      }
    },
    // Generate build report
    reportCompressedSize: true,
    // Chunk size warning limit
    chunkSizeWarningLimit: 1000
  },
  define: {
    // Security: disable development features in production
    __DEV__: false,
    // Fix for react-highlight-within-textarea/draft-js global dependency
    global: 'globalThis',
  },
  // Environment variables prefix for security
  envPrefix: ['VITE_'],
  // Production optimizations
  esbuild: {
    // Remove console and debugger in production
    pure: ['console.log', 'console.warn', 'console.error', 'debugger']
  }
})
