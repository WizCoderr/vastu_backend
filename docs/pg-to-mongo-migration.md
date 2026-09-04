# Postgres → MongoDB data copy

One-time / periodic **data copy** from PostgreSQL into MongoDB Atlas.

This does **not** switch the Vastu app off Prisma + Postgres. The API still uses `DATABASE_URL` (Postgres).

## Run

```bash
# From vastu_backend/
MONGODB_URI='mongodb+srv://USER:PASSWORD@cluster.mongodb.net/vastu?retryWrites=true&w=majority' \
  bun run migrate:pg-to-mongo
```

Options:

| Env | Effect |
|-----|--------|
| `BACKUP_ONLY=true` | Write JSON backup only |
| `SKIP_BACKUP=true` + `BACKUP_DIR=...` | Re-import an existing backup |
| `BACKUP_DIR=...` | Custom backup folder |

## Outputs

Under `backups/pg-to-mongo-<timestamp>/` (gitignored):

- `<Table>.json` — raw table dumps
- `manifest.json` — table list + counts
- `import-result.json` — Mongo insert counts
- `verification.json` — ☑ checklist (pg = backup = mongo)

## Security

- Never commit `MONGODB_URI` or `backups/`
- Rotate Atlas passwords if they were shared in chat
- Backup files contain password hashes and PII — treat as secrets
