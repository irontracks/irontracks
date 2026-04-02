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
      s.setItem(k, String(st.t || 0) + "|" + String(st.c || 0));
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
