import type { Config } from '@react-router/dev/config'
import { vercelPreset } from '@vercel/react-router/vite'

export default {
  ssr: true,
  appDirectory: 'src',
  allowedActionOrigins: ['pitchy-marylouise-dependably.ngrok-free.dev'],
  presets: [vercelPreset()],
} satisfies Config
