import "./globals.css";
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import PerformanceReporter from "@/components/PerformanceReporter";
import type { ReactNode } from 'react';
import { getErrorMessage } from '@/utils/errorMessage'
import { headers } from 'next/headers'

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

export const dynamic = 'force-dynamic'

export default async function RootLayout({ children }: { children: ReactNode }) {
  const headersList = await headers()
  const nonce = headersList?.get ? (headersList.get('x-nonce') || '') : ''
  const inlineScript = process.env.NODE_ENV === "production" ? `(() => {
  const now = () => Date.now();
  const ss = () => {
    try {
      return window.sessionStorage;
    } catch {
      return null;
    }
  };
  const ls = () => {
    try {
      return window.localStorage;
    } catch {
      return null;
    }
  };
  const host = () => String(location.hostname || "");
  const isLocal = () => {
    const h = host();
    return h === "localhost" || h === "127.0.0.1" || h.endsWith(".local");
  };
  const reloadWindowMs = 30000;
  const reloadGuardMs = 15000;
  const safeReload = (t) => {
    try {
      const url = new URL(location.href);
      url.searchParams.set("v", String(t));
      location.replace(url.pathname + url.search + url.hash);
    } catch {
      try {
        location.reload();
      } catch {}
    }
  };
  const bust = (reason) => {
    try {
      const s = ss();
      const t = now();
      if (!s) {
        safeReload(t);
        return;
      }
      const k = "it.recover.v1";
      const raw = s.getItem(k) || "";
      let st = { t: 0, c: 0 };
      try {
        st = raw ? JSON.parse(raw) : st;
      } catch {}
      if (t - (st.t || 0) < reloadWindowMs) {
        st.c = (st.c || 0) + 1;
      } else {
        st.t = t;
        st.c = 1;
      }
      st.t = t;
      s.setItem(k, JSON.stringify(st));
      if (isLocal()) {
        if (st.c > 2) return;
        safeReload(t);
        return;
      }
      if (st.c > 2) {
        const id = "it-recover-overlay";
        if (document.getElementById(id)) return;
        const d = document.createElement("div");
        d.id = id;
        d.style.cssText =
          "position:fixed;inset:0;z-index:2147483647;background:#0a0a0a;color:#fff;display:flex;align-items:center;justify-content:center;padding:24px;font-family:system-ui,-apple-system,Segoe UI,Roboto,Arial";
        const box = document.createElement("div");
        box.style.cssText = "max-width:420px;width:100%";
        const title = document.createElement("div");
        title.style.cssText = "font-weight:900;font-size:18px;margin-bottom:8px";
        title.textContent = "Falha ao carregar o app";
        const subtitle = document.createElement("div");
        subtitle.style.cssText = "opacity:.8;font-size:13px;line-height:1.4;margin-bottom:16px";
        subtitle.textContent = "Detectamos um problema de cache/atualização (iOS). Toque em recarregar.";
        const details = document.createElement("div");
        details.style.cssText = "opacity:.8;font-size:11px;word-break:break-all;margin-bottom:16px";
        details.textContent = String(reason || "");
        const btn = document.createElement("button");
        btn.id = "it-recover-btn";
        btn.style.cssText = "width:100%;padding:12px 14px;border-radius:12px;border:0;background:#facc15;color:#000;font-weight:900";
        btn.type = "button";
        btn.textContent = "Recarregar";
        box.appendChild(title);
        box.appendChild(subtitle);
        box.appendChild(details);
        box.appendChild(btn);
        d.appendChild(box);
        document.body.appendChild(d);
        btn.addEventListener("click", () => {
          safeReload(t);
        });
        return;
      }
      safeReload(t);
    } catch {
      try {
        location.reload();
      } catch {}
    }
  };
  const isChunkErr = (msg) => {
    const m = String(msg || "");
    const l = m.toLowerCase();
    return (
      l.includes("chunkloaderror") ||
      l.includes("loading chunk") ||
      l.includes("failed to fetch dynamically imported module") ||
      l.includes("importing a module script failed") ||
      l.includes("unexpected token <") ||
      l.includes("failed to fetch")
    );
  };
  const handleOAuthHashError = () => {
    try {
      const hash = String(location.hash || "");
      if (!hash || hash.length < 2) return;
      const sp = new URLSearchParams(hash.slice(1));
      const err = String(sp.get("error") || "");
      const code = String(sp.get("error_code") || "");
      const desc = String(sp.get("error_description") || "");
      if (!err && !code && !desc) return;
      const msg = desc || err || code || "oauth_error";
      const u = new URL("/auth/error", location.origin);
      u.searchParams.set("error", msg);
      location.replace(u.pathname + u.search);
    } catch {}
  };
  window.addEventListener(
    "error",
    (e) => {
      try {
        const m = getErrorMessage(e) || e?.getErrorMessage(error) || "";
        if (isChunkErr(m)) bust(m);
      } catch {}
    },
    true,
  );
  window.addEventListener(
    "unhandledrejection",
    (e) => {
      try {
        const m = e?.reason?.message || String(e?.reason || "");
        if (isChunkErr(m)) bust(m);
      } catch {}
    },
    true,
  );
  const checkVersion = () => {
    try {
      fetch("/api/version", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })
        .then((r) => (r.ok ? r.json() : null))
        .then((j) => {
          try {
            if (!j || !j.ok) return;
            const key = "it.appver.v1";
            const l = ls();
            if (!l) return;
            const cur = String(j.deploymentId || j.commitSha || j.version || "");
            if (!cur) return;
            const prev = String(l.getItem(key) || "");
            if (prev && prev !== cur) {
              const s = ss();
              const guard = "it.ver.reload.v1";
              const t = now();
              if (s) {
                const last = Number(s.getItem(guard) || 0) || 0;
                if (t - last < reloadGuardMs) return;
                s.setItem(guard, String(t));
              }
              l.setItem(key, cur);
              safeReload(t);
              return;
            }
            if (!prev) l.setItem(key, cur);
          } catch {}
        })
        .catch(() => {});
    } catch {}
  };
  const shouldRedirect = () => {
    const p = location.pathname || "/";
    if (p === "/" || p.startsWith("/auth/")) return false;
    return true;
  };
  const doAuthPing = () => {
    try {
      return;
      if (!shouldRedirect()) return;
      fetch("/api/auth/ping", {
        method: "GET",
        credentials: "include",
        cache: "no-store",
      })
        .then((r) => {
          try {
            const hasSbCookie = (() => {
              try {
                const raw = String(document.cookie || "");
                return raw.split(";").some((p) => String(p || "").trim().startsWith("sb-"));
              } catch {
                return false;
              }
            })();
            if (r && r.status === 401 && shouldRedirect() && !hasSbCookie) {
              const s = ss();
              const k = "it.auth.redirect.v1";
              const t = now();
              if (s) {
                const last = Number(s.getItem(k) || 0) || 0;
                if (t - last < reloadGuardMs) return;
                s.setItem(k, String(t));
              }
              location.replace(
                "/?next=" +
                  encodeURIComponent(
                    (location.pathname || "/") +
                      location.search +
                      location.hash,
                  ),
              );
            }
          } catch {}
        })
        .catch(() => {});
    } catch {}
  };
  const onVisible = () => {
    try {
      checkVersion();
    } catch {}
  };
  handleOAuthHashError();
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") onVisible();
  });
  window.addEventListener("focus", onVisible);
  setTimeout(onVisible, 200);
})();` : "";
  return (
    <html lang="pt-BR">
      <head>
        <link rel="icon" href="/icone.png" type="image/png" />
        <link rel="apple-touch-icon" href="/icone.png" />
        {inlineScript ? (
          <script
            nonce={nonce || undefined}
            dangerouslySetInnerHTML={{
              __html: inlineScript,
            }}
          />
        ) : null}
      </head>
      <body className="antialiased bg-neutral-950 text-white">
        <ServiceWorkerRegister />
        <PerformanceReporter />
        {children}
      </body>
    </html>
  );
}
