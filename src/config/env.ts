import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('production'),
  PORT: z.string().default('3000'),
  DATABASE_URL: z
    .string()
    .default('mongodb+srv://mynewuser:VVZcSgNFjoaIz07D@cluster0.xk8il7z.mongodb.net/instantmonie'),
  JWT_SECRET: z.string().default('instant-super-secret-jwt-key-123'),
  JWT_EXPIRES_IN: z.string().default('90d'),
  JWT_COOKIE_EXPIRES_IN: z.string().default('90'),
  EMAIL_HOST: z.string().default('mail.gafiapay.com'),
  EMAIL_PORT: z.string().default('465'),
  EMAIL_USERNAME: z.string().default('support@gafiapay.com'),
  EMAIL_PASSWORD: z.string().default('xeivcr4xs2672345Dc'),
  EMAIL_FROM: z.string().default('support@gafiapay.com'),
  PALMPAY_API_URL: z.string().default('https://open-gw-prod.palmpay-inc.com/'),
  PALMPAY_APP_ID: z.string().default('L250206113535701113401'),
  PALMPAY_COUNTRY_CODE: z.string().default('NG'),
  PALMPAY_MERCHANT_PRIVATE_KEY: z
    .string()
    .default(`-----BEGIN PRIVATE KEY-----private key-----END PRIVATE KEY-----`),
  PALMPAY_PUBLIC_KEY: z
    .string()
    .default(`-----BEGIN PUBLIC KEY-----public key-----END PUBLIC KEY-----`),
  PALMPAY_MERCHANT_ID: z.string().default('125010214146001'),
  ENCRYPTION_KEY: z
    .string()
    .default('fec841e00d8991a476d17b4a84680eec9619700c6d01466be9eb8f6232be243b'),
});

type Env = z.infer<typeof envSchema>;

const parseEnvVars = (): Env => {
  try {
    return envSchema.parse(process.env);
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missingVars = error.errors.map((err) => err.path.join('.')).join(', ');
      console.warn(
        `Warning: Missing or invalid environment variables: ${missingVars}. Using default values.`
      );
      return envSchema.parse({});
    }
    throw error;
  }
};

export const env = parseEnvVars();
