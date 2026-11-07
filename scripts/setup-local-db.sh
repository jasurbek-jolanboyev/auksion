#!/usr/bin/env bash
set -euo pipefail

# Development-only PostgreSQL bootstrap. Uses the current local PostgreSQL
# administrator account; production databases must be provisioned separately.
psql -d postgres -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='euylar') THEN CREATE ROLE euylar LOGIN PASSWORD 'euylar'; ELSE ALTER ROLE euylar WITH LOGIN PASSWORD 'euylar'; END IF; END \$\$;"

if ! psql -d postgres -tAc "SELECT 1 FROM pg_database WHERE datname='euylar'" | grep -q 1; then
  createdb -O euylar euylar
fi

psql -d postgres -v ON_ERROR_STOP=1 -c "ALTER DATABASE euylar OWNER TO euylar;"
printf 'Local PostgreSQL role and database are ready.\n'
