import "./globals.css";

export const metadata = {
  title: "IronTracks - Alta Performance",
  description: "Track your workouts and progress with IronTracks.",
  metadataBase: new URL("https://irontracks.com.br"),
  openGraph: {
    title: "IronTracks - Alta Performance",
    description: "Track your workouts and progress with IronTracks.",
    url: "https://irontracks.com.br",
    siteName: "IronTracks",
    type: "website",
    images: [
      {
        url: "/opengraph-image",
        width: 1200,
        height: 630,
        alt: "IronTracks",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "IronTracks - Alta Performance",
    description: "Track your workouts and progress with IronTracks.",
    images: ["/opengraph-image"],
  },
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "IronTracks",
  },
  icons: {
    icon: [{ url: "/icone.png", type: "image/png" }],
    shortcut: ["/icone.png"],
    apple: [{ url: "/icone.png", type: "image/png" }],
  },
};

export const viewport = {
  themeColor: "#000000",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({ children }) {
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/icone.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icone.png" />
        <script
          dangerouslySetInnerHTML={{
            __html:
              "(()=>{const now=()=>Date.now();const ss=()=>{try{return window.sessionStorage}catch{return null}};const ls=()=>{try{return window.localStorage}catch{return null}};const bust=(reason)=>{try{const s=ss();if(!s)return;const k='it.recover.v1';const raw=s.getItem(k)||'';let st={t:0,c:0};try{st=raw?JSON.parse(raw):st}catch{};const t=now();if(t-(st.t||0)<30000){st.c=(st.c||0)+1}else{st.t=t;st.c=1}st.t=t;s.setItem(k,JSON.stringify(st));if(st.c>2){const id='it-recover-overlay';if(document.getElementById(id))return;const d=document.createElement('div');d.id=id;d.style.cssText='position:fixed;inset:0;z-index:2147483647;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial';d.innerHTML='<div style=\"max-width:420px;width:100%\"><div style=\"font-weight:900;font-size:18px;margin-bottom:8px\">Falha ao carregar o app</div><div style=\"opacity:.8;font-size:13px;line-height:1.4;margin-bottom:16px\">Detectamos um problema de cache/atualização (iOS). Toque em recarregar.</div><div style=\"opacity:.8;font-size:11px;word-break:break-all;margin-bottom:16px\">'+String(reason||'')+'</div><button id=\"it-recover-btn\" style=\"width:100%;padding:12px 14px;border-radius:12px;border:0;background:#facc15;color:#000;font-weight:900\">Recarregar</button></div>';document.body.appendChild(d);document.getElementById('it-recover-btn')?.addEventListener('click',()=>{try{location.replace(location.pathname+'?v='+t+location.search+location.hash)}catch{location.reload()}});return}location.replace(location.pathname+'?v='+t+location.search+location.hash)}catch{try{location.reload()}catch{}}};const isChunkErr=(msg)=>{const m=String(msg||'');const l=m.toLowerCase();return l.includes('chunkloaderror')||l.includes('loading chunk')||l.includes('failed to fetch dynamically imported module')||l.includes('importing a module script failed')||l.includes('unexpected token <')||l.includes('failed to fetch')};window.addEventListener('error',(e)=>{try{const m=e?.message||e?.error?.message||'';if(isChunkErr(m))bust(m)}catch{}},true);window.addEventListener('unhandledrejection',(e)=>{try{const m=e?.reason?.message||String(e?.reason||'');if(isChunkErr(m))bust(m)}catch{}},true);const checkVersion=()=>{try{fetch('/api/version',{method:'GET',credentials:'include',cache:'no-store'}).then(r=>r.ok?r.json():null).then(j=>{try{if(!j||!j.ok)return;const key='it.appver.v1';const l=ls();if(!l)return;const cur=String(j.deploymentId||j.commitSha||j.version||'');if(!cur)return;const prev=String(l.getItem(key)||'');if(prev&&prev!==cur){const s=ss();const guard='it.ver.reload.v1';const t=now();if(s){const last=Number(s.getItem(guard)||0)||0;if(t-last<15000)return;s.setItem(guard,String(t))}l.setItem(key,cur);location.replace(location.pathname+'?v='+t+location.search+location.hash);return}if(!prev)l.setItem(key,cur)}catch{}}).catch(()=>{})}catch{}};const shouldRedirect=()=>{const p=location.pathname||'/';if(p==='/'||p.startsWith('/auth/'))return false;return true};const doAuthPing=()=>{try{fetch('/api/auth/ping',{method:'GET',credentials:'include',cache:'no-store'}).then((r)=>{try{if(r&&r.status===401&&shouldRedirect()){const s=ss();const k='it.auth.redirect.v1';const t=now();if(s){const last=Number(s.getItem(k)||0)||0;if(t-last<15000)return;s.setItem(k,String(t))}location.replace('/?next='+encodeURIComponent((location.pathname||'/')+location.search+location.hash))}}catch{}}).catch(()=>{})}catch{}};const onVisible=()=>{try{checkVersion();doAuthPing()}catch{}};document.addEventListener('visibilitychange',()=>{if(document.visibilityState==='visible')onVisible()});window.addEventListener('focus',onVisible);setTimeout(onVisible,200);})();",
          }}
        />
      </head>
      <body
        className="antialiased bg-neutral-950 text-white"
      >
        {children}
      </body>
    </html>
  );
}
