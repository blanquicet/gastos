import pkg from 'pg';
const { Pool } = pkg;

const dbUrl = process.env.DATABASE_URL || 'postgres://conti:conti_dev_password@localhost:5432/conti?sslmode=disable';

const pool = new Pool({
  connectionString: dbUrl
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
