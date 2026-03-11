# Database Migrations

Run migrations **before** updating the application when a release notes `[DB MIGRATION]`.

## Running Migrations

```bash
# Run all pending migrations
npx ts-node src/migrations/runner.ts

# Or inside Docker
docker exec $(docker ps -q -f name=swarmui-master_backend) \
  node dist/migrations/runner.js
```

## Creating a Migration

```bash
cp src/migrations/template.ts src/migrations/$(date +%Y%m%d%H%M%S)_describe_change.ts
```

Then implement the `up()` and `down()` methods.
