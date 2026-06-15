(() => {
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
  // Contador anti-loop: sessionStorage preferido; cai pra localStorage quando o
  // WKWebView (iOS) bloqueia sessionStorage — assim o limite SEMPRE existe e o
  // app nunca recarrega infinitamente.
  const store = () => ss() || ls();
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

  // Limpa SÓ o cache de runtime do app — é onde o SW guarda o app-shell
  // (navegações) e os bundles JS/CSS, ou seja, exatamente o conteúdo STALE que
  // causa o ChunkLoadError em loop após um deploy. O cache "static" (página
  // /offline, manifest, ícone) é PRESERVADO de propósito: sem ele o offline
  // ficaria sem fallback. Caches de terceiros também são preservados.
  const clearRuntimeCaches = async () => {
    try {
      if (window.caches && caches.keys) {
        const keys = await caches.keys();
        await Promise.all(
          keys.map((k) => {
            const name = String(k || "");
            if (name.startsWith("irontracks") && name.includes("-runtime-")) {
              return caches.delete(k).catch(() => {});
            }
            return Promise.resolve();
          }),
        );
      }
    } catch {}
  };

  // Atualiza o SW NO LUGAR em vez de desregistrar: r.update() re-busca o
  // /sw.js (servido no-store) e, se o script mudou, instala o novo SW
  // (network-first) e assume o controle (skipWaiting + clients.claim). Assim um
  // SW antigo cache-first — a real causa do loop — é trocado pelo correto SEM o
  // offline jamais ficar sem Service Worker. Só desregistra como último recurso,
  // quando o update falha (registro realmente quebrado, sem serventia).
  const refreshServiceWorker = async () => {
    try {
      if (!navigator.serviceWorker || !navigator.serviceWorker.getRegistrations) return;
      const regs = await navigator.serviceWorker.getRegistrations();
      await Promise.all(
        regs.map(async (r) => {
          try {
            if (r.update) await r.update();
          } catch {
            try { await r.unregister(); } catch {}
          }
        }),
      );
    } catch {}
  };

  // Recuperação não-destrutiva pro offline: descarta o shell/bundles stale e
  // renova o SW, mantendo a página /offline e o registro do SW vivos.
  const purge = async () => {
    await clearRuntimeCaches();
    await refreshServiceWorker();
  };

  // Recuperação de chunk error: PURGA antes de recarregar para o reload buscar
  // tudo fresh, quebrando o loop. O timeout garante que o reload aconteça mesmo
  // se a limpeza travar.
  const recover = (t) => {
    let done = false;
    const go = () => {
      if (done) return;
      done = true;
      safeReload(t);
    };
    try {
      Promise.race([purge(), new Promise((r) => setTimeout(r, 1500))]).then(go, go);
    } catch {
      go();
    }
  };

  const bust = (reason) => {
    try {
      const s = store();
      const t = now();
      if (!s) {
        // Sem storage nenhum: purga e recarrega UMA vez (purge quebra o loop de
        // shell stale; sem contador, mas o purge evita repetir o erro).
        recover(t);
        return;
      }
      const k = "it.recover.v1";
      const raw = s.getItem(k) || "";
      let st = { t: 0, c: 0 };
      try {
        const parts = String(raw || "").split("|");
        const t0 = Number(parts[0] || 0);
        const c0 = Number(parts[1] || 0);
        st = { t: Number.isFinite(t0) ? t0 : 0, c: Number.isFinite(c0) ? c0 : 0 };
      } catch {}
      if (t - (st.t || 0) < reloadWindowMs) {
        st.c = (st.c || 0) + 1;
      } else {
        st.t = t;
        st.c = 1;
      }
      st.t = t;
      try {
        s.setItem(k, String(st.t || 0) + "|" + String(st.c || 0));
      } catch {}
      if (isLocal()) {
        if (st.c > 2) return;
        recover(t);
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
          recover(now());
        });
        return;
      }
      recover(t);
    } catch {
      try {
        recover(now());
      } catch {}
    }
  };
  const isChunkErr = (msg) => {
    const m = String(msg || "");
    const l = m.toLowerCase();
    // Apenas erros de carregamento de CHUNK/MÓDULO (sinais de assets stale após
    // deploy). NÃO inclui "failed to fetch" genérico — esse captura qualquer
    // falha de rede transitória (API/imagem) e fazia o app recarregar à toa.
    return (
      l.includes("chunkloaderror") ||
      l.includes("loading chunk") ||
      l.includes("failed to fetch dynamically imported module") ||
      l.includes("importing a module script failed") ||
      l.includes("unexpected token <")
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
        const m = String(e?.message || e?.error?.message || "");
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
              const s = store();
              const guard = "it.ver.reload.v1";
              const t = now();
              if (s) {
                const last = Number(s.getItem(guard) || 0) || 0;
                if (t - last < reloadGuardMs) return;
                try { s.setItem(guard, String(t)); } catch {}
              }
              try { l.setItem(key, cur); } catch {}
              safeReload(t);
              return;
            }
            if (!prev) {
              try { l.setItem(key, cur); } catch {}
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
})();
