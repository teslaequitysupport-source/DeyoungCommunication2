/* Smoke check: verify schema state through the Postgres wire protocol. */
import pg from "pg";

const DATABASE_URL =
  process.env.DATABASE_URL?.startsWith("postgres")
    ? process.env.DATABASE_URL
    : "postgresql://127.0.0.1:6543/postgres";

const client = new pg.Client(DATABASE_URL);
await client.connect();

const tables = await client.query<{ table_name: string }>(
  `select table_name from information_schema.tables
   where table_schema = 'public' order by table_name`,
);
console.log("TABLES:", tables.rows.map((r) => r.table_name).join(", "));

const roles = await client.query<{ label: string }>(
  `select unnest(enum_range(null::user_role))::text as label`,
);
console.log("user_role enum:", roles.rows.map((r) => r.label).join(", "));

const sessionStates = await client.query<{ n: number }>(
  `select count(*)::int as n from (
     select unnest(enum_range(null::live_session_status)) as s
   ) t`,
);
console.log("live_session_status states:", sessionStates.rows[0].n, "(expect 14)");

const migrations = await client.query<{ hash: string }>(
  `select hash from drizzle.__drizzle_migrations`,
);
console.log(
  "MIGRATIONS APPLIED:",
  migrations.rows.map((r) => r.hash.slice(0, 16)).join(", "),
);

await client.end();
