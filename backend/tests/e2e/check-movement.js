const { Pool } = require('pg');
require('dotenv').config({ path: '../../.env' });

const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: process.env.DB_PORT || 5432,
  database: process.env.DB_NAME || 'gastos_auth',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || 'postgres',
});

async function checkLastMovement() {
  try {
    const result = await pool.query(`
      SELECT 
        m.id, m.description, m.amount, m.category_id,
        c.name as category_name, c.category_group_id,
        cg.name as category_group_name
      FROM movements m
      LEFT JOIN categories c ON m.category_id = c.id
      LEFT JOIN category_groups cg ON c.category_group_id = cg.id
      WHERE m.type = 'SPLIT'
      ORDER BY m.created_at DESC
      LIMIT 3
    `);
    
    console.log('Last SPLIT movements:');
    result.rows.forEach(row => {
      console.log(JSON.stringify(row, null, 2));
    });
  } catch (err) {
    console.error('Error:', err);
  } finally {
    await pool.end();
  }
}

checkLastMovement();
