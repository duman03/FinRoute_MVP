import fs from 'fs';
import path from 'path';

const rootDir = path.resolve(__dirname, '..', '..');

function read(relativePath: string): string {
  return fs.readFileSync(path.join(rootDir, relativePath), 'utf8');
}

function exists(relativePath: string): boolean {
  return fs.existsSync(path.join(rootDir, relativePath));
}

function assert(condition: boolean, message: string): void {
  if (!condition) {
    throw new Error(message);
  }
}

function checkIncludes(relativePath: string, expected: string): void {
  const content = read(relativePath);
  assert(
    content.includes(expected),
    `${relativePath} is missing expected content: ${expected}`
  );
}

function checkNotIncludes(relativePath: string, forbidden: string): void {
  const content = read(relativePath);
  assert(
    !content.includes(forbidden),
    `${relativePath} contains forbidden content: ${forbidden}`
  );
}

function walkFiles(relativeDir: string): string[] {
  const absoluteDir = path.join(rootDir, relativeDir);
  const entries = fs.readdirSync(absoluteDir, { withFileTypes: true });
  const files: string[] = [];

  for (const entry of entries) {
    const relativePath = path.join(relativeDir, entry.name);
    if (entry.isDirectory()) {
      files.push(...walkFiles(relativePath));
    } else {
      files.push(relativePath);
    }
  }

  return files;
}

function checkNoPattern(relativeDirs: string[], pattern: RegExp, message: string): void {
  for (const relativeDir of relativeDirs) {
    for (const file of walkFiles(relativeDir)) {
      const content = read(file);
      assert(!pattern.test(content), `${message}: ${file}`);
    }
  }
}

function run(): void {
  const requiredFiles = [
    'backend/.env.example',
    'backend/Dockerfile.prod',
    'backend/scripts/run-migrations.js',
    'deploy/.env.production.example',
    'docker-compose.prod.yml',
    'mobile/.env.example',
    'mobile/.env.production.example',
    'mobile/app.config.js',
    'mobile/assets/icon.png',
    'mobile/assets/notification-icon.png',
    'mobile/assets/adaptive-icon.png',
    'mobile/assets/splash-icon.png',
    'nginx/html/privacy/index.html',
    'nginx/html/delete-account/index.html',
    'nginx/nginx.prod.bootstrap.conf',
    'nginx/nginx.prod.ssl.conf',
    'backend/src/jobs/account-cleanup.job.ts',
    'backend/migrations/023_account_deletion_release_policy.sql',
    'release/README.md',
    'release/checklists/publish-checklist.md',
    'release/store/app-store-metadata.md',
    'release/store/play-store-metadata.md',
    'release/store/review-notes.md',
    'release/deploy-vps-runbook.md',
    '.github/workflows/release-readiness.yml',
  ];

  for (const file of requiredFiles) {
    assert(exists(file), `Required release file missing: ${file}`);
  }

  checkIncludes('.env.example', 'PORT=3001');
  checkIncludes('backend/.env.example', 'PORT=3001');
  checkIncludes('docker-compose.yml', 'PORT: 3001');
  checkIncludes('docker-compose.yml', '"3001:3001"');
  checkIncludes('docker-compose.prod.yml', 'Dockerfile.prod');
  checkIncludes('docker-compose.prod.yml', 'NODE_ENV: production');
  checkIncludes('docker-compose.prod.yml', '"443:443"');
  checkIncludes('docker-compose.prod.yml', 'certbot');
  checkIncludes('backend/Dockerfile.prod', 'npm run build');
  checkIncludes('backend/Dockerfile.prod', 'npm ci --omit=dev');
  checkIncludes('backend/Dockerfile.prod', 'scripts/run-migrations.js');
  checkIncludes('backend/Dockerfile.prod', 'npm\", \"start');
  checkIncludes('backend/package.json', '"migrate:prod": "node scripts/run-migrations.js"');
  checkIncludes('nginx/nginx.conf', 'server backend:3001;');
  checkIncludes('nginx/nginx.prod.bootstrap.conf', 'api.finrouteapp.com');
  checkIncludes('nginx/nginx.prod.ssl.conf', 'ssl_certificate');
  checkIncludes('nginx/nginx.prod.ssl.conf', 'api.finrouteapp.com');
  checkIncludes('deploy/.env.production.example', 'NGINX_CONF_PATH=./nginx/nginx.prod.bootstrap.conf');
  checkIncludes('release/deploy-vps-runbook.md', 'docker compose --env-file deploy/.env.production');
  checkIncludes('backend/src/config/env.ts', "default('3001')");
  checkIncludes('mobile/eas.json', 'https://api.finrouteapp.com/api/v1');
  checkIncludes('mobile/eas.json', 'wss://api.finrouteapp.com');
  checkIncludes('mobile/app.config.js', 'hasGoogleServices');
  checkIncludes('nginx/html/privacy/index.html', 'privacy@finrouteapp.com');
  checkIncludes('nginx/html/delete-account/index.html', 'support@finrouteapp.com');
  checkIncludes('backend/migrations/022_allow_hard_delete_user_relations.sql', 'ON DELETE SET NULL');
  checkIncludes('backend/migrations/023_account_deletion_release_policy.sql', 'scheduled_for_deletion_at = NOW() + INTERVAL \'30 days\'');
  checkIncludes('backend/src/services/user.service.ts', 'SELECT soft_delete_user($1)');
  checkIncludes('backend/src/jobs/account-cleanup.job.ts', 'SELECT permanently_delete_expired_users()');
  checkIncludes('backend/src/index.ts', 'scheduleAccountCleanupCron');
  checkIncludes('backend/src/routes/user.routes.ts', 'Account deleted successfully');
  checkIncludes('mobile/src/hooks/usePushNotification.ts', 'getExpoPushTokenAsync({');
  checkIncludes('mobile/src/hooks/usePushNotification.ts', 'projectId: getExpoProjectId()');
  checkIncludes('mobile/app.config.js', 'EAS_PROJECT_ID');
  checkIncludes('backend/src/jobs/notification.job.ts', 'https://exp.host/--/api/v2/push/send');
  checkIncludes('backend/src/jobs/notification.job.ts', 'https://exp.host/--/api/v2/push/getReceipts');
  checkIncludes('backend/.env.example', 'EXPO_PUSH_ACCESS_TOKEN');

  checkNotIncludes('backend/src/services/user.service.ts', 'DELETE FROM users WHERE id = $1 RETURNING id');
  checkNotIncludes('backend/src/jobs/notification.job.ts', 'Mock FCM');
  checkNotIncludes('backend/src/jobs/notification.job.ts', 'Math.random() < 0.05');
  checkNotIncludes('mobile/src/hooks/useDeviceSetup.ts', 'mock-device-token');
  checkNotIncludes('mobile/src/hooks/usePushNotification.ts', '/account/device-token');
  checkNotIncludes('release/store/review-notes.md', 'REPLACE_ME');
  checkNotIncludes('nginx/html/privacy/index.html', 'Hesap silme talebinin ardından kullanıcı hesabı ve kullanıcıya bağlı uygulama verileri\n          üretim sisteminden kaldırılır.');

  checkNoPattern(
    ['backend/src', 'backend/scripts'],
    /rows\[\d+\]|split\(' '\)\[\d+\]|result\.rows\./,
    'Golden rule violation'
  );

  const easConfig = read('mobile/eas.json');
  const forbiddenPlaceholders = [
    'APPLE_ID',
    'APP_STORE_CONNECT_APP_ID',
    'APPLE_TEAM_ID',
  ];

  for (const placeholder of forbiddenPlaceholders) {
    assert(
      !easConfig.includes(placeholder),
      `mobile/eas.json still contains placeholder: ${placeholder}`
    );
  }

  console.log('Release verification passed.');
}

try {
  run();
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Release verification failed: ${message}`);
  process.exit(1);
}
