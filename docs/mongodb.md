# MongoDB runtime (Prisma)

The API now uses **MongoDB Atlas** via Prisma ORM **6.19** (`provider = "mongodb"`).

Prisma 7 does not support MongoDB — stay on 6.19 until official Mongo support returns.

## Env

```env
DATABASE_URL="mongodb+srv://USER:PASSWORD@host/vastu?retryWrites=true&w=majority"
```

## Schema / indexes

```bash
bunx prisma generate
bunx prisma db push
```

Optional nullable unique fields (`Payment.orderId`, UTR refs) use **sparse** unique indexes created separately when needed, because Mongo treats missing/`null` as duplicate keys on non-sparse uniques.

## Data migration from Postgres

Historical copy + backup checklist:

```bash
bun run migrate:pg-to-mongo
```

See [pg-to-mongo-migration.md](./pg-to-mongo-migration.md). After a JSON import, convert ISO date strings to BSON dates (Prisma requires DateTime as BSON Date).
