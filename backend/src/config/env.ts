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

export const env = {
  port: Number(process.env.PORT ?? 4000),
  mongoUri: required('MONGO_URI', 'mongodb://127.0.0.1:27017/lk-daily'),
  jwtSecret: required('JWT_SECRET', 'dev-secret-change-me'),
  adminLogin: required('ADMIN_LOGIN', 'admin'),
  adminPassword: required('ADMIN_PASSWORD', 'admin123'),
  nodeEnv: process.env.NODE_ENV ?? 'development',
  /** Пустой список: разрешить любой origin (удобно для dev). Иначе только перечисленные. */
  corsOrigins: parseCorsOrigins(),
  rateLimitLoginMax: Math.max(1, Number(process.env.RATE_LIMIT_LOGIN_MAX ?? 50)),
  /** URL исходящего webhook (Slack и т.п.); без него POST /api/hooks/notify-today вернёт 503. */
  outboundWebhookUrl: optional('OUTBOUND_WEBHOOK_URL'),
  /** Секрет для вызова POST /api/hooks/notify-today (Bearer или X-Lk-Daily-Secret). Пусто — эндпоинт отключён. */
  webhookTriggerSecret: optional('WEBHOOK_TRIGGER_SECRET'),
};
