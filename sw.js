const CACHE_NAME = 'irontracks-v18';

// 1. Arquivos Essenciais (Locais) - Se falhar, o app não instala
const CORE_ASSETS = [
  './index.html',
  './icone.png',
  './manifest.json'
];

// 2. Assets Externos que suportam CORS (Modules)
const CORS_ASSETS = [
  'https://unpkg.com/@babel/standalone/babel.min.js',
  'https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js',
  'https://esm.sh/react@18.2.0',
  'https://esm.sh/react-dom@18.2.0/client',
  'https://esm.sh/lucide-react@0.294.0',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js',
  'https://www.gstatic.com/firebasejs/10.8.0/firebase-storage.js'
];

// 3. Assets que podem precisar de no-cors (Scripts globais)
const NO_CORS_ASSETS = [
  'https://cdn.tailwindcss.com'
];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then(async (cache) => {
      // Passo 1: Cachear essenciais (Critical Path)
      await cache.addAll(CORE_ASSETS);

      // Passo 2: Cachear assets CORS (tentar um por um para não quebrar tudo)
      const corsPromises = CORS_ASSETS.map(async (url) => {
        try {
          const request = new Request(url, { mode: 'cors' });
          const response = await fetch(request);
          if (response.ok) await cache.put(request, response);
        } catch (e) {
          console.warn('Falha ao cachear asset CORS (não-crítico):', url, e);
        }
      });

      // Passo 3: Cachear assets NO-CORS (Tailwind)
      const noCorsPromises = NO_CORS_ASSETS.map(async (url) => {
        try {
          const request = new Request(url, { mode: 'no-cors' });
          const response = await fetch(request);
          await cache.put(request, response);
        } catch (e) {
          console.warn('Falha ao cachear asset NO-CORS:', url, e);
        }
      });

      await Promise.all([...corsPromises, ...noCorsPromises]);
    })
  );
});

self.addEventListener('fetch', (event) => {
  event.respondWith(
    caches.match(event.request).then((response) => {
      return response || fetch(event.request);
    })
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((cacheNames) => {
      return Promise.all(
        cacheNames.map((cache) => {
          if (cache !== CACHE_NAME) {
            return caches.delete(cache);
          }
        })
      );
    })
  );
});