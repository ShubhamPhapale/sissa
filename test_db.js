const { Pool } = require('pg');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
pool.query('SELECT count(*) FROM pg_stat_activity').then(res => {
  console.log("Active connections:", res.rows[0].count);
  process.exit(0);
});
