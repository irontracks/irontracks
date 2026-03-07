"use client";

import { useEffect, useRef } from "react";
import { trackScreen, trackUserEvent } from "@/lib/telemetry/userActivity";

type PerfMetric = {
  name: string;
  value: number;
  rating?: string;
  delta?: number;
  id?: string;
};

const safeNumber = (v: unknown) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};

const sendMetric = (metric: PerfMetric, extra?: Record<string, unknown>) => {
  trackUserEvent("perf_metric", {
    type: "perf",
    metadata: {
      name: metric.name,
      value: metric.value,
      rating: metric.rating,
      delta: metric.delta,
      id: metric.id,
      ...(extra || {}),
    },
  });
};

const sendAlert = (metric: PerfMetric, threshold: number, extra?: Record<string, unknown>) => {
  trackUserEvent("perf_alert", {
    type: "perf",
    metadata: {
      name: metric.name,
      value: metric.value,
      threshold,
      ...(extra || {}),
    },
  });
};

const getPathname = () => {
  try {
    return String(window.location?.pathname || "");
  } catch {
    return "";
  }
};

export default function PerformanceReporter() {
  const initializedRef = useRef(false);

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    const path = getPathname();
    const sent = new Set<string>();

    const sendOnce = (key: string, metric: PerfMetric, extra?: Record<string, unknown>) => {
      if (sent.has(key)) return;
      sent.add(key);
      sendMetric(metric, { path, ...(extra || {}) });
    };

    const sendThreshold = (key: string, metric: PerfMetric, threshold: number, extra?: Record<string, unknown>) => {
      if (metric.value <= threshold) return;
      const alertKey = `alert:${key}`;
      if (sent.has(alertKey)) return;
      sent.add(alertKey);
      sendAlert(metric, threshold, { path, ...(extra || {}) });
    };

    try {
      const nav = performance.getEntriesByType("navigation")[0] as PerformanceNavigationTiming | undefined;
      if (nav) {
        const ttfb = safeNumber(nav.responseStart - nav.requestStart);
        if (ttfb != null) {
          sendOnce("ttfb", { name: "TTFB", value: ttfb });
          sendThreshold("ttfb", { name: "TTFB", value: ttfb }, 800);
        }
        const domReady = safeNumber(nav.domContentLoadedEventEnd - nav.startTime);
        if (domReady != null) sendOnce("dom_ready", { name: "DOM_READY", value: domReady });
        const load = safeNumber(nav.loadEventEnd - nav.startTime);
        if (load != null) sendOnce("page_load", { name: "PAGE_LOAD", value: load });
      }
    } catch {}

    try {
      let lastPath = getPathname();
      let lastEnter = performance.now();
      const recentPaths: Array<{ path: string; ts: number }> = [];
      const emitDwell = (nextPath?: string) => {
        const nowTs = performance.now();
        const dwellMs = Math.max(0, Math.round(nowTs - lastEnter));
        const path = lastPath || "";
        if (path) {
          trackUserEvent("screen_dwell", {
            type: "ux",
            screen: path,
            metadata: { path, dwellMs, nextPath: nextPath || null },
          });
          if (dwellMs < 1500) {
            trackUserEvent("screen_bounce", {
              type: "ux",
              screen: path,
              metadata: { path, dwellMs, nextPath: nextPath || null },
            });
          }
        }
        lastEnter = nowTs;
      };
      const trackNavLoop = (path: string) => {
        const nowTs = Date.now();
        recentPaths.push({ path, ts: nowTs });
        const cutoff = nowTs - 60000;
        while (recentPaths.length && recentPaths[0].ts < cutoff) recentPaths.shift();
        const count = recentPaths.filter((p) => p.path === path).length;
        if (count >= 4) {
          trackUserEvent("nav_loop", {
            type: "ux",
            screen: path,
            metadata: { path, count, windowMs: 60000 },
          });
        }
      };
      trackScreen(lastPath);
      trackNavLoop(lastPath);
      const onRouteChange = () => {
        const nextPath = getPathname();
        if (!nextPath || nextPath === lastPath) return;
        emitDwell(nextPath);
        lastPath = nextPath;
        trackScreen(nextPath);
        trackNavLoop(nextPath);
      };
      const w = window as Window & { __itRoutePatched?: boolean };
      if (!w.__itRoutePatched) {
        w.__itRoutePatched = true;
        const originalPush = history.pushState.bind(history);
        const originalReplace = history.replaceState.bind(history);
        history.pushState = (...args) => {
          const res = originalPush(...args);
          onRouteChange();
          return res;
        };
        history.replaceState = (...args) => {
          const res = originalReplace(...args);
          onRouteChange();
          return res;
        };
        window.addEventListener("popstate", onRouteChange);
      }
      window.addEventListener("pageshow", onRouteChange);
      window.addEventListener("pagehide", () => emitDwell(undefined));
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") emitDwell(undefined);
      });
    } catch {}

    try {
      const paintObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          if (entry.name === "first-contentful-paint") {
            const v = safeNumber(entry.startTime);
            if (v != null) {
              sendOnce("fcp", { name: "FCP", value: v });
              sendThreshold("fcp", { name: "FCP", value: v }, 1800);
            }
          }
        });
      });
      paintObserver.observe({ type: "paint", buffered: true });
    } catch {}

    try {
      const lcpObserver = new PerformanceObserver((list) => {
        const entries = list.getEntries();
        const last = entries[entries.length - 1];
        const v = safeNumber(last?.startTime);
        if (v != null) {
          sendOnce("lcp", { name: "LCP", value: v });
          sendThreshold("lcp", { name: "LCP", value: v }, 2500);
        }
      });
      lcpObserver.observe({ type: "largest-contentful-paint", buffered: true });
    } catch {}

    try {
      let clsValue = 0;
      const clsObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const e = entry as PerformanceEntry & { value?: number; hadRecentInput?: boolean };
          if (e.hadRecentInput) return;
          const v = safeNumber(e.value);
          if (v != null) clsValue += v;
        });
      });
      clsObserver.observe({ type: "layout-shift", buffered: true });
      const flushCls = () => {
        if (clsValue > 0) {
          sendOnce("cls", { name: "CLS", value: clsValue });
          sendThreshold("cls", { name: "CLS", value: clsValue }, 0.1);
        }
      };
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushCls();
      });
      window.addEventListener("pagehide", flushCls);
    } catch {}

    try {
      let maxInp = 0;
      const inpObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const e = entry as PerformanceEntry & { duration?: number; interactionId?: number };
          const v = safeNumber(e.duration);
          if (v == null) return;
          if (v > maxInp) maxInp = v;
        });
      });
      inpObserver.observe({ type: "event", buffered: true });
      const flushInp = () => {
        if (maxInp > 0) {
          sendOnce("inp", { name: "INP", value: maxInp });
          sendThreshold("inp", { name: "INP", value: maxInp }, 200);
        }
      };
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushInp();
      });
      window.addEventListener("pagehide", flushInp);
    } catch {}

    try {
      const longTaskTotals = { count: 0, duration: 0 };
      const longTaskObserver = new PerformanceObserver((list) => {
        list.getEntries().forEach((entry) => {
          const d = safeNumber(entry.duration);
          if (d == null) return;
          longTaskTotals.count += 1;
          longTaskTotals.duration += d;
        });
      });
      longTaskObserver.observe({ type: "longtask", buffered: true } as PerformanceObserverInit);
      const flushLongTasks = () => {
        if (!longTaskTotals.count) return;
        sendOnce("longtask", { name: "LONG_TASK", value: longTaskTotals.duration }, { count: longTaskTotals.count });
        sendThreshold("longtask", { name: "LONG_TASK", value: longTaskTotals.duration }, 200, {
          count: longTaskTotals.count,
        });
      };
      window.addEventListener("visibilitychange", () => {
        if (document.visibilityState === "hidden") flushLongTasks();
      });
      window.addEventListener("pagehide", flushLongTasks);
    } catch {}

    try {
      let rafId = 0;
      let last = performance.now();
      let frames = 0;
      let longFrames = 0;
      const start = performance.now();
      const tick = (t: number) => {
        const delta = t - last;
        last = t;
        frames += 1;
        if (delta > 50) longFrames += 1;
        if (t - start >= 5000) {
          const duration = t - start;
          const fps = duration > 0 ? (frames / duration) * 1000 : 0;
          if (fps > 0) {
            const rounded = Math.round(fps);
            sendOnce("fps", { name: "FPS", value: rounded });
            if (rounded < 45) sendThreshold("fps", { name: "FPS", value: rounded }, 45, { frames });
          }
          if (longFrames > 0) sendOnce("jank", { name: "JANK_FRAMES", value: longFrames }, { frames });
          return;
        }
        rafId = requestAnimationFrame(tick);
      };
      rafId = requestAnimationFrame(tick);
      window.addEventListener("pagehide", () => cancelAnimationFrame(rafId));
    } catch {}

    try {
      const w = window as Window & { __itFetchPatched?: boolean };
      if (w.__itFetchPatched) return;
      w.__itFetchPatched = true;
      const originalFetch = window.fetch.bind(window);
      const recent = new Map<string, number>();
      window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
        const start = performance.now();
        let url = "";
        try {
          url = typeof input === "string" ? input : "url" in input ? String(input.url) : "";
        } catch {}
        const method = String(init?.method || "GET").toUpperCase();
        const key = `${method}::${url}`;
        const now = Date.now();
        const last = recent.get(key) || 0;
        const skip = now - last < 30000;
        if (!skip) recent.set(key, now);
        try {
          const res = await originalFetch(input, init);
          const dur = safeNumber(performance.now() - start);
          if (!skip && dur != null && url.includes("/api/")) {
            sendMetric(
              { name: "API_TIME", value: dur },
              {
                path: getPathname(),
                url,
                method,
                status: res.status,
                ok: res.ok,
              },
            );
          }
          return res;
        } catch (err) {
          const dur = safeNumber(performance.now() - start);
          if (!skip && dur != null && url.includes("/api/")) {
            sendMetric(
              { name: "API_TIME", value: dur },
              {
                path: getPathname(),
                url,
                method,
                status: 0,
                ok: false,
                error: String(err || "fetch_error"),
              },
            );
          }
          throw err;
        }
      };
    } catch {}
  }, []);

  return null;
}
