/* Tests for supabase/functions/sync-google-reviews/sync.ts
   Run:  deno test --allow-read tools/qa/sync_google_reviews_test.ts
   No network: a fake fetch plays both Google and PostgREST. The fake
   PostgREST is strict in the one way that matters - a POST that hits an
   existing primary key WITHOUT `on_conflict` + `Prefer: resolution=merge-duplicates`
   gets HTTP 409, exactly like the real one - so "repeated syncs do not
   duplicate reviews" is exercised, not assumed. */
// Tiny asserts (no registry dependency - the sandbox this runs in has no jsr access).
function assert(cond: unknown, msg = "assertion failed"): void { if (!cond) throw new Error(msg); }
function assertEquals(actual: unknown, expected: unknown, msg = ""): void {
  const a = JSON.stringify(actual), e = JSON.stringify(expected);
  if (a !== e) throw new Error((msg ? msg + " - " : "") + "expected " + e + ", got " + a);
}
function assertStringIncludes(actual: string, needle: string, msg = ""): void {
  if (!String(actual).includes(needle)) throw new Error((msg ? msg + " - " : "") + "expected " + JSON.stringify(actual) + " to include " + JSON.stringify(needle));
}
import { checkEnv, mapReview, runSync, sanitise, starToInt, type Fetch, type SyncEnv } from "../../supabase/functions/sync-google-reviews/sync.ts";

const ENV: SyncEnv = {
  GOOGLE_CLIENT_ID: "client-id-123.apps.googleusercontent.com",
  GOOGLE_CLIENT_SECRET: "GOCSPX-super-secret-value",
  GOOGLE_REFRESH_TOKEN: "1//refresh-token-very-secret",
  GOOGLE_BUSINESS_ACCOUNT_ID: "1234567890",
  GOOGLE_BUSINESS_LOCATION_ID: "9876543210",
  SUPABASE_URL: "https://proj.supabase.co",
  SUPABASE_SERVICE_ROLE_KEY: "service-role-key-never-in-the-browser",
};

type Review = Record<string, unknown>;
const R = (id: string, stars: string, comment: string | undefined, create: string, extra: Review = {}): Review => ({
  reviewId: id, name: `accounts/1234567890/locations/9876543210/reviews/${id}`,
  reviewer: { displayName: "Jane Example", isAnonymous: false },
  starRating: stars, comment, createTime: create, updateTime: create, ...extra,
});

/** A fake world: Google (two pages) + PostgREST with an in-memory store. */
function world(opts: { reviews?: Review[]; tokenFail?: boolean; page2Fail?: boolean; upsertFail?: boolean; avg?: number; total?: number } = {}) {
  const reviews = opts.reviews ?? [
    R("r1", "FIVE", "Fantastic job on our south-facing windows. The house is noticeably cooler.", "2026-09-01T10:00:00Z"),
    R("r2", "FOUR", "Good work, tidy install.", "2026-08-15T10:00:00Z", { reviewReply: { comment: "Thank you!", updateTime: "2026-08-16T10:00:00Z" } }),
    R("r3", "FIVE", undefined, "2026-07-01T10:00:00Z"),                                   // no comment: stored, not displayed
    R("r4", "THREE", "Fine.", "2026-06-01T10:00:00Z", { reviewer: { isAnonymous: true } }),  // anonymous
    R("r5", "STAR_RATING_UNSPECIFIED", "???", "2026-05-01T10:00:00Z"),                    // unusable: skipped
  ];
  const store = new Map<string, Record<string, unknown>>();
  let summary: Record<string, unknown> = { id: 1 };
  const calls: { url: string; method: string; headers: Record<string, string>; body?: string }[] = [];
  const avg = opts.avg ?? 4.7, total = opts.total ?? reviews.length;

  const fetchFn: Fetch = async (url, init = {}) => {
    const method = (init.method || "GET").toUpperCase();
    const headers = Object.fromEntries(Object.entries((init.headers || {}) as Record<string, string>).map(([k, v]) => [k.toLowerCase(), v]));
    calls.push({ url, method, headers, body: typeof init.body === "string" ? init.body : undefined });
    const res = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

    if (url.startsWith("https://oauth2.googleapis.com/token")) {
      if (opts.tokenFail) return res(400, { error: "invalid_grant", error_description: "Token has been expired or revoked." });
      assertStringIncludes(init.body as string, "grant_type=refresh_token");
      return res(200, { access_token: "ya29.fake-access-token", expires_in: 3599 });
    }
    if (url.includes("/v4/accounts/1234567890/locations/9876543210/reviews")) {
      assertEquals(headers.authorization, "Bearer ya29.fake-access-token");
      const u = new URL(url);
      if (!u.searchParams.get("pageToken")) return res(200, { reviews: reviews.slice(0, 3), averageRating: avg, totalReviewCount: total, nextPageToken: "p2" });
      if (opts.page2Fail) return res(503, { error: { message: "backend unavailable" } });
      return res(200, { reviews: reviews.slice(3), averageRating: avg, totalReviewCount: total });
    }
    if (url.includes("mybusinessbusinessinformation.googleapis.com/v1/locations/9876543210?readMask=metadata")) {
      return res(200, { name: "locations/9876543210", metadata: { placeId: "ChIJplaceid", mapsUri: "https://maps.google.com/?cid=1", newReviewUri: "https://search.google.com/local/writereview?placeid=ChIJplaceid" } });
    }
    // ---- fake PostgREST ----
    if (url.startsWith(ENV.SUPABASE_URL + "/rest/v1/")) {
      assertEquals(headers.apikey, ENV.SUPABASE_SERVICE_ROLE_KEY, "writes must use the service role key");
      const u = new URL(url);
      const merge = (headers.prefer || "").includes("resolution=merge-duplicates");
      if (u.pathname.endsWith("/google_reviews") && method === "POST") {
        if (opts.upsertFail) return res(500, { message: "boom" });
        const rows = JSON.parse(init.body as string) as Record<string, unknown>[];
        for (const row of rows) {
          const key = String(row.google_review_id);
          if (store.has(key) && !(merge && u.searchParams.get("on_conflict") === "google_review_id")) {
            return res(409, { code: "23505", message: 'duplicate key value violates unique constraint "google_reviews_pkey"' });
          }
          store.set(key, { ...(store.get(key) || {}), ...row });
        }
        return res(201, null);
      }
      if (u.pathname.endsWith("/rpc/google_reviews_mark_missing") && method === "POST") {
        const { p_seen, p_synced_at } = JSON.parse(init.body as string);
        let n = 0;
        for (const [k, row] of store) if (!row.deleted_at && !p_seen.includes(k)) { row.deleted_at = p_synced_at; n++; }
        return res(200, n);
      }
      if (u.pathname.endsWith("/google_review_summary") && method === "POST") {
        const row = JSON.parse(init.body as string);
        if (!merge || u.searchParams.get("on_conflict") !== "id") return res(409, { message: "duplicate key (summary)" });
        summary = { ...summary, ...row };
        return res(201, null);
      }
    }
    return res(404, { error: "unexpected url " + url });
  };
  return { fetchFn, store, summary: () => summary, calls };
}

Deno.test("star enum mapping and review mapping", () => {
  assertEquals([starToInt("ONE"), starToInt("FIVE"), starToInt("STAR_RATING_UNSPECIFIED"), starToInt(undefined)], [1, 5, null, null]);
  const row = mapReview(R("x", "FOUR", "  Great  ", "2026-01-01T00:00:00Z", { reviewer: { displayName: "  Bob  ", isAnonymous: false } }), "2026-10-07T00:00:00Z")!;
  assertEquals([row.reviewer_name, row.star_rating, row.comment, row.deleted_at], ["Bob", 4, "  Great  ", null]);   // comment never rewritten, only capped
  assertEquals(mapReview(R("y", "FIVE", "ok", "2026-01-01T00:00:00Z", { reviewer: { displayName: "Should Not Show", isAnonymous: true } }), "t")!.reviewer_name, "A Google user");
  assertEquals(mapReview(R("", "FIVE", "ok", "2026-01-01T00:00:00Z"), "t"), null);
});

Deno.test("full sync: two pages, upsert, summary from Google's own aggregate, metadata", async () => {
  const w = world();
  const r = await runSync(ENV, w.fetchFn, () => new Date("2026-10-07T12:00:00Z"));
  assertEquals(r.ok, true, r.error);
  assertEquals([r.pages, r.fetched, r.upserted, r.softDeleted], [2, 5, 4, 0]);     // r5 (unspecified stars) skipped
  assertEquals(w.store.size, 4);
  assertEquals(w.store.get("r2")!.reply_comment, "Thank you!");
  assertEquals(w.store.get("r4")!.reviewer_name, "A Google user");
  const s = w.summary();
  assertEquals([s.average_rating, s.total_review_count, s.last_sync_status, s.last_error, s.place_id], [4.7, 5, "ok", null, "ChIJplaceid"]);
  assertEquals(s.last_synced_at, "2026-10-07T12:00:00.000Z");
  // every upsert asked for idempotent semantics
  const ups = w.calls.filter((c) => c.url.includes("/google_reviews?"));
  assert(ups.length >= 1);
  for (const c of ups) { assertStringIncludes(c.url, "on_conflict=google_review_id"); assertStringIncludes(c.headers.prefer, "resolution=merge-duplicates"); }
});

Deno.test("repeated syncs do not duplicate reviews", async () => {
  const w = world();
  await runSync(ENV, w.fetchFn, () => new Date("2026-10-07T00:00:00Z"));
  const r2 = await runSync(ENV, w.fetchFn, () => new Date("2026-10-07T12:00:00Z"));
  const r3 = await runSync(ENV, w.fetchFn, () => new Date("2026-10-08T00:00:00Z"));
  assertEquals([r2.ok, r3.ok], [true, true]);
  assertEquals(w.store.size, 4, "three syncs, still four rows");
  assertEquals(w.store.get("r1")!.synced_at, "2026-10-08T00:00:00.000Z");
  assertEquals(w.calls.filter((c) => c.url.includes("/google_reviews?")).every((c) => c.headers.prefer.includes("merge-duplicates")), true);
});

Deno.test("a review Google stops returning is soft-deleted; it is revived if it comes back", async () => {
  const full = world();
  await runSync(ENV, full.fetchFn, () => new Date("2026-10-07T00:00:00Z"));
  // same store, but Google now returns everything except r2
  const fewer = world({ reviews: [R("r1", "FIVE", "Fantastic.", "2026-09-01T10:00:00Z"), R("r3", "FIVE", undefined, "2026-07-01T10:00:00Z"), R("r4", "THREE", "Fine.", "2026-06-01T10:00:00Z")], total: 3 });
  for (const [k, v] of full.store) fewer.store.set(k, v);
  const r = await runSync(ENV, fewer.fetchFn, () => new Date("2026-10-07T12:00:00Z"));
  assertEquals([r.ok, r.softDeleted], [true, 1]);
  assertEquals(fewer.store.get("r2")!.deleted_at, "2026-10-07T12:00:00.000Z");
  assertEquals(fewer.store.get("r1")!.deleted_at, null);
  // ...and back again
  const again = world();
  for (const [k, v] of fewer.store) again.store.set(k, v);
  await runSync(ENV, again.fetchFn, () => new Date("2026-10-08T00:00:00Z"));
  assertEquals(again.store.get("r2")!.deleted_at, null, "upsert revives a returned review");
});

Deno.test("Google OAuth failure: cached rows untouched, nothing soft-deleted, summary records the error without secrets", async () => {
  const w = world();
  await runSync(ENV, w.fetchFn, () => new Date("2026-10-07T00:00:00Z"));          // seed the cache
  const before = JSON.stringify([...w.store]);
  const broken = world({ tokenFail: true });
  for (const [k, v] of w.store) broken.store.set(k, v);
  const r = await runSync(ENV, broken.fetchFn, () => new Date("2026-10-07T12:00:00Z"));
  assertEquals(r.ok, false);
  assertStringIncludes(r.error!, "invalid_grant");
  assertEquals(JSON.stringify([...broken.store]), before, "cache intact");
  assertEquals(broken.calls.some((c) => c.url.includes("mark_missing")), false, "never soft-deletes on failure");
  assertEquals(broken.calls.some((c) => c.url.includes("/google_reviews?")), false, "no upsert on failure");
  const s = broken.summary();
  assertEquals([s.last_sync_status, s.last_attempt_at], ["error", "2026-10-07T12:00:00.000Z"]);
  assertEquals("last_synced_at" in s, false, "last_synced_at is NOT written on failure");
  for (const secret of [ENV.GOOGLE_CLIENT_SECRET, ENV.GOOGLE_REFRESH_TOKEN, ENV.SUPABASE_SERVICE_ROLE_KEY]) {
    assertEquals(String(s.last_error).includes(secret), false);
    assertEquals(String(r.error).includes(secret), false);
  }
});

Deno.test("Google fails on page 2: incomplete listing -> no upsert, no soft-delete, error recorded", async () => {
  const w = world({ page2Fail: true });
  const r = await runSync(ENV, w.fetchFn);
  assertEquals(r.ok, false);
  assertStringIncludes(r.error!, "HTTP 503");
  assertEquals(w.store.size, 0);
  assertEquals(w.calls.some((c) => c.url.includes("mark_missing")), false);
  assertEquals(w.summary().last_sync_status, "error");
});

Deno.test("Supabase write failure: soft-delete is never attempted after a failed upsert", async () => {
  const w = world({ upsertFail: true });
  const r = await runSync(ENV, w.fetchFn);
  assertEquals(r.ok, false);
  assertStringIncludes(r.error!, "supabase upsert reviews failed");
  assertEquals(w.calls.some((c) => c.url.includes("mark_missing")), false);
});

Deno.test("sanitise() redacts credentials; checkEnv() rejects resource-name IDs", () => {
  const msg = sanitise("token " + ENV.GOOGLE_REFRESH_TOKEN + " secret " + ENV.GOOGLE_CLIENT_SECRET + " Bearer ya29.abc.def", ENV);
  assertEquals(msg.includes(ENV.GOOGLE_REFRESH_TOKEN) || msg.includes(ENV.GOOGLE_CLIENT_SECRET) || msg.includes("ya29.abc"), false);
  assertEquals(checkEnv(ENV), []);
  const bad = checkEnv({ ...ENV, GOOGLE_BUSINESS_ACCOUNT_ID: "accounts/1234567890", GOOGLE_REFRESH_TOKEN: "" });
  assertEquals(bad.some((m) => m.startsWith("GOOGLE_BUSINESS_ACCOUNT_ID")), true);
  assertEquals(bad.includes("GOOGLE_REFRESH_TOKEN"), true);
});
