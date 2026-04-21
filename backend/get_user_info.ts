import { pool } from './src/config/database';

async function run() {
  try {
    const userRes = await pool.query('SELECT id, email FROM users WHERE email = $1', ['adem_kbp@gmail.com']);
    if (userRes.rows.length === 0) {
      console.log('User not found');
      return;
    }
    const userId = userRes.rows[0].id;
    console.log(`USER_ID:${userId}`);

    // Check if user has streak and league assignment
    const streakRes = await pool.query('SELECT * FROM user_streaks WHERE user_id = $1', [userId]);
    const leagueRes = await pool.query('SELECT * FROM user_league_assignments WHERE user_id = $1', [userId]);

    console.log(`STREAK_EXISTS:${streakRes.rows.length > 0}`);
    console.log(`LEAGUE_EXISTS:${leagueRes.rows.length > 0}`);
  } catch (err) {
    console.error(err);
  } finally {
    await pool.end();
  }
}

run();
