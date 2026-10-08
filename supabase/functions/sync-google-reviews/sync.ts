/* =============================================================
   PELLIKAL — sync-google-reviews / sync.ts
   The whole sync as pure, testable logic. index.ts is only the HTTP
   wrapper around runSync(). Nothing in here touches Deno globals, so
   tools/qa/sync_google_reviews_test.ts can run it with a fake fetch.

   WHAT IT DOES (every 12 h, or on demand)
     1. OAuth 2.0: refresh token -> short-lived access token
     2. GET every page of the Business Profile Reviews API for the
        verified Pellikal location (official API, no scraping)
     3. optional: GET the location metadata (placeId / mapsUri /
        newReviewUri) so the site can link to "all reviews on Google"
     4. UPSERT reviews into public.google_reviews keyed by Google's
        reviewId (idempotent: a second run changes nothing)
     5. soft-delete reviews Google no longer returns - ONLY after a
        complete listing, so a partial failure can never hide anything
     6. write the summary: Google's own averageRating / totalReviewCount,
        last_synced_at, status

   FAIL SAFELY
     Any failure (Google down, OAuth expired, Supabase write error) leaves
     every previously synced row untouched, records the error on the
     summary row (last_sync_status = 'error', last_error = sanitised
     message, last_attempt_at), and reports it to the caller. The website
     keeps showing the last successful data. Secrets never appear in
     messages, logs or responses.
   ============================================================= */

export interface SyncEnv {
  GOOGLE_CLIENT_ID: string;
  GOOGLE_CLIENT_SECRET: string;
  GOOGLE_REFRESH_TOKEN: string;
  GOOGLE_BUSINESS_ACCOUNT_ID: string;   // digits only, e.g. 1234567890
  GOOGLE_BUSINESS_LOCATION_ID: string;  // digits only, e.g. 9876543210
  SUPABASE_URL: string;                 // injected by the Edge runtime
  SUPABASE_SERVICE_ROLE_KEY: string;    // injected by the Edge runtime - NEVER leaves the server
}

export type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

export interface SyncResult {
  ok: boolean;
  fetched: number;        // reviews returned by Google (all pages)
  upserted: number;       // rows written
  softDeleted: number;    // rows no longer on Google, hidden
  pages: number;
  averageRating: number | null;
  totalReviewCount: number | null;
  error?: string;         // sanitised
}

const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVIEWS_API = "https://mybusiness.googleapis.com/v4";
const INFO_API = "https://mybusinessbusinessinformation.googleapis.com/v1";
const MAX_PAGES = 40;     // 40 x 50 = 2,000 reviews - far beyond any realistic count
const PAGE_SIZE = 50;

/** Google's enum -> integer. Unknown/unspecified -> null (the review is skipped). */
export function starToInt(s: unknown): number | null {
  const map: Record<string, number> = { ONE: 1, TWO: 2, THREE: 3, FOUR: 4, FIVE: 5 };
  return typeof s === "string" && map[s] ? map[s] : null;
}

/** Strip anything that could be a credential from an error message before it is stored. */
export function sanitise(msg: string, env: Partial<SyncEnv>): string {
  let out = String(msg || "").slice(0, 900);
  for (const v of [env.GOOGLE_CLIENT_SECRET, env.GOOGLE_REFRESH_TOKEN, env.SUPABASE_SERVICE_ROLE_KEY, env.GOOGLE_CLIENT_ID]) {
    if (v && v.length > 3) out = out.split(v).join("[redacted]");
  }
  // bearer tokens / long opaque strings that look like tokens
  out = out.replace(/ya29\.[A-Za-z0-9_\-.]+/g, "[redacted]").replace(/Bearer\s+\S+/gi, "Bearer [redacted]");
  return out;
}

export interface ReviewRow {
  google_review_id: string;
  review_name: string | null;
  reviewer_name: string;
  is_anonymous: boolean;
  star_rating: number;
  comment: string | null;
  create_time: string;
  update_time: string;
  reply_comment: string | null;
  reply_update_time: string | null;
  synced_at: string;
  deleted_at: null;       // an upsert always revives a row Google returned
}

/** One Google review object -> one table row. Returns null if it cannot be stored faithfully. */
export function mapReview(r: Record<string, unknown>, syncedAt: string): ReviewRow | null {
  const id = typeof r.reviewId === "string" ? r.reviewId : "";
  const stars = starToInt(r.starRating);
  const create = typeof r.createTime === "string" ? r.createTime : "";
  if (!id || !stars || !create) return null;
  const reviewer = (r.reviewer && typeof r.reviewer === "object" ? r.reviewer : {}) as Record<string, unknown>;
  const anonymous = reviewer.isAnonymous === true;
  const name = typeof reviewer.displayName === "string" && reviewer.displayName.trim() ? reviewer.displayName.trim().slice(0, 200) : "A Google user";
  const reply = (r.reviewReply && typeof r.reviewReply === "object" ? r.reviewReply : null) as Record<string, unknown> | null;
  const comment = typeof r.comment === "string" && r.comment.trim() ? r.comment.slice(0, 8000) : null;  // never rewritten, only capped
  return {
    google_review_id: id.slice(0, 200),
    review_name: typeof r.name === "string" ? r.name.slice(0, 400) : null,
    reviewer_name: anonymous ? "A Google user" : name,
    is_anonymous: anonymous,
    star_rating: stars,
    comment,
    create_time: create,
    update_time: typeof r.updateTime === "string" ? r.updateTime : create,
    reply_comment: reply && typeof reply.comment === "string" ? reply.comment.slice(0, 8000) : null,
    reply_update_time: reply && typeof reply.updateTime === "string" ? reply.updateTime : null,
    synced_at: syncedAt,
    deleted_at: null,
  };
}

async function accessToken(env: SyncEnv, fetchFn: Fetch): Promise<string> {
  const body = new URLSearchParams({
    client_id: env.GOOGLE_CLIENT_ID,
    client_secret: env.GOOGLE_CLIENT_SECRET,
    refresh_token: env.GOOGLE_REFRESH_TOKEN,
    grant_type: "refresh_token",
  });
  const res = await fetchFn(TOKEN_URL, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: body.toString() });
  const data = await res.json().catch(() => ({}));
  if (!res.ok || typeof data.access_token !== "string") {
    // Google says e.g. {"error":"invalid_grant"} when the refresh token was revoked or expired (7-day testing-mode tokens!)
    throw new Error("google oauth refresh failed: HTTP " + res.status + " " + (data.error || "") + " " + (data.error_description || ""));
  }
  return data.access_token;
}

interface Page { reviews: Record<string, unknown>[]; averageRating?: number; totalReviewCount?: number; nextPageToken?: string }

async function listAllReviews(env: SyncEnv, token: string, fetchFn: Fetch): Promise<{ reviews: Record<string, unknown>[]; averageRating: number | null; totalReviewCount: number | null; pages: number }> {
  const base = `${REVIEWS_API}/accounts/${encodeURIComponent(env.GOOGLE_BUSINESS_ACCOUNT_ID)}/locations/${encodeURIComponent(env.GOOGLE_BUSINESS_LOCATION_ID)}/reviews`;
  const all: Record<string, unknown>[] = [];
  let averageRating: number | null = null, totalReviewCount: number | null = null, pageToken = "", pages = 0;
  do {
    const url = base + "?pageSize=" + PAGE_SIZE + (pageToken ? "&pageToken=" + encodeURIComponent(pageToken) : "");
    const res = await fetchFn(url, { headers: { Authorization: "Bearer " + token } });
    const data = (await res.json().catch(() => ({}))) as Page & { error?: { message?: string } };
    if (!res.ok) throw new Error("google reviews list failed: HTTP " + res.status + " " + (data.error && data.error.message ? data.error.message : ""));
    pages++;
    if (Array.isArray(data.reviews)) all.push(...data.reviews);
    if (typeof data.averageRating === "number") averageRating = Math.round(data.averageRating * 10) / 10;
    if (typeof data.totalReviewCount === "number") totalReviewCount = data.totalReviewCount;
    pageToken = typeof data.nextPageToken === "string" ? data.nextPageToken : "";
    if (pages >= MAX_PAGES && pageToken) throw new Error("google reviews list: more than " + MAX_PAGES + " pages - refusing to soft-delete on an incomplete listing");
  } while (pageToken);
  // The API returns the aggregate on every page; with ZERO reviews it may omit both - that is a valid state.
  if (totalReviewCount === null) totalReviewCount = all.length;
  return { reviews: all, averageRating, totalReviewCount, pages };
}

/** Optional. placeId / mapsUri / newReviewUri let the site link to the real Google reviews page. Non-fatal. */
async function locationMeta(env: SyncEnv, token: string, fetchFn: Fetch): Promise<{ place_id: string | null; maps_uri: string | null; new_review_uri: string | null } | null> {
  try {
    const res = await fetchFn(`${INFO_API}/locations/${encodeURIComponent(env.GOOGLE_BUSINESS_LOCATION_ID)}?readMask=metadata`, { headers: { Authorization: "Bearer " + token } });
    if (!res.ok) return null;
    const data = await res.json().catch(() => ({}));
    const m = (data && data.metadata) || {};
    const s = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : null);
    return { place_id: s(m.placeId, 200), maps_uri: s(m.mapsUri, 2000), new_review_uri: s(m.newReviewUri, 2000) };
  } catch (_e) {
    return null;
  }
}

/* ---------- Supabase (PostgREST with the service_role key, server side only) ---------- */

function sbHeaders(env: SyncEnv, extra: Record<string, string> = {}): Record<string, string> {
  return { apikey: env.SUPABASE_SERVICE_ROLE_KEY, Authorization: "Bearer " + env.SUPABASE_SERVICE_ROLE_KEY, "Content-Type": "application/json", ...extra };
}

async function sbExpectOk(res: Response, what: string): Promise<void> {
  if (res.ok) return;
  const text = await res.text().catch(() => "");
  throw new Error("supabase " + what + " failed: HTTP " + res.status + " " + text.slice(0, 300));
}

/** Idempotent: ON CONFLICT (google_review_id) DO UPDATE - PostgREST's merge-duplicates. */
async function upsertReviews(env: SyncEnv, rows: ReviewRow[], fetchFn: Fetch): Promise<number> {
  let n = 0;
  for (let i = 0; i < rows.length; i += 100) {
    const batch = rows.slice(i, i + 100);
    const res = await fetchFn(`${env.SUPABASE_URL}/rest/v1/google_reviews?on_conflict=google_review_id`, {
      method: "POST",
      headers: sbHeaders(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
      body: JSON.stringify(batch),
    });
    await sbExpectOk(res, "upsert reviews");
    n += batch.length;
  }
  return n;
}

async function markMissing(env: SyncEnv, seen: string[], syncedAt: string, fetchFn: Fetch): Promise<number> {
  const res = await fetchFn(`${env.SUPABASE_URL}/rest/v1/rpc/google_reviews_mark_missing`, {
    method: "POST",
    headers: sbHeaders(env),
    body: JSON.stringify({ p_seen: seen, p_synced_at: syncedAt }),
  });
  await sbExpectOk(res, "mark missing");
  const n = await res.json().catch(() => 0);
  return typeof n === "number" ? n : 0;
}

async function writeSummary(env: SyncEnv, patch: Record<string, unknown>, fetchFn: Fetch): Promise<void> {
  const res = await fetchFn(`${env.SUPABASE_URL}/rest/v1/google_review_summary?on_conflict=id`, {
    method: "POST",
    headers: sbHeaders(env, { Prefer: "resolution=merge-duplicates,return=minimal" }),
    body: JSON.stringify({ id: 1, ...patch }),
  });
  await sbExpectOk(res, "write summary");
}

/* ---------- the sync ---------- */

export function checkEnv(env: Partial<SyncEnv>): string[] {
  const missing: string[] = [];
  for (const k of ["GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_SECRET", "GOOGLE_REFRESH_TOKEN", "GOOGLE_BUSINESS_ACCOUNT_ID", "GOOGLE_BUSINESS_LOCATION_ID", "SUPABASE_URL", "SUPABASE_SERVICE_ROLE_KEY"] as const) {
    if (!env[k] || !String(env[k]).trim()) missing.push(k);
  }
  for (const k of ["GOOGLE_BUSINESS_ACCOUNT_ID", "GOOGLE_BUSINESS_LOCATION_ID"] as const) {
    if (env[k] && !/^\d{3,25}$/.test(String(env[k]).trim())) missing.push(k + " (must be the numeric ID only, e.g. 1234567890 - not 'accounts/1234567890')");
  }
  return missing;
}

export async function runSync(env: SyncEnv, fetchFn: Fetch, now: () => Date = () => new Date()): Promise<SyncResult> {
  const syncedAt = now().toISOString();
  const result: SyncResult = { ok: false, fetched: 0, upserted: 0, softDeleted: 0, pages: 0, averageRating: null, totalReviewCount: null };
  try {
    const token = await accessToken(env, fetchFn);
    const listing = await listAllReviews(env, token, fetchFn);          // throws on any non-complete listing
    const meta = await locationMeta(env, token, fetchFn);                // optional, never throws
    const rows: ReviewRow[] = [];
    for (const r of listing.reviews) { const row = mapReview(r, syncedAt); if (row) rows.push(row); }

    result.fetched = listing.reviews.length;
    result.pages = listing.pages;
    result.averageRating = listing.averageRating;
    result.totalReviewCount = listing.totalReviewCount;

    result.upserted = await upsertReviews(env, rows, fetchFn);
    // Only now - after a COMPLETE, successful listing and a successful upsert - hide what Google no longer returns.
    result.softDeleted = await markMissing(env, rows.map((r) => r.google_review_id), syncedAt, fetchFn);

    await writeSummary(env, {
      average_rating: listing.averageRating,
      total_review_count: listing.totalReviewCount,
      ...(meta || {}),
      last_synced_at: syncedAt,
      last_attempt_at: syncedAt,
      last_sync_status: "ok",
      last_error: null,
    }, fetchFn);
    result.ok = true;
    return result;
  } catch (e) {
    const msg = sanitise(e instanceof Error ? e.message : String(e), env);
    result.error = msg;
    // Record the failure WITHOUT touching the cached data. Best effort: if
    // Supabase itself is the thing that is down, this write fails too and the
    // caller still gets the error in the HTTP response.
    try {
      await writeSummary(env, { last_attempt_at: syncedAt, last_sync_status: "error", last_error: msg.slice(0, 1000) }, fetchFn);
    } catch (_e2) { /* nothing more we can do; cached rows are intact */ }
    return result;
  }
}

/* ---------- "discover" mode: list the accounts + locations the token can see ----------
   Helps a non-technical owner find GOOGLE_BUSINESS_ACCOUNT_ID / _LOCATION_ID
   without writing API calls by hand. Read-only. */
export async function discover(env: Pick<SyncEnv, "GOOGLE_CLIENT_ID" | "GOOGLE_CLIENT_SECRET" | "GOOGLE_REFRESH_TOKEN">, fetchFn: Fetch): Promise<unknown> {
  const token = await accessToken(env as SyncEnv, fetchFn);
  const acc = await fetchFn("https://mybusinessaccountmanagement.googleapis.com/v1/accounts", { headers: { Authorization: "Bearer " + token } });
  const accData = await acc.json().catch(() => ({}));
  if (!acc.ok) throw new Error("accounts list failed: HTTP " + acc.status + " " + JSON.stringify(accData).slice(0, 300));
  const out: unknown[] = [];
  for (const a of (accData.accounts || []) as Record<string, unknown>[]) {
    const name = String(a.name || "");                       // "accounts/1234567890"
    const loc = await fetchFn(`${INFO_API}/${name}/locations?readMask=name,title,storefrontAddress&pageSize=20`, { headers: { Authorization: "Bearer " + token } });
    const locData = await loc.json().catch(() => ({}));
    out.push({
      account: name, accountId: name.replace(/^accounts\//, ""), accountName: a.accountName, type: a.type,
      locations: ((locData.locations || []) as Record<string, unknown>[]).map((l) => ({
        location: l.name, locationId: String(l.name || "").replace(/^locations\//, ""), title: l.title,
        address: l.storefrontAddress ? (l.storefrontAddress as Record<string, unknown>).addressLines : undefined,
      })),
    });
  }
  return { accounts: out, note: "Put the numeric accountId in GOOGLE_BUSINESS_ACCOUNT_ID and the numeric locationId in GOOGLE_BUSINESS_LOCATION_ID." };
}
