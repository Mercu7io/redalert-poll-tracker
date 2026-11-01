const path = require('path');
const dotenv = require('dotenv');
const { z } = require('zod');

dotenv.config();

const envSchema = z.object({
    PORT: z.coerce.number().default(3500),
    APP_PASSWORD: z.string().min(1, "APP_PASSWORD must not be empty").default('admin123'),
    ALERT_TARGET_NUMBER: z.string().optional().nullable().transform(val => (val && val.trim() ? val.trim() : null)),
    ALERT_LANGUAGE: z.enum(['en', 'fr']).default('en'),
    NODE_ENV: z.enum(['development', 'production', 'test']).default('development')
});

const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
    console.error('Invalid environment variables:', parsed.error.format());
    process.exit(1);
}

const rootDir = path.resolve(__dirname, '..', '..');
const dbDir = path.join(rootDir, 'data');
const dbPath = path.join(dbDir, 'sondages.db');
const authDir = path.join(rootDir, '.baileys_auth');

module.exports = {
    ...parsed.data,
    rootDir,
    dbDir,
    dbPath,
    authDir
};

