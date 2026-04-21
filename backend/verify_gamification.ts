import { pool } from './src/config/database';
import { logger } from './src/utils/logger';

async function verifyCron4() {
  const testEmail = 'adem_kbp@gmail.com';
  try {
    const userRes = await pool.query('SELECT id FROM users WHERE email = $1', [testEmail]);
    if (userRes.rowCount === 0) {
      console.log('Test user not found');
      return;
    }
    const userId = userRes.rows[ 0 ].id;

    console.log('--- Setting up test case: Lapsed streak ---');
    // Set streak to 5, but last check in was 2 days ago, and 0 freezes
    await pool.query(
      `UPDATE user_streaks 
       SET current_streak = 5, 
           last_check_in_date = (CURRENT_DATE - INTERVAL '2 days'),
           freeze_count = 0 
       WHERE user_id = $1`,
      [userId]
    );

    console.log('Running CRON-4 logic...');
    const result = await pool.query(
      `UPDATE user_streaks 
       SET current_streak = 0, updated_at = NOW()
       WHERE last_check_in_date < (CURRENT_DATE - INTERVAL '1 day')
         AND freeze_count = 0
         AND current_streak > 0
       RETURNING current_streak`
    );

    console.log(`CRON-4 result: Reset ${result.rowCount} streaks`);
    if (result.rowCount && result.rowCount > 0) {
      console.log(`New streak value: ${result.rows[ 0 ].current_streak}`);
    }

    console.log('\n--- Setting up test case: Active streak (Yesterday) ---');
    await pool.query(
      `UPDATE user_streaks 
       SET current_streak = 5, 
           last_check_in_date = (CURRENT_DATE - INTERVAL '1 day'),
           freeze_count = 0 
       WHERE user_id = $1`,
      [userId]
    );

    const result2 = await pool.query(
      `UPDATE user_streaks 
       SET current_streak = 0, updated_at = NOW()
       WHERE last_check_in_date < (CURRENT_DATE - INTERVAL '1 day')
         AND freeze_count = 0
         AND current_streak > 0`
    );
    console.log(`CRON-4 result (should be 0): Reset ${result2.rowCount} streaks`);

  } catch (err) {
    console.error('Verification error:', err);
  } finally {
    await pool.end();
  }
}

verifyCron4();
