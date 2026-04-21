import fs from 'fs/promises';
import path from 'path';
import { pool } from '../src/config/database';
import { logger } from '../src/utils/logger';

async function runMigrations() {
  logger.info('Migration process started...');
  
  // 1. Eğer yoksa migrations_meta tablosunu oluştur
  await pool.query(`
    CREATE TABLE IF NOT EXISTS migrations_meta (
      id SERIAL PRIMARY KEY,
      name VARCHAR(255) UNIQUE NOT NULL,
      applied_at TIMESTAMPTZ DEFAULT NOW()
    );
  `);

  // 2. migrations klasöründeki dosyaları oku ve alfabetik sırala
  const migrationsDir = path.join(__dirname, '../migrations');
  const files = await fs.readdir(migrationsDir);
  const sqlFiles = files.filter(f => f.endsWith('.sql')).sort();

  // 3. Her bir dosyayı transaction içinde çalıştır
  for (const file of sqlFiles) {
    const checkApplied = await pool.query(
      'SELECT id FROM migrations_meta WHERE name = $1',
      [file]
    );

    // TypeScript'in "rowCount null olabilir" hatasını çözmek için: ?? 0
    if ((checkApplied.rowCount ?? 0) > 0) {
      logger.info(`Atlanıyor (Zaten uygulanmış): ${file}`);
      continue;
    }

    const filePath = path.join(migrationsDir, file);
    const sql = await fs.readFile(filePath, 'utf8');

    const client = await pool.connect();
    try {
      await client.query('BEGIN'); // Transaction başlat
      
      logger.info(`Uygulanıyor: ${file}`);
      await client.query(sql);
      
      // Başarılı olursa log tablosuna ekle
      await client.query(
        'INSERT INTO migrations_meta (name) VALUES ($1)',
        [file]
      );
      
      await client.query('COMMIT'); // Transaction onayla
      logger.info(`Başarıyla tamamlandı: ${file}`);
    } catch (error) {
      await client.query('ROLLBACK'); // Hata çıkarsa geri al
      
      // TypeScript'in "error tipini bilmiyorum (unknown)" hatasını çözmek için:
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error(`Hata nedeniyle ROLLBACK yapıldı (${file}): ${errorMessage}`);
      throw error;
    } finally {
      client.release(); // Bağlantıyı havuza geri ver
    }
  }
  
  logger.info('Tüm migration işlemleri başarıyla tamamlandı.');
}

runMigrations()
  .then(() => {
    logger.info('Migration scripti sonlandı.');
    process.exit(0);
  })
  .catch((error) => {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error(`Migration süreci başarısız oldu: ${errorMessage}`);
    process.exit(1);
  });