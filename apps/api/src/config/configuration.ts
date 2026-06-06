export interface AppConfig {
  port: number;
  appUrl: string;
  jwt: {
    accessSecret: string;
    refreshSecret: string;
    accessTtl: number;
    refreshTtl: number;
  };
  redisUrl: string;
  llm: { provider: string; apiKey: string; model: string };
  n8n: { webhookUrl: string; webhookSecret: string };
  razorpay: { keyId: string; keySecret: string; webhookSecret: string };
}

export default (): AppConfig => ({
  port: Number(process.env.API_PORT ?? 4000),
  appUrl: process.env.APP_URL ?? 'http://localhost:3000',
  jwt: {
    accessSecret: process.env.JWT_ACCESS_SECRET ?? 'dev_access_secret_change_me_32chars__',
    refreshSecret: process.env.JWT_REFRESH_SECRET ?? 'dev_refresh_secret_change_me_32chars_',
    accessTtl: Number(process.env.JWT_ACCESS_TTL ?? 900),
    refreshTtl: Number(process.env.JWT_REFRESH_TTL ?? 604800),
  },
  redisUrl: process.env.REDIS_URL ?? 'redis://localhost:6379',
  llm: {
    provider: process.env.LLM_PROVIDER ?? 'anthropic',
    apiKey: process.env.LLM_API_KEY ?? '',
    model: process.env.LLM_MODEL ?? 'claude-3-5-sonnet-latest',
  },
  n8n: {
    webhookUrl: process.env.N8N_WEBHOOK_URL ?? '',
    webhookSecret: process.env.N8N_WEBHOOK_SECRET ?? '',
  },
  razorpay: {
    keyId: process.env.RAZORPAY_KEY_ID ?? '',
    keySecret: process.env.RAZORPAY_KEY_SECRET ?? '',
    webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET ?? '',
  },
});
