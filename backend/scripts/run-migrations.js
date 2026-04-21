const fs = require('fs/promises');
const path = require('path');
const { Pool } = require('pg');

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

async function runMigrations() {
  console.info('Migration process started...');

  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations_meta (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  const migrationsDir = path.join(__dirname, '../migrations');
  const files = await fs.readdir(migrationsDir);
  const sqlFiles = files.filter((file) => file.endsWith('.sql')).sort();

  for (const file of sqlFiles) {
    const checkApplied = await pool.query(
      'SELECT id FROM migrations_meta WHERE name = $1',
      [file]
    );

    if ((checkApplied.rowCount || 0) > 0) {
      console.info(`Skipping already applied migration: ${file}`);
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = await fs.readFile(filePath, 'utf8');
    const client = await pool.connect();

    try {
      await client.query('BEGIN');
      console.info(`Applying migration: ${file}`);
      await client.query(sql);
      await client.query('INSERT INTO migrations_meta (name) VALUES ($1)', [file]);
      await client.query('COMMIT');
      console.info(`Migration completed: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK');
      const errorMessage = error instanceof Error ? error.message : String(error);
      console.error(`Migration failed and rolled back (${file}): ${errorMessage}`);
      throw error;
    } finally {
      client.release();
    }
  }

  console.info('All migrations completed successfully.');
}

runMigrations()
  .then(async () => {
    await pool.end();
    process.exit(0);
  })
  .catch(async (error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error(`Migration process failed: ${errorMessage}`);
    await pool.end();
    process.exit(1);
  });
