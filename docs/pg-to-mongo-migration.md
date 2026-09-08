# Postgres → MongoDB data copy

Copy table data from **Prisma Postgres** into MongoDB Atlas.

The Vastu API uses Mongo (`DATABASE_URL`). This script is only for restoring a Postgres backup.

## Run

```bash
# POSTGRES_URL = Prisma Postgres
# DATABASE_URL or MONGODB_URI = Mongo target (database name in the URI)
bun run migrate:pg-to-mongo
```

Options:

| Env | Effect |
|-----|--------|
| `POSTGRES_URL` | Source (required for export) |
| `MONGODB_URI` | Target; falls back to `DATABASE_URL` |
| `BACKUP_ONLY=true` | Write JSON backup only |
| `SKIP_BACKUP=true` + `BACKUP_DIR=...` | Re-import an existing backup |
| `DROP_EXISTING=false` | Append instead of replacing each collection |
| `SKIP_TABLES` | Comma list (default `_prisma_migrations`) |

## Outputs

Under `backups/pg-to-mongo-<timestamp>/` (gitignored):

- `<Table>.json` — raw table dumps
- `manifest.json` — table list + counts
- `import-result.json` — Mongo insert counts
- `verification.json` — pg = backup = mongo

## Security

- Never commit `POSTGRES_URL`, `MONGODB_URI`, or `backups/`
- Backup files contain password hashes and PII
