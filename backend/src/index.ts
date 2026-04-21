import express from 'express';
import http from 'http';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { env } from './config/env';
import { logger } from './utils/logger';
import { pool } from './config/database';
import { redis } from './config/redis';

// Middleware and Route imports
import requestLogger from './middleware/requestLogger';
import errorHandler from './middleware/errorHandler';
import healthRoutes from './routes/health.routes';
import authRoutes from './routes/auth.routes';
import userRoutes from './routes/user.routes';
import portfolioRoutes from './routes/portfolio.routes';
import tradeRoutes from './routes/trade.routes';
import gamificationRoutes from './routes/gamification.routes';
import checkinRoutes from './routes/checkin.routes';
import leaderboardRoutes from './routes/leaderboard.routes';
import missionRoutes from './routes/mission.routes';
import notificationSettingsRoutes from './routes/notification-settings.routes';

// Week 3 imports
import priceRoutes from './routes/price.routes';
import { setupWebSocketServer } from './websocket/priceStream';
import { startCronJobs } from './jobs/cron';
import { scheduleAccountCleanupCron } from './jobs/account-cleanup.job';
import { startPricePolling } from './services/price.service';
import type { ScheduledTask } from 'node-cron';

// BullMQ Queue imports (for shutdown ordering)
import { tradeQueue } from './config/bullmq';

// Worker imports
import tradeWorker from './workers/trade.worker';
import { xpWorker } from './workers/xp.worker';
import { missionProgressWorker } from './workers/mission-progress.worker';

// ── Hafta 8 Job'ları ─────────────────────────────────────────────────────────
import {
  scheduleLeaguePromotion,
  leaguePromotionQueue,
  leaguePromotionWorker,
} from './jobs/league-promotion.job';
import {
  scheduleFullReconcile,
  leaderboardSyncQueue,
  leaderboardSyncWorker,
} from './jobs/leaderboard-sync.job';

// ── Hafta 9 Job'ları ─────────────────────────────────────────────────────────
import {
  scheduleStreakReminderCron,
  streakReminderQueue,
  streakReminderWorker,
} from './jobs/streak-reminder.job';
import {
  notificationQueue,
  notificationWorker,
} from './jobs/notification.job';

const app = express();

// Trust proxy for Nginx X-Real-IP
app.set('trust proxy', 1);

// Apply middlewares exactly in Perplexity order
app.use(helmet());
app.use(cors());
app.use(compression());
app.use(express.json());
app.use(requestLogger);

// Mount routes
app.use('/api/v1/health', healthRoutes);
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/account', userRoutes);
app.use('/api/v1/portfolios', portfolioRoutes);
app.use('/api/v1/portfolios', tradeRoutes);

// Mount gamification routes
app.use('/api/v1/gamification', gamificationRoutes);
app.use('/api/v1/gamification', checkinRoutes);
app.use('/api/v1/gamification', leaderboardRoutes);
app.use('/api/v1/gamification', missionRoutes);

// Mount notification settings routes
app.use('/api/v1/notification-settings', notificationSettingsRoutes);

// Mount new prices route
app.use('/api/v1/prices', priceRoutes);

// Apply errorHandler as last middleware
app.use(errorHandler);

// Use http.createServer for WebSocket compatibility
const server = http.createServer(app);

// Setup WebSocket Server
const wss = setupWebSocketServer(server);
let accountCleanupTask: ScheduledTask | null = null;

// ─────────────────────────────────────────────────────────────────────────────
// Bootstrap
// ─────────────────────────────────────────────────────────────────────────────
async function bootstrap(): Promise<void> {
  // 1. Start Cron Jobs (setInterval-based — Week 3)
  startCronJobs();
  accountCleanupTask = scheduleAccountCleanupCron();

  // 2. Hafta 8 BullMQ Cron kayıtları
  await scheduleLeaguePromotion();
  logger.info('[Bootstrap] LeaguePromotion cron ✅');

  await scheduleFullReconcile();
  logger.info('[Bootstrap] FullReconcile cron ✅');

  // 3. Hafta 9 BullMQ Cron kayıtları
  await scheduleStreakReminderCron();
  logger.info('[Bootstrap] StreakReminder cron ✅');

  // Worker'lar import side-effect ile başladı — referans tutarak lint uyarısı önle
  void [
    tradeWorker,
    xpWorker,
    missionProgressWorker,
    leaguePromotionWorker,
    leaderboardSyncWorker,
    streakReminderWorker,
    notificationWorker,
  ];

  // 4. Start Price Polling
  startPricePolling(['AAPL', 'GOOGL', 'MSFT', 'AMZN', 'TSLA']);

  // 5. HTTP + WebSocket
  await new Promise<void>(resolve => {
    server.listen(env.PORT, resolve);
  });
  logger.info(`[Bootstrap] HTTP and WebSocket Server listening on port ${env.PORT} ✅`);
}

// ─────────────────────────────────────────────────────────────────────────────
// Direktif 3 — Graceful Shutdown v2
// Kapatma sırası: HTTP/WS → Workers → Queues → Pool → Redis
// ─────────────────────────────────────────────────────────────────────────────
let isShuttingDown = false;

async function gracefulShutdown(signal: string): Promise<void> {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`[Shutdown] ${signal} alındı — graceful shutdown başlıyor...`);

  // 30 saniye sonra zorla öldür (zombie worker koruması)
  const forceKillGuard = setTimeout(() => {
    logger.error('[Shutdown] ⛔ 30 saniye doldu — process.exit(1) zorla çalıştırılıyor');
    process.exit(1);
  }, 30_000);
  forceKillGuard.unref();

  try {
    accountCleanupTask?.stop();
    logger.info('[Shutdown] Account cleanup cron durduruldu ✅');

    // Adım 1: HTTP sunucusu + WebSocket kapat
    wss.close();
    await new Promise<void>((resolve, reject) =>
      server.close(err => (err ? reject(err) : resolve()))
    );
    logger.info('[Shutdown] 1/5 HTTP + WebSocket kapatıldı ✅');

    // Adım 2: Tüm BullMQ Worker'ları kapat (aktif job'ların bitmesini bekle)
    await Promise.all([
      tradeWorker.close(),
      xpWorker.close(),
      missionProgressWorker.close(),
      leaderboardSyncWorker.close(),
      leaguePromotionWorker.close(),
      streakReminderWorker.close(),
      notificationWorker.close(),
    ]);
    logger.info('[Shutdown] 2/5 BullMQ Worker\'lar kapatıldı ✅');

    // Adım 3: BullMQ Queue'ları kapat
    await Promise.all([
      tradeQueue.close(),
      leaguePromotionQueue.close(),
      leaderboardSyncQueue.close(),
      streakReminderQueue.close(),
      notificationQueue.close(),
    ]);
    logger.info('[Shutdown] 3/5 BullMQ Queue\'lar kapatıldı ✅');

    // Adım 4: PostgreSQL pool
    await pool.end();
    logger.info('[Shutdown] 4/5 PostgreSQL pool kapatıldı ✅');

    // Adım 5: Redis
    redis.quit();
    logger.info('[Shutdown] 5/5 Redis bağlantısı kapatıldı ✅');

    clearTimeout(forceKillGuard);
    logger.info('[Shutdown] Graceful shutdown tamamlandı — çıkılıyor.');
    process.exit(0);

  } catch (err) {
    logger.error('[Shutdown] Hata:', err);
    clearTimeout(forceKillGuard);
    process.exit(1);
  }
}

// Hem SIGTERM (k8s pod eviction) hem SIGINT (Ctrl+C) dinle
process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Yakalanmamış hataları logla — sessiz çöküşleri engelle
process.on('unhandledRejection', (reason) => {
  logger.error('[Process] unhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  logger.error('[Process] uncaughtException:', err);
  gracefulShutdown('uncaughtException');
});

// Başlat
bootstrap().catch(err => {
  logger.error('[Bootstrap] FATAL:', err);
  process.exit(1);
});
