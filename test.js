const pool = require('./db');

async function getUsers() {
  const result = await pool.query('SELECT * FROM users');
  console.log(result.rows);
}

getUsers();