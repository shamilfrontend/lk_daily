import dotenv from 'dotenv';

dotenv.config();

function required(name: string, fallback?: string): string {
  const v = process.env[name] ?? fallback;
  if (v === undefined || v === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return v;
}

function parseCorsOrigins(): string[] {
  const raw = process.env.CORS_ORIGINS ?? '';
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function optional(name: string): string | undefined {
  const v = process.env[name];
  return v === undefined || v === '' ? undefined : v;
}

function ensureSafeProductionConfig(params: {
  nodeEnv: string;
  jwtSecret: string;
  adminLogin: string;
  adminPassword: string;
  corsOrigins: string[];
}): void {
  const { nodeEnv, jwtSecret, adminLogin, adminPassword, corsOrigins } = params;
  const isProduction = nodeEnv === 'production';
  if (!isProduction) {
    return;
  }

  if (jwtSecret.length < 32 || jwtSecret === 'dev-secret-change-me') {
    throw new Error(
      'In production JWT_SECRET must be set and at least 32 chars long',
    );
  }
  if (adminLogin === 'admin' || adminPassword === 'admin123') {
    throw new Error(
      'In production ADMIN_LOGIN/ADMIN_PASSWORD must not use default values',
    );
  }
  if (corsOrigins.length === 0) {
    throw new Error(
      'In production CORS_ORIGINS must contain at least one origin',
    );
  }
}

const nodeEnv = process.env.NODE_ENV ?? 'development';
const jwtSecret = required('JWT_SECRET');
const adminLogin = required('ADMIN_LOGIN');
const adminPassword = required('ADMIN_PASSWORD');
const corsOrigins = parseCorsOrigins();

ensureSafeProductionConfig({
  nodeEnv,
  jwtSecret,
  adminLogin,
  adminPassword,
  corsOrigins,
});

export const env = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/lk-daily'),
  jwtSecret,
  adminLogin,
  adminPassword,
  nodeEnv,
  /** Пустой список: разрешить любой origin (удобно для dev). Иначе только перечисленные. */
  corsOrigins,
  rateLimitLoginMax: Math.max(
    1,
    Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 50),
  ),
  rateLimitApiMax: Math.max(10, Number(process.env.RATE_LIMIT_API_MAX ?? 300)),
  /** Отдельный лимит для тяжёлых публичных GET (экспорт CSV/ICS). */
  rateLimitExportMax: Math.max(
    5,
    Number(process.env.RATE_LIMIT_EXPORT_MAX ?? 60),
  ),
  /** URL исходящего webhook (Slack и т.п.); без него POST /api/hooks/notify-today вернёт 503. */
  get outboundWebhookUrl(): string | undefined {
    return optional('OUTBOUND_WEBHOOK_URL');
  },
  /** Секрет для вызова POST /api/hooks/notify-today (Bearer или X-Lk-Daily-Secret). Пусто — эндпоинт отключён. */
  get webhookTriggerSecret(): string | undefined {
    return optional('WEBHOOK_TRIGGER_SECRET');
  },
};
