# DATA-MODEL.md

What lives in Supabase, what lives in the repo, and why.

Authoritative schema: **`supabase/migrations/0001_pellikal_cms.sql`**

---

## The split

| Data | Home | Why |
|---|---|---|
| Projects, gallery photos, testimonials, a few headline strings | **Supabase** | Changes often; the owner must edit it without touching code |
| Phone, email, service area, menu, page list, Google IDs | **`site.config.json`** | Generates links, metadata and structured data across every page |
| Page copy, layout, images shipped with the site | **Repo HTML** | Static fallback; must render with no database at all |

### Why phone/email/service area are *not* in the CMS

The phone number appears as `tel:` and `sms:` links, visible text, two meta
descriptions, JSON-LD `telephone`, and fallback strings inside `js/main.js`.
A runtime CMS edit could only ever change the handful of spots the JavaScript
touches — leaving structured data and meta tags stale. That is worse than not
offering the control.

They are build-time instead: edit `site.config.json`, run
`python3 tools/build.py`, and **every** occurrence updates together.

The admin controls for these were **removed** in this pass because the public
site never read them. See `ADMIN-RUNBOOK.md`.

---

## Tables

### `app_admins`
The allow-list. `user_id` → `auth.users(id)`. Membership is the *only* thing
that grants write access. Not writable through the API at all.

| Column | Notes |
|---|---|
| `user_id` | PK, FK to auth.users, cascade on delete |
| `email_note` | human label only — **never** used for authorisation |
| `added_by`, `created_at` | provenance |

### `site_content`
Short editable strings, keyed by the `data-content` attribute on public pages.

Keys the public site actually consumes: `hero_headline`, `hero_subtitle`,
`selectpro_text`, `cta_headline`, `cta_text`, `about_title`, `about_intro`.

> If you add a key here, add a matching `data-content="…"` element to a page,
> or nothing will show. The CMS exposes the five homepage keys; `about_title`
> and `about_intro` are consumed by the About page but are currently edited in
> the HTML.

### `projects`
Case studies. `featured` = show on the homepage. `is_published` = visible at
all. `sort_order` ascending. `image_url` + `image_path` (the Storage object, so
deletes can clean up). `alt_text` for accessibility.

### `gallery_images`
Standalone photos. Same publish/sort/alt pattern.

### `testimonials`
`quote`, `author`, optional `location` and `source`. **Real customers only** —
a policy the CMS states but a human must honour.

### `admin_audit_log`
Append-only: `actor`, `action`, `entity`, `record_id`, `created_at`. Written by
triggers, readable only by admins, writable by nobody through the API.

---

## Publishing flags

Two independent switches on projects and gallery items:

- **`is_published`** — off means the public never sees it, anywhere.
- **`featured`** — on means it is eligible for the homepage.

**The homepage holds at most six.** It queries `is_published = true AND
featured = true`, ordered by `sort_order` ascending, limited to 6 — all
server-side. So the seventh featured project is queued, not shown; give it a
lower `sort_order` to promote it. Unfeature one of the six and the next in
order takes its place automatically.

This deliberately keeps the homepage to six cards rather than growing to twenty
as projects accumulate. A future "Our Work" page can list every published
project without changing this.

Public queries filter `is_published = true` in the client *and* RLS enforces it
server-side, so an unpublished row cannot leak even if the query changed.

---

## Static fallback — the rule that must not break

Every public section that Supabase can fill **already contains real HTML**.
The JavaScript only ever *replaces* that content when a query returns rows:

```js
if (res.error || !res.data || !res.data.length) return;   // keep static fallback
```

So if Supabase is empty, slow, blocked by an extension, or down, the site looks
exactly as it does today. Never change these loaders to clear a container
before the data arrives.
