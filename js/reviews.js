/* =============================================================
   PELLIKAL — reviews.js
   Shows REAL Google Business Profile reviews, read from Supabase.

   WHERE THE DATA COMES FROM
     Google Business Profile API -> Edge Function sync-google-reviews
     (server side, every 12 h) -> Supabase tables -> this file.
     The browser NEVER talks to Google. It reads two small, cached rows
     from Supabase with the public ANON key, read-only (RLS + column
     grants: display columns of non-deleted reviews, nothing else).

   TWO REQUESTS, TWO SPEEDS (CRO)
     1. google_review_summary - tiny - sent IMMEDIATELY when this
        deferred script runs (the DOM is parsed by then, DOMContentLoaded
        has not fired yet). It reveals the hero proof line
        "★★★★★ 4.9 on Google · 23 Google reviews" as early as possible.
     2. google_reviews - the cards - sent after the load event, when the
        browser is idle. Review sections are revealed only then.
     The hero, the form and the rest of the page never wait for either:
     both are asynchronous and every failure is swallowed. The elements
     this file fills ship with the `hidden` attribute.

   BOOTSTRAP FALLBACK (temporary, documented in site.config.json)
     BEFORE the first successful sync (the Business Profile API is not
     approved yet) a verified temporary snapshot and verified review
     cards may be displayed: the build stamps a verified rating/count
     snapshot into data-greviews-fallback-* attributes, and three verified
     review cards (copied by hand from the Google profile, verbatim) into
     a JSON block inside each review section. They are used ONLY when
     Supabase POSITIVELY says no successful sync exists (see loadSummary:
     a summary row with no last_synced_at, no row at all, or PostgREST's
     own "table not found" error for google_review_summary): the trust
     line shows the snapshot and the sections show the three cards,
     labelled "Featured Google Reviews" (they were chosen, so they are
     not called "most recent"). AFTER the first successful sync, live
     Supabase data replaces ALL of it - summary and cards - completely
     and the fallback is never used again; the two sources are never
     mixed. Any other answer (network failure, 400, 401/403, an unrelated
     404, 406, 5xx, an unexpected body) shows nothing - the fallback must
     never mask a real Supabase configuration problem. Everything
     rendered from the fallback carries data-greviews-source="fallback"
     (live: "live") - internal metadata only. This file never writes
     anywhere.

   WHAT IT NEVER DOES
     - invent, rewrite, trim, reorder-for-effect or "improve" a review,
       a name, a rating or a count. Cards are the newest WRITTEN reviews,
       strictly by create_time, whatever their star rating; the text is
       rendered with textContent exactly as Google returned it.
     - decide what a review is "about". No keyword guessing: no review is
       ever labelled a commercial (or residential) project.
     - show anything that is not real: live synced data, or the verified
       snapshot/cards above while no sync exists. No placeholders.
     - send anything personal anywhere. The only analytics it emits is
       the diagnostic google_reviews_click (cta_location + page_type).

   HOOKS (markup)
     [data-greviews-section]            an element to reveal
        data-greviews-role="proof"      the hero trust line - revealed by
                                        the summary (live or fallback)
        (no role)                       a review section - revealed once
                                        cards are in (live, or the verified
                                        fallback cards while no sync exists)
     [data-greviews="stars"|"rating"|"count"|"cards"|"synced"]
     [data-greviews="link"]             "Read all reviews on Google" anchors
                                        (new tab, rel="noopener noreferrer")
     [data-greviews="proof-link"]       the count in the hero: jumps to the
                                        on-page section when live; with
                                        the fallback it links to the
                                        configured Google URL (new tab),
                                        or is plain text if there is none
     data-greviews-max="3"              max cards
     data-greviews-url="..."            the configured PUBLIC Google listing
                                        URL (site.config.json ->
                                        business.googleReviewsUrl);
                                        REPLACE_… = not configured
     data-greviews-fallback-rating / -count / -asof   stamped by the build

   "ALL REVIEWS" LINK - in this order
     1. the configured URL (site.config.json -> business.googleReviewsUrl)
     2. Google's own metadata.mapsUri, synced into the summary row
     3. a URL built from the synced placeId (undocumented pattern; last resort)
   ============================================================= */
(function () {
  "use strict";

  var CFG = window.PELLIKAL_CONFIG || {};
  var BASE = String(CFG.SUPABASE_URL || "").replace(/\/+$/, "");
  var KEY = String(CFG.SUPABASE_ANON_KEY || "");
  var all = Array.prototype.slice.call(document.querySelectorAll("[data-greviews-section]"));
  if (!all.length) return;
  if (!/^https:\/\/[a-z0-9-]+\.supabase\.co$/.test(BASE) || !KEY) return;   // not configured: everything stays hidden

  var proofs = all.filter(function (e) { return e.getAttribute("data-greviews-role") === "proof"; });
  var sections = all.filter(function (e) { return e.getAttribute("data-greviews-role") !== "proof"; });
  var CACHE_SUMMARY = "pellikal_greviews_summary_v2";
  var CACHE_LIST = "pellikal_greviews_list_v2";
  var CACHE_MS = 15 * 60 * 1000;

  function $(s, r) { return (r || document).querySelector(s); }
  function $$(s, r) { return Array.prototype.slice.call((r || document).querySelectorAll(s)); }
  function el(tag, cls, text) { var n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n; }
  function clear(n) { while (n && n.firstChild) n.removeChild(n.firstChild); }
  function pageType() {   // "home" | "residential" | "commercial" | ... - a fixed vocabulary from the path, never typed
    var seg = location.pathname.split("/").filter(Boolean)[0] || "";
    seg = seg.replace(/\.html$/, "").replace(/[^a-z0-9_-]/gi, "").slice(0, 40);
    return seg && seg !== "index" ? seg : "home";
  }
  function configuredUrl() {
    for (var i = 0; i < all.length; i++) {
      var u = all[i].getAttribute("data-greviews-url") || "";
      if (/^https:\/\//.test(u) && u.indexOf("REPLACE") === -1) return u;
    }
    return "";
  }

  /* ---------- storage (sessionStorage, 15 min, never required) ---------- */
  function readCache(key) {
    try { var c = JSON.parse(sessionStorage.getItem(key) || "null"); return c && typeof c.t === "number" && Date.now() - c.t <= CACHE_MS ? c.v : null; } catch (e) { return null; }
  }
  function writeCache(key, v) { try { sessionStorage.setItem(key, JSON.stringify({ t: Date.now(), v: v })); } catch (e) {} }

  /* ---------- data ---------- */
  function rest(path) {
    return fetch(BASE + "/rest/v1/" + path, {
      headers: { apikey: KEY, Authorization: "Bearer " + KEY, Accept: "application/json" },
      credentials: "omit"
    });
  }

  /* The body of a response as JSON, or null when it is not JSON (an HTML
     error page from a gateway, an empty body). Never throws. */
  function bodyJson(r) {
    return r.text().then(function (t) { try { return JSON.parse(t); } catch (e) { return null; } });
  }

  /* The ONE 404 that means "google_review_summary has not been created yet":
     PostgREST itself says so in the body, naming this table. Read the body -
     the status alone is not enough (a wrong project URL, a paused project or
     a gateway also answer 404).
       PostgREST 12+ (what Supabase runs; the table is not in its schema cache):
         404  {"code":"PGRST205","message":"Could not find the table
               'public.google_review_summary' in the schema cache", ...}
       older PostgREST (PostgreSQL's own error, passed through):
         404  {"code":"42P01","message":"relation \"public.google_review_summary\"
               does not exist", ...}
     Both the code AND the table name must match - a 404 for anything else
     is a real problem. */
  function isMissingSummaryTable(status, body) {
    if (status !== 404 || !body || typeof body !== "object" || Array.isArray(body)) return false;
    var code = String(body.code || ""), msg = String(body.message || "");
    return (code === "PGRST205" || code === "42P01") && /\bgoogle_review_summary\b/.test(msg);
  }

  /* Resolves to { state: "live" | "nosync" | "unavailable", summary }.
       live        a successful sync exists (last_synced_at set, usable
                   numbers) -> its numbers
       nosync      Supabase POSITIVELY said no successful sync exists yet:
                   2xx with no row / a row whose last_synced_at is null, or
                   PostgREST's missing-table error for this table (above)
                   -> the bootstrap fallback may be used
       unavailable anything else -> show nothing, never the fallback:
                   network failure, 400 (malformed request), 401/403
                   (key / permission problem), any other 404, 406, 5xx,
                   a 2xx whose body is not a row set, a successful sync
                   with no usable numbers. The fallback must never hide a
                   real configuration problem. */
  function loadSummary() {
    var cached = readCache(CACHE_SUMMARY);
    if (cached && cached.state === "live") return Promise.resolve(cached);
    var NOSYNC = { state: "nosync", summary: null }, UNAVAILABLE = { state: "unavailable", summary: null };
    return rest("google_review_summary?select=average_rating,total_review_count,place_id,maps_uri,new_review_uri,last_synced_at&id=eq.1")
      .then(function (r) {
        return bodyJson(r).then(function (body) {
          if (r.ok) {
            if (!Array.isArray(body)) return UNAVAILABLE;                        // 2xx, but not a PostgREST row set
            var s = body[0] && typeof body[0] === "object" ? body[0] : null;
            if (!s || !s.last_synced_at) return NOSYNC;                           // table exists, nothing synced yet
            var rating = Number(s.average_rating), count = parseInt(s.total_review_count, 10);
            if (!(isFinite(rating) && rating > 0 && count > 0)) return UNAVAILABLE;   // synced, but nothing usable - never fall back over synced data
            return { state: "live", summary: s };
          }
          return isMissingSummaryTable(r.status, body) ? NOSYNC : UNAVAILABLE;
        });
      })
      .then(function (res) { if (res.state === "live") writeCache(CACHE_SUMMARY, res); return res; })
      .catch(function () { return UNAVAILABLE; });   // network failure
  }

  function loadReviews() {
    var cached = readCache(CACHE_LIST);
    if (cached) return Promise.resolve(cached);
    return rest("google_reviews?select=google_review_id,reviewer_name,is_anonymous,star_rating,comment,create_time,update_time&comment=not.is.null&order=create_time.desc&limit=24")
      .then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.json(); })
      .then(function (rows) { rows = Array.isArray(rows) ? rows : []; writeCache(CACHE_LIST, rows); return rows; });
  }

  /* ---------- formatting ---------- */
  function clampInt(v, lo, hi, dflt) { v = parseInt(v, 10); return isNaN(v) ? dflt : Math.max(lo, Math.min(hi, v)); }
  function starsText(rating) {
    var n = Math.max(0, Math.min(5, Math.round(Number(rating) || 0)));
    return "★★★★★".slice(0, n) + "☆☆☆☆☆".slice(0, 5 - n);
  }
  function fillStars(node, rating, label) { if (!node) return; node.textContent = starsText(rating); node.setAttribute("role", "img"); node.setAttribute("aria-label", label); }
  function fmtRating(r) { var n = Number(r); return isFinite(n) ? (Math.round(n * 10) / 10).toFixed(1) : ""; }
  function parseWhen(v) {
    v = String(v || "");
    return Date.parse(/^\d{4}-\d{2}-\d{2}$/.test(v) ? v + "T12:00:00" : v);   // a bare date = that calendar day, locally
  }
  function relTime(iso) {
    var t = parseWhen(iso); if (isNaN(t)) return "";
    var d = Math.max(0, Math.floor((Date.now() - t) / 86400000));
    if (d < 1) return "today";
    if (d < 7) return d + (d === 1 ? " day ago" : " days ago");
    if (d < 31) { var w = Math.floor(d / 7); return w + (w === 1 ? " week ago" : " weeks ago"); }
    if (d < 365) { var m = Math.floor(d / 30); return m + (m === 1 ? " month ago" : " months ago"); }
    var dt = new Date(t);
    return ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"][dt.getMonth()] + " " + dt.getFullYear();
  }

  function reviewsUrl(summary) {
    var configured = configuredUrl();
    if (configured) return configured;                                                   // 1. verified, configured by the owner
    if (summary && /^https:\/\/(maps\.google\.com|www\.google\.com|goo\.gl|maps\.app\.goo\.gl|g\.page|search\.google\.com|business\.google\.com)\//.test(summary.maps_uri || "")) return summary.maps_uri;   // 2. Google's own URI
    if (summary && summary.place_id && /^[A-Za-z0-9_-]{10,200}$/.test(summary.place_id)) {
      return "https://search.google.com/local/reviews?placeid=" + encodeURIComponent(summary.place_id);   // 3. last resort
    }
    return "";
  }

  /* ---------- fallback (bootstrap only) ---------- */
  function fallbackFor(elm) {
    var rating = Number(elm.getAttribute("data-greviews-fallback-rating"));
    var count = parseInt(elm.getAttribute("data-greviews-fallback-count"), 10);
    if (!isFinite(rating) || rating < 1 || rating > 5 || !(count > 0)) return null;
    return { average_rating: rating, total_review_count: count, asOf: elm.getAttribute("data-greviews-fallback-asof") || "" };
  }
  /* The verified cards, from the JSON block the build stamped into the section.
     Kept in the supplied order (they were chosen for usefulness, not by date). */
  function fallbackReviewsFor(sec) {
    var node = $('script[type="application/json"][data-greviews-fallback-reviews]', sec);
    if (!node) return [];
    var rows;
    try { rows = JSON.parse(node.textContent || "[]"); } catch (e) { return []; }
    if (!Array.isArray(rows)) return [];
    var out = [];
    rows.forEach(function (r, i) {
      if (!r || typeof r !== "object") return;
      var stars = parseInt(r.star_rating, 10), text = String(r.review_text || ""), name = String(r.reviewer_name || "").trim();
      if (!name || !(stars >= 1 && stars <= 5) || !text.trim() || isNaN(parseWhen(r.review_date))) return;
      out.push({ google_review_id: "fallback-" + i, reviewer_name: name, is_anonymous: false, star_rating: stars, comment: text, create_time: String(r.review_date) });
    });
    return out;
  }

  /* ---------- selection ---------- */
  /* live: the NEWEST written reviews, strictly by create_time */
  function pick(reviews, max) {
    var ok = reviews.filter(function (r) { return String(r.comment || "").trim().length > 0; });
    ok.sort(function (a, b) { return parseWhen(b.create_time) - parseWhen(a.create_time); });
    return ok.slice(0, max);
  }

  /* ---------- rendering (DOM methods + textContent only) ---------- */
  function fillSummary(root, rating, count) {
    $$('[data-greviews="stars"]', root).forEach(function (n) { fillStars(n, rating, "Rated " + fmtRating(rating) + " out of 5 on Google"); });
    $$('[data-greviews="rating"]', root).forEach(function (n) { n.textContent = fmtRating(rating); });
    $$('[data-greviews="count"]', root).forEach(function (n) { n.textContent = String(count); });
  }

  function setLinks(root, url) {
    $$('[data-greviews="link"]', root).forEach(function (a) {
      if (url) { a.href = url; a.target = "_blank"; a.rel = "noopener noreferrer"; a.hidden = false; } else { a.hidden = true; }
    });
  }

  function card(r) {
    var fig = el("figure", "greview");
    var top = el("div", "greview__top");
    var stars = el("span", "gstars");
    fillStars(stars, r.star_rating, "Rated " + r.star_rating + " out of 5 on Google");
    top.appendChild(stars);
    top.appendChild(el("span", "greview__src", "Google review"));
    fig.appendChild(top);
    var text = String(r.comment || "");
    var q = el("blockquote", "greview__text");
    q.appendChild(el("p", null, text));
    fig.appendChild(q);
    if (text.length > 320) {
      q.classList.add("is-clamped");
      var more = el("button", "greview__more", "Read full review");
      more.type = "button"; more.setAttribute("aria-expanded", "false");
      more.addEventListener("click", function () {
        var open = q.classList.toggle("is-clamped") === false;
        more.textContent = open ? "Show less" : "Read full review";
        more.setAttribute("aria-expanded", open ? "true" : "false");
      });
      fig.appendChild(more);
    }
    var by = el("figcaption", "greview__by");
    by.appendChild(el("span", "greview__name", r.is_anonymous ? "A Google user" : String(r.reviewer_name || "A Google user")));
    var when = relTime(r.create_time);
    if (when) {
      by.appendChild(el("span", "greview__dot", "·"));
      var t = el("time", "greview__when", when);
      try { t.dateTime = /^\d{4}-\d{2}-\d{2}$/.test(String(r.create_time)) ? String(r.create_time) : new Date(r.create_time).toISOString(); } catch (e) {}
      by.appendChild(t);
    }
    fig.appendChild(by);
    return fig;
  }

  /* hero proof line: live or fallback */
  function showProof(elm, summary, source) {
    fillSummary(elm, summary.average_rating, summary.total_review_count);
    elm.setAttribute("data-greviews-source", source);
    var pl = $('[data-greviews="proof-link"]', elm);
    if (pl) {
      if (source === "live") {
        pl.href = "#google-reviews"; pl.removeAttribute("target"); pl.removeAttribute("rel"); pl.removeAttribute("data-greviews-external"); pl.classList.remove("gproof__link--static");
      } else {
        var url = configuredUrl();   // fallback: only an explicitly configured, verified URL may be linked
        if (url) { pl.href = url; pl.target = "_blank"; pl.rel = "noopener noreferrer"; pl.setAttribute("data-greviews-external", "1"); }
        else { pl.removeAttribute("href"); pl.classList.add("gproof__link--static"); }
      }
    }
    elm.hidden = false;
  }

  /* source: "live" (synced rows, newest first) or "fallback" (the verified
     cards, supplied order). One source per render - never both. */
  function showSection(sec, summary, reviews, source) {
    sec.setAttribute("data-greviews-source", source);
    fillSummary(sec, summary.average_rating, summary.total_review_count);
    $$('[data-greviews="synced"]', sec).forEach(function (n) { var w = source === "live" ? relTime(summary.last_synced_at) : ""; n.textContent = w ? "Updated " + w : ""; });
    setLinks(sec, source === "live" ? reviewsUrl(summary) : configuredUrl());   // fallback: only a configured, verified URL
    $$(".greviews__label", sec).forEach(function (n) { n.textContent = source === "live" ? "Google Reviews \u2014 most recent" : "Featured Google Reviews"; });
    var cards = $('[data-greviews="cards"]', sec);
    if (cards) {
      var max = clampInt(sec.getAttribute("data-greviews-max"), 1, 6, 3);
      var chosen = source === "live" ? pick(reviews, max) : reviews.slice(0, max);
      clear(cards);
      chosen.forEach(function (r) { var c = card(r); c.setAttribute("data-greviews-source", source); cards.appendChild(c); });
      var wrap = cards.closest("[data-greviews-cards-wrap]") || cards;
      wrap.hidden = chosen.length === 0;   // no written review yet: no cards, no filler - the summary still shows
    }
    sec.hidden = false;
  }

  /* ---------- diagnostic click event (never a conversion) ---------- */
  document.addEventListener("click", function (e) {
    var a = e.target && e.target.closest ? e.target.closest('[data-greviews="link"], [data-greviews-external]') : null;
    if (!a || !window.PELLIKAL_TRACK_EVENT) return;
    window.PELLIKAL_TRACK_EVENT("google_reviews_click", {
      cta_location: a.getAttribute("data-cta-location") || "reviews",
      page_type: pageType()
    });
  }, true);

  /* ---------- go ---------- */
  function whenIdleAfterLoad(fn) {
    function idle() { if ("requestIdleCallback" in window) window.requestIdleCallback(fn, { timeout: 2500 }); else setTimeout(fn, 150); }
    if (document.readyState === "complete") idle(); else window.addEventListener("load", idle);
  }

  // 1. The summary: NOW. A deferred script runs once the document is parsed,
  //    so the hero elements exist; the request goes out before DOMContentLoaded.
  var summaryP = loadSummary();
  summaryP.then(function (res) {
    if (res.state === "live") {
      proofs.forEach(function (p) { try { showProof(p, res.summary, "live"); } catch (e) {} });
    } else if (res.state === "nosync") {
      proofs.forEach(function (p) { try { var fb = fallbackFor(p); if (fb) showProof(p, fb, "fallback"); } catch (e) {} });
    }
    // "unavailable": nothing - no answer, or a real problem the fallback must not mask
  });

  // 2. The sections: after load, when idle. Live rows if a sync exists;
  //    otherwise the verified fallback cards (if the build stamped any).
  if (sections.length) {
    whenIdleAfterLoad(function () {
      summaryP.then(function (res) {
        if (res.state === "live") {
          return loadReviews().then(function (reviews) {
            sections.forEach(function (s) { try { showSection(s, res.summary, reviews, "live"); } catch (e) {} });
          });
        }
        if (res.state === "nosync") {
          sections.forEach(function (s) {
            try {
              var fb = fallbackFor(s), rows = fallbackReviewsFor(s);
              if (fb && rows.length) showSection(s, fb, rows, "fallback");   // no cards configured -> section stays hidden
            } catch (e) {}
          });
        }
        // "unavailable": sections stay hidden
      }).catch(function () { /* sections stay hidden */ });
    });
  }
})();
