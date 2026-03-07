import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.irontracks.app',
  appName: 'IronTracks',
  webDir: 'public',
  server: {
    // URL de produção do seu app (Vercel).
    // Substitua pela sua URL real, ex: https://irontracks.vercel.app
    url: 'https://app-iron-tracks.vercel.app',
    cleartext: true
  }
};

export default config;
