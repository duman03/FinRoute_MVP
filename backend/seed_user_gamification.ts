import { pool } from './src/config/database';

async function run() {
  const email = 'adem_kbp@gmail.com';
  try {
    const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [email]);
    if (userRes.rows.length === 0) {
      console.log('USER_NOT_FOUND');
      return;
    }
    const userId = userRes.rows[0].id;
    console.log(`USER_ID:${userId}`);

    // Insert initial streak
    await pool.query(
      `INSERT INTO user_streaks (user_id, current_streak, longest_streak, freeze_count)
       VALUES ($1, 0, 0, 1)
       ON CONFLICT (user_id) DO NOTHING`,
      [userId]
    );

    // Insert initial league assignment for current week
    const weekStart = new Date();
    weekStart.setUTCHours(0, 0, 0, 0);
    // Adjust to Monday
    const day = weekStart.getUTCDay();
    const diff = weekStart.getUTCDate() - day + (day === 0 ? -6 : 1);
    weekStart.setUTCDate(diff);
    const weekStartStr = weekStart.toISOString().slice(0, 10);

    await pool.query(
      `INSERT INTO user_league_assignments (user_id, league_slug, week_start)
       VALUES ($1, 'bronze', $2)
       ON CONFLICT (user_id, week_start) DO NOTHING`,
      [userId, weekStartStr]
    );

    console.log('INSERTION_SUCCESSFUL');
  } catch (err) {
    console.error('ERROR:', err);
  } finally {
    await pool.end();
  }
}

run();
