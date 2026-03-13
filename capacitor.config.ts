import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.irontracks.app',
  appName: 'IronTracks',
  // Next.js `output: 'export'` generates static files in `out/`, not `public/`.
  // When server.url is set (via CAPACITOR_SERVER_URL or production fallback),
  // this directory is ignored at runtime. It matters for offline/static builds.
  webDir: 'out',
  server: {
    // Only set url when CAPACITOR_SERVER_URL is explicitly provided.
    // Without it, Capacitor uses the bundled webDir ('out/') for offline support.
    // Example: CAPACITOR_SERVER_URL=http://192.168.1.10:3000 npx cap sync
    ...(process.env.CAPACITOR_SERVER_URL ? { url: process.env.CAPACITOR_SERVER_URL } : {}),
  }
};

export default config;

