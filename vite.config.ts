import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type ProxyOptions } from 'vite'

function hiveProxy(target: string, token: string): Record<string, string | ProxyOptions> | undefined {
  if (!target) return undefined

  return {
    '/api': {
      target: target.replace(/\/$/, ''),
      changeOrigin: true,
      rewrite: (path) => path.replace(/^\/api/, ''),
      configure(proxy) {
        proxy.on('proxyReq', (proxyRequest) => {
          if (token) proxyRequest.setHeader('Authorization', `Bearer ${token}`)
        })
      },
    },
  }
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const proxy = hiveProxy(env.HIVE_API_BASE_URL ?? '', env.HIVE_ADMIN_TOKEN ?? '')

  return {
    plugins: [react(), tailwindcss()],
    server: { proxy },
    preview: { proxy },
  }
})
