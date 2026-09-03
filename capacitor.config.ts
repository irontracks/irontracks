import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.irontracks.app',
  appName: 'IronTracks',
  // Next.js `output: 'export'` generates static files in `out/`, not `public/`.
  // When server.url is set (via CAPACITOR_SERVER_URL or production fallback),
  // this directory is ignored at runtime. It matters for offline/static builds.
  webDir: 'out',
  server: {
    // Production URL — app loads from Vercel (SSR, API routes, auth).
    // Override with CAPACITOR_SERVER_URL for local dev:
    // Example: CAPACITOR_SERVER_URL=http://192.168.1.10:3000 npx cap sync
    url: process.env.CAPACITOR_SERVER_URL || 'https://irontracks.com.br',
  },
  // O WKWebView nasce BRANCO por padrão do sistema, e enquanto ele busca a URL
  // remota não há HTML nenhum para pintar por cima. Medido em 03/09/2026,
  // gravando o cold start a 20 fps: ~1,9 s de branco chapado no meio do boot de
  // um app inteiramente dark. Não era o launch screen (esse foi corrigido em
  // separado e o branco continuou) — é a própria janela do WebView.
  // #0a0a0a é o mesmo `bg-neutral-950` do LoadingScreen: nenhum degrau de cor
  // entre a janela nativa e o primeiro pixel da web.
  backgroundColor: '#0a0a0a',
  ios: {
    backgroundColor: '#0a0a0a',
  },
  plugins: {
    PushNotifications: {
      // Show push banners even when the app is in the foreground (iOS default suppresses them).
      presentationOptions: ['badge', 'sound', 'alert'],
    },
  },
};

export default config;

