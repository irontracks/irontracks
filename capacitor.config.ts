import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.irontracks.app',
  appName: 'IronTracks',
  // Next.js `output: 'export'` generates static files in `out/`, not `public/`.
  // When server.url is set (via CAPACITOR_SERVER_URL or production fallback),
  // this directory is ignored at runtime. It matters for offline/static builds.
  webDir: 'out',
  server: {
    // Use CAPACITOR_SERVER_URL to point at localhost or staging for native testing.
    // Falls back to production when the variable is not set.
    // Example: CAPACITOR_SERVER_URL=http://192.168.1.10:3000 npx cap sync
    url: process.env.CAPACITOR_SERVER_URL || 'https://irontracks.com.br',
  }
};

export default config;

