/* =============================================================
   PELLIKAL — Supabase Edge Function: sync-google-reviews
   HTTP wrapper only. The sync itself is in ./sync.ts (pure, tested).

   WHO MAY CALL IT
     Anyone who presents the shared secret in the x-sync-secret header
     (compared in constant time). That is the pg_cron job (secret kept in
     Supabase Vault) and the owner running a manual sync. Deploy with
     `--no-verify-jwt` - the anon JWT is public knowledge and would be no
     protection; the secret is.

   ROUTES
     POST /                 run the sync
     GET  /?discover=1      list the Google accounts + locations the refresh
                            token can see (to find the two IDs). Read-only.
     GET  /?health=1        {ok:true} - no secrets, no Google call.

   SECRETS
     All in the function's environment (supabase secrets set ...):
       GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, GOOGLE_REFRESH_TOKEN,
       GOOGLE_BUSINESS_ACCOUNT_ID, GOOGLE_BUSINESS_LOCATION_ID, SYNC_SECRET
     SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY are injected by Supabase.
     None of them is ever echoed back, logged, or sent to the browser.
   ============================================================= */
import { checkEnv, discover, runSync, sanitise, type SyncEnv } from "./sync.ts";

function env(name: string): string {
  return (Deno.env.get(name) || "").trim();
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" },
  });
}

/** Constant-time string compare so the secret cannot be guessed byte by byte. */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length || a.length === 0) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

Deno.serve(async (req: Request) => {
  const url = new URL(req.url);
  if (url.searchParams.get("health") === "1") return json({ ok: true, function: "sync-google-reviews" });

  const secret = env("SYNC_SECRET");
  const presented = (req.headers.get("x-sync-secret") || "").trim();
  if (!secret || secret.length < 16) return json({ ok: false, error: "SYNC_SECRET is not set (or shorter than 16 characters) in the function's secrets" }, 500);
  if (!safeEqual(presented, secret)) return json({ ok: false, error: "forbidden" }, 403);

  const e: SyncEnv = {
    GOOGLE_CLIENT_ID: env("GOOGLE_CLIENT_ID"),
    GOOGLE_CLIENT_SECRET: env("GOOGLE_CLIENT_SECRET"),
    GOOGLE_REFRESH_TOKEN: env("GOOGLE_REFRESH_TOKEN"),
    GOOGLE_BUSINESS_ACCOUNT_ID: env("GOOGLE_BUSINESS_ACCOUNT_ID"),
    GOOGLE_BUSINESS_LOCATION_ID: env("GOOGLE_BUSINESS_LOCATION_ID"),
    SUPABASE_URL: env("SUPABASE_URL"),
    SUPABASE_SERVICE_ROLE_KEY: env("SUPABASE_SERVICE_ROLE_KEY"),
  };

  if (url.searchParams.get("discover") === "1") {
    const missing = checkEnv(e).filter((m) => /^GOOGLE_(CLIENT_ID|CLIENT_SECRET|REFRESH_TOKEN)$/.test(m));
    if (missing.length) return json({ ok: false, error: "missing secrets: " + missing.join(", ") }, 500);
    try {
      return json({ ok: true, ...(await discover(e, fetch) as Record<string, unknown>) });
    } catch (err) {
      return json({ ok: false, error: sanitise(err instanceof Error ? err.message : String(err), e) }, 502);
    }
  }

  if (req.method !== "POST") return json({ ok: false, error: "use POST to run the sync, GET ?discover=1 to list IDs, GET ?health=1 to ping" }, 405);

  const missing = checkEnv(e);
  if (missing.length) return json({ ok: false, error: "missing or malformed secrets: " + missing.join(", ") }, 500);

  const result = await runSync(e, fetch);
  // 200 on success, 502 on failure so the cron history and any monitor show it plainly.
  return json(result, result.ok ? 200 : 502);
});
