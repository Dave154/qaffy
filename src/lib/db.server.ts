import postgres from 'postgres'

const connectionString = process.env.DATABASE_URL

if (!connectionString) {
  throw new Error('Missing DATABASE_URL (direct Postgres connection string from your Supabase project settings).')
}

// Trusted server-side connection; bypasses RLS like the Supabase service role.
// Wallet balances are only ever mutated through the functions in wallet.server.ts.
export const sql = postgres(connectionString)
