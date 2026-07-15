-- CreateTable: ClientImportantDate (leads share Client rows — no separate leadId)
-- Non-destructive: does not drop or alter Client.important_dates JSONB.

CREATE TABLE "client_important_dates" (
    "id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "scheduled_at" TIMESTAMP(3) NOT NULL,
    "has_time" BOOLEAN NOT NULL DEFAULT false,
    "notes" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "client_id" TEXT NOT NULL,
    "created_by_user_id" TEXT,
    "updated_by_user_id" TEXT,

    CONSTRAINT "client_important_dates_pkey" PRIMARY KEY ("id")
);

-- CreateIndex (per-client ordered list + filtered calendar joins)
CREATE INDEX "client_important_dates_client_id_scheduled_at_idx"
  ON "client_important_dates"("client_id", "scheduled_at");

-- CreateIndex (global calendar month/range scans)
CREATE INDEX "client_important_dates_scheduled_at_idx"
  ON "client_important_dates"("scheduled_at");

-- AddForeignKey
ALTER TABLE "client_important_dates"
  ADD CONSTRAINT "client_important_dates_client_id_fkey"
  FOREIGN KEY ("client_id") REFERENCES "Client"("id")
  ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_important_dates"
  ADD CONSTRAINT "client_important_dates_created_by_user_id_fkey"
  FOREIGN KEY ("created_by_user_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "client_important_dates"
  ADD CONSTRAINT "client_important_dates_updated_by_user_id_fkey"
  FOREIGN KEY ("updated_by_user_id") REFERENCES "User"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

-- Session helpers for safe backfill (invalid dates become NULL instead of aborting)
CREATE OR REPLACE FUNCTION pg_temp.imp_date_only(raw text)
RETURNS date
LANGUAGE plpgsql
AS $$
DECLARE
  cleaned text;
  date_part text;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;

  cleaned := btrim(raw);
  IF cleaned = '' THEN
    RETURN NULL;
  END IF;

  date_part := left(cleaned, 10);
  IF date_part !~ '^\d{4}-\d{2}-\d{2}$' THEN
    RETURN NULL;
  END IF;

  BEGIN
    RETURN date_part::date;
  EXCEPTION
    WHEN OTHERS THEN
      RETURN NULL;
  END;
END;
$$;

CREATE OR REPLACE FUNCTION pg_temp.imp_time_hhmm(raw text)
RETURNS text
LANGUAGE plpgsql
AS $$
DECLARE
  cleaned text;
  time_part text;
BEGIN
  IF raw IS NULL THEN
    RETURN NULL;
  END IF;

  cleaned := btrim(raw);
  IF cleaned = '' THEN
    RETURN NULL;
  END IF;

  -- Explicit HH:mm (including 00:00 when intentionally set)
  IF cleaned ~ '^\d{2}:\d{2}$' THEN
    RETURN cleaned;
  END IF;

  -- ISO datetime → HH:mm when not midnight (legacy date-only ISO stays all-day)
  IF cleaned ~ '^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}' THEN
    time_part := substring(cleaned from 12 for 5);
    IF time_part ~ '^\d{2}:\d{2}$' AND time_part <> '00:00' THEN
      RETURN time_part;
    END IF;
  END IF;

  RETURN NULL;
END;
$$;

-- Backfill assumptions:
-- 1. Preserve JSON as-is (no UPDATE/DELETE on Client.important_dates).
-- 2. YYYY-MM-DD or ISO date prefix → all-day row at 00:00:00 (naive UTC wall clock).
-- 3. Optional JSON "time" HH:mm OR non-midnight ISO time → has_time=true.
-- 4. Invalid/invalid entries skipped; readers fall back to JSON when a client has 0 table rows.
INSERT INTO "client_important_dates" (
  "id",
  "label",
  "scheduled_at",
  "has_time",
  "notes",
  "created_at",
  "updated_at",
  "client_id",
  "created_by_user_id",
  "updated_by_user_id"
)
SELECT
  'imp_' || md5(
    c."id" || ':' || parsed.ordinality::text || ':' ||
    COALESCE(parsed.raw_date, '') || ':' ||
    COALESCE(parsed.raw_label, '') || ':' ||
    COALESCE(parsed.raw_time, '')
  ) AS "id",
  LEFT(COALESCE(NULLIF(parsed.raw_label, ''), 'Untitled'), 500) AS "label",
  CASE
    WHEN parsed.time_hhmm IS NOT NULL THEN
      (to_char(parsed.date_only, 'YYYY-MM-DD') || ' ' || parsed.time_hhmm || ':00.000')::timestamp
    ELSE
      (to_char(parsed.date_only, 'YYYY-MM-DD') || ' 00:00:00.000')::timestamp
  END AS "scheduled_at",
  (parsed.time_hhmm IS NOT NULL) AS "has_time",
  NULLIF(parsed.raw_notes, '') AS "notes",
  CURRENT_TIMESTAMP AS "created_at",
  CURRENT_TIMESTAMP AS "updated_at",
  c."id" AS "client_id",
  NULL AS "created_by_user_id",
  NULL AS "updated_by_user_id"
FROM "Client" c
CROSS JOIN LATERAL (
  SELECT
    elem.ordinality,
    BTRIM(COALESCE(elem.value->>'label', '')) AS raw_label,
    BTRIM(COALESCE(elem.value->>'date', '')) AS raw_date,
    BTRIM(COALESCE(elem.value->>'time', '')) AS raw_time,
    BTRIM(COALESCE(elem.value->>'notes', '')) AS raw_notes,
    pg_temp.imp_date_only(elem.value->>'date') AS date_only,
    COALESCE(
      pg_temp.imp_time_hhmm(NULLIF(BTRIM(elem.value->>'time'), '')),
      pg_temp.imp_time_hhmm(elem.value->>'date')
    ) AS time_hhmm
  FROM jsonb_array_elements(
    CASE
      WHEN c."important_dates" IS NULL THEN '[]'::jsonb
      WHEN jsonb_typeof(c."important_dates") = 'array' THEN c."important_dates"
      ELSE '[]'::jsonb
    END
  ) WITH ORDINALITY AS elem(value, ordinality)
  WHERE jsonb_typeof(elem.value) = 'object'
) AS parsed
WHERE parsed.date_only IS NOT NULL;
