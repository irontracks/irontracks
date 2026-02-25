import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.irontracks.app',
  appName: 'IronTracks',
  webDir: 'public',
  server: {
    // URL de produção. Cookies de sessão Supabase ficam neste domínio.
    url: 'https://irontracks.com.br',
    cleartext: true
  }
};

export default config;
