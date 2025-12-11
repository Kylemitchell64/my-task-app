const { Pool } = require('pg');

const pool = new Pool({
  host: 'postgres',  // matches Docker Compose service name
  port: 5432,
  database: 'postgres',
  user: 'postgres',
  password: 'Killapilla200!'  // must match Compose env
});

module.exports = pool;
