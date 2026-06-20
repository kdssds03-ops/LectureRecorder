// Load environment variables from a local .env file during development.
// On Railway (and other hosts) env vars come from the dashboard, so this is a
// harmless no-op there, but it makes `npm run dev` / `npm start` work locally.
import 'dotenv/config';

export const config = {
  openAiKey: process.env.OPENAI_API_KEY || '',
  assemblyAiKey: process.env.ASSEMBLYAI_API_KEY || '',
  appSecret: process.env.APP_SECRET || 'default_secret',
};
