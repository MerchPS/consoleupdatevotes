// api/fetch.js - Vercel serverless proxy
export const config = { runtime: "nodejs18.x" };

const USER_AGENT = "MotionImeMonitor/1.0 (+https://yourdomain.vercel.app)";
const MAX_BODY = 1024 * 1024 * 2; // 2MB limit

async function delay(ms) {
  return new Promise((res) => setTimeout(res, ms));
}

async function fetchWithRetries(url, opts = {}, tries = 3) {
  let err;
  for (let i = 0; i < tries; i++) {
    try {
      const res = await fetch(url, { ...opts, redirect: "follow" });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (e) {
      err = e;
      await delay(200 * Math.pow(2, i));
    }
  }
  throw err;
}

export default async function handler(req, res) {
  try {
    const target = req.query.url;
    if (!target) return res.status(400).send("Missing ?url param");

    // Host allowlist (safety)
    const u = new URL(target);
    if (!u.hostname.endsWith("motionimefest.id"))
      return res.status(403).send("Forbidden host");

    const headers = {
      "User-Agent": USER_AGENT,
      "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
      "Accept-Language": "en-US,en;q=0.9",
    };

    const resp = await fetchWithRetries(target, { headers }, 3);
    const buf = Buffer.from(await resp.arrayBuffer());
    const ct = resp.headers.get("content-type") || "text/html";

    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET,OPTIONS");
    res.setHeader("Content-Type", ct);
    res.setHeader("Cache-Control", "s-maxage=5, stale-while-revalidate=10");

    if (buf.byteLength > MAX_BODY) {
      res.setHeader("x-proxy-truncated", "true");
      return res.status(200).send(buf.slice(0, MAX_BODY));
    }

    res.status(200).send(buf);
  } catch (err) {
    console.error("Proxy error:", err.message);
    res.status(502).send("Proxy fetch failed: " + err.message);
  }
}
