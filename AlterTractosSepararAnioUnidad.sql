BEGIN;

ALTER TABLE tractos
ADD COLUMN IF NOT EXISTS anio SMALLINT;

UPDATE tractos
SET
    anio = NULLIF(substring(unidad from '(\d{4})$'), '')::SMALLINT,
    unidad = trim(regexp_replace(unidad, '\s*\d{4}$', ''))
WHERE anio IS NULL;

ALTER TABLE tractos
ALTER COLUMN anio SET NOT NULL;

COMMIT;
