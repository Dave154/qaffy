import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('Missing DATABASE_URL (direct Postgres connection string from your Supabase project settings).')
}

// Supavisor's transaction pooler (port 6543) does not support prepared statements.
const usesTransactionPooler = /:6543(\/|$|\?)/.test(connectionString)

// Trusted server-side connection; bypasses RLS like the Supabase service role.
// Wallet balances are only ever mutated through the functions in wallet.server.ts.
//
// Serverless instances are short-lived, so keep the pool small and close idle connections quickly.
// Every new Postgres connection is logged by Supabase; leaked idle connections also hold slots on
// the database. Prefer the pooler connection string for DATABASE_URL in serverless deployments.
export const sql = postgres(connectionString, {
  idle_timeout: 20,
  max_lifetime: 60 * 30,
  connect_timeout: 15,
  prepare: !usesTransactionPooler,
})
