import dotenv from 'dotenv';
dotenv.config();

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`❌ Missing required environment variable: ${name}`);
  }
  return value;
}

export const config = {
  port: parseInt(process.env.PORT ?? '3000', 10),
  nodeEnv: process.env.NODE_ENV ?? 'development',

  // Shared secret — mobile app must send this in x-app-key header
  appSecret: requireEnv('APP_SECRET'),

  // Third-party API keys — server-side only, never sent to clients
  assemblyAiKey: requireEnv('ASSEMBLYAI_API_KEY'),
  openAiKey: requireEnv('OPENAI_API_KEY'),
};
