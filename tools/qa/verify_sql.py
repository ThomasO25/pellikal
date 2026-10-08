"""Runs the Google-reviews SQL against a REAL PostgreSQL and checks what anon
can and cannot do, that the migration is idempotent, that upserts do not
duplicate, and that the cron file refuses to run with its placeholder.

Needs: psql on PATH and a PostgreSQL you may create a database in.
    PELLIKAL_TEST_DSN=postgresql://postgres@127.0.0.1:5432/postgres python3 tools/qa/verify_sql.py
(default DSN below is the throwaway cluster used in the sandbox). The Supabase
roles anon / authenticated / service_role and stub cron + vault schemas are
created in a scratch database `pellikal_qa`, which is dropped and recreated.
"""
import os, re, subprocess, sys

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
DSN = os.environ.get("PELLIKAL_TEST_DSN", "postgresql://postgres@127.0.0.1:54329/postgres")
QA_DB = "pellikal_qa"
results = []


def check(label, got, want):
    ok = got == want
    results.append(ok)
    print(("  PASS  " if ok else "  FAIL  ") + label)
    if not ok:
        print("          expected: {!r}".format(want))
        print("          actual:   {!r}".format(got))


def psql(sql, db=None, stop=True):
    dsn = DSN if db is None else re.sub(r"/[^/?]*(\?|$)", "/" + db + r"\1", DSN)
    args = ["psql", dsn, "-X", "-q", "-tA", "-c", sql] if "\n" not in sql else ["psql", dsn, "-X", "-q", "-tA"]
    if stop:
        args.insert(2, "-v"); args.insert(3, "ON_ERROR_STOP=1")
    p = subprocess.run(args, input=None if "\n" not in sql else sql, capture_output=True, text=True)
    return p.returncode, p.stdout.strip(), p.stderr.strip()


def must(sql, db=QA_DB):
    rc, out, err = psql(sql, db)
    if rc != 0:
        raise SystemExit("SQL failed:\n" + sql[:400] + "\n" + err)
    return out


def read(rel):
    return open(os.path.join(ROOT, rel), encoding="utf-8").read()


STUBS = """
create extension if not exists pgcrypto;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin bypassrls; end if;
end $$;
grant usage on schema public to anon, authenticated, service_role;
-- Supabase's default privileges: every NEW table in public is readable AND writable
-- by anon/authenticated unless a migration revokes it - so the revoke in 0004 is real.
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on functions to anon, authenticated, service_role;
-- stand-ins for Supabase's pg_cron / Vault (the real ones exist only on Supabase)
create schema if not exists cron;
create table if not exists cron.job (jobid bigserial primary key, jobname text unique, schedule text, command text, active boolean default true);
create or replace function cron.schedule(name text, sched text, cmd text) returns bigint language sql as
  $f$ insert into cron.job (jobname, schedule, command) values (name, sched, cmd) returning jobid $f$;
create or replace function cron.unschedule(name text) returns boolean language sql as
  $f$ delete from cron.job where jobname = name returning true $f$;
create schema if not exists vault;
create table if not exists vault.secrets (id uuid primary key default gen_random_uuid(), name text unique, secret text, description text);
create or replace function vault.create_secret(s text, n text, d text) returns uuid language sql as
  $f$ insert into vault.secrets (secret, name, description) values (s, n, d) returning id $f$;
create or replace function vault.update_secret(i uuid, s text, n text, d text) returns void language sql as
  $f$ update vault.secrets set secret = s, name = n, description = d where id = i $f$;
create or replace view vault.decrypted_secrets as select id, name, secret as decrypted_secret from vault.secrets;
"""


def run():
    rc, out, err = psql("select 1")
    if rc != 0:
        print("  SKIP  no PostgreSQL at " + DSN + " (" + err.splitlines()[-1] if err else "" + ")")
        return 0
    print("\n=== 0. SCRATCH DATABASE ===")
    psql("drop database if exists " + QA_DB)
    rc, out, err = psql("create database " + QA_DB)
    check("scratch database created", rc, 0)
    must(STUBS)

    print("\n=== 1. MIGRATION 0004 - applies, and applies again ===")
    mig = read("supabase/migrations/0004_google_reviews.sql")
    errs = lambda e: [l for l in e.splitlines() if l.startswith("ERROR")]
    rc1, _, err1 = psql(mig, QA_DB)
    check("first run succeeds", [rc1, errs(err1)], [0, []])
    rc2, _, err2 = psql(mig, QA_DB)
    check("second run succeeds (idempotent, non-destructive)", [rc2, errs(err2)], [0, []])
    check("summary row seeded, status 'never', nothing synced", must("select last_sync_status || ':' || coalesce(last_synced_at::text,'null') from public.google_review_summary"), "never:null")

    print("\n=== 2. WHAT THE WEBSITE (anon) CAN AND CANNOT DO ===")
    must("""set role service_role;
      insert into public.google_reviews (google_review_id, reviewer_name, star_rating, comment, create_time, update_time) values
        ('r1','Maria Santos',5,'Great job.','2026-09-28T14:00:00Z','2026-09-28T14:00:00Z'),
        ('r2','Gone Person',4,'Old review','2026-08-01T14:00:00Z','2026-08-01T14:00:00Z');
      update public.google_reviews set deleted_at = now() where google_review_id = 'r2';
      insert into public.google_review_summary (id, average_rating, total_review_count, last_synced_at, last_sync_status, last_error)
        values (1, 4.9, 23, now(), 'ok', 'secret-ish detail') on conflict (id) do update set average_rating = 4.9, total_review_count = 23, last_synced_at = now(), last_sync_status = 'ok', last_error = 'secret-ish detail';
      reset role;""")
    check("anon reads the display columns of the summary", must("set role anon; select average_rating || '/' || total_review_count from public.google_review_summary;"), "4.9/23")
    rc, out, err = psql("set role anon; select last_error from public.google_review_summary;", QA_DB)
    check("anon CANNOT read last_error (column not granted)", [rc != 0, "permission denied" in err], [True, True])
    check("anon sees only non-deleted reviews, display columns", must("set role anon; select string_agg(google_review_id || ':' || reviewer_name || ':' || star_rating, ',') from public.google_reviews;"), "r1:Maria Santos:5")
    rc, out, err = psql("set role anon; select deleted_at from public.google_reviews;", QA_DB)
    check("anon CANNOT read deleted_at / synced_at / review_name", [rc != 0, "permission denied" in err], [True, True])
    for stmt, label in [("insert into public.google_reviews (google_review_id, star_rating, create_time, update_time) values ('x',5,now(),now())", "insert"),
                        ("update public.google_reviews set star_rating = 1", "update"), ("delete from public.google_reviews", "delete"),
                        ("update public.google_review_summary set average_rating = 1", "update summary")]:
        rc, out, err = psql("set role anon; " + stmt + ";", QA_DB)
        check("anon CANNOT " + label, [rc != 0, "permission denied" in err or "violates row-level security" in err], [True, True])
    rc, out, err = psql("set role anon; select public.google_reviews_mark_missing(array['r1']);", QA_DB)
    check("anon CANNOT call google_reviews_mark_missing()", [rc != 0, "permission denied" in err], [True, True])
    check("nothing changed through those attempts", must("select count(*) || ':' || (select average_rating from public.google_review_summary) from public.google_reviews"), "2:4.9")

    print("\n=== 3. SERVICE ROLE: idempotent upsert, soft-delete, revival ===")
    up = """set role service_role;
      insert into public.google_reviews (google_review_id, reviewer_name, star_rating, comment, create_time, update_time, synced_at, deleted_at)
        values ('r1','Maria Santos',5,'Great job.','2026-09-28T14:00:00Z','2026-09-28T14:00:00Z', now(), null),
               ('r2','Gone Person',4,'Old review','2026-08-01T14:00:00Z','2026-08-01T14:00:00Z', now(), null)
      on conflict (google_review_id) do update set reviewer_name = excluded.reviewer_name, star_rating = excluded.star_rating, comment = excluded.comment,
        update_time = excluded.update_time, synced_at = excluded.synced_at, deleted_at = null;
      reset role;"""
    must(up); must(up); must(up)
    check("three upserts of the same two reviews -> still two rows, r2 revived", must("select count(*) || ':' || count(*) filter (where deleted_at is null) from public.google_reviews"), "2:2")
    check("mark_missing soft-deletes what Google no longer returns", must("set role service_role; select public.google_reviews_mark_missing(array['r1'], now());"), "1")
    check("...and the site no longer sees it", must("set role anon; select string_agg(google_review_id, ',') from public.google_reviews;"), "r1")

    print("\n=== 4. CRON FILE: refuses to run with the placeholder, works once replaced ===")
    cron_sql = read("supabase/sql/schedule_google_reviews_sync.sql")
    check("the quoted placeholder value appears exactly once, on the REPLACE line", [cron_sql.count("'<SYNC_SECRET>'"), "'<SYNC_SECRET>';   -- <<< REPLACE" in cron_sql], [1, True])
    rc, out, err = psql(cron_sql.replace("create extension if not exists pg_cron;", "").replace("create extension if not exists pg_net;", ""), QA_DB)
    check("UNREPLACED placeholder -> the file raises a clear exception", [rc != 0, "placeholder has not been replaced" in err, "paste the real SYNC_SECRET" in err], [True, True, True])
    check("...and created no job and no vault secret", must("select (select count(*) from cron.job) || ':' || (select count(*) from vault.secrets)"), "0:0")
    real = cron_sql.replace("'<SYNC_SECRET>'", "'" + "a" * 40 + "'").replace("create extension if not exists pg_cron;", "").replace("create extension if not exists pg_net;", "")
    rc, out, err = psql(real, QA_DB)
    check("replaced -> runs clean", [rc, errs(err)], [0, []])
    check("job scheduled every 12 h; the job text holds the Vault lookup, NOT the secret", must("select schedule || '|' || (command like '%vault.decrypted_secrets%') || '|' || (command like '%" + "a" * 40 + "%') from cron.job where jobname = 'sync-google-reviews'"), "17 3,15 * * *|true|false")
    check("secret stored in Vault under the expected name", must("select name || ':' || length(decrypted_secret) from vault.decrypted_secrets"), "sync_google_reviews_secret:40")
    rc, out, err = psql(real, QA_DB)
    check("re-running replaces (one job, one secret, no duplicates)", [rc, must("select (select count(*) from cron.job) || ':' || (select count(*) from vault.secrets)")], [0, "1:1"])
    short = cron_sql.replace("'<SYNC_SECRET>'", "'tooshort'").replace("create extension if not exists pg_cron;", "").replace("create extension if not exists pg_net;", "")
    rc, out, err = psql(short, QA_DB)
    check("a secret shorter than 16 characters is also refused", [rc != 0, "shorter than 16" in err], [True, True])

    psql("drop database if exists " + QA_DB)
    print("\n" + "=" * 60)
    print("  {} passed / {} failed  (of {})".format(sum(results), len(results) - sum(results), len(results)))
    print("=" * 60)
    return 0 if all(results) else 1


if __name__ == "__main__":
    raise SystemExit(run())
