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
  EMAIL_HOST: z.string().default('mail.instantmonee.com'),
  EMAIL_PORT: z.string().default('465'),
  EMAIL_USERNAME: z.string().default('support@instantmonee.com'),
  EMAIL_PASSWORD: z.string().default('edcoicn43d3W'),
  EMAIL_FROM: z.string().default('support@instantmonee.com'),
  PALMPAY_API_URL: z.string().default('https://open-gw-prod.palmpay-inc.com/'),
  PALMPAY_APP_ID: z.string().default('L250824110105752250491'),
  PALMPAY_COUNTRY_CODE: z.string().default('NG'),
  PALMPAY_MERCHANT_PRIVATE_KEY: z.string().default(`-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDDdiSwfaBSYAFA
fg1UiirD5rWNZR9sIeRCbJJxhq7l3WhZxkp3VqFojMDwfgPSDkAxvDEA1mr0nHpZ
a/+psmnGKJmAisrNSsUx/7ssJy9hHRsUnmcch70ym8DJ+sPBA16pOOUO2GLQvppM
mo+mqWeXJUxA5lgO/8Az7ucW8tTQeNgtwnhfr0abjuhkSRNu7tLJV96UUbjayCgY
K7S+axsqDGqPhxLM3ZeE90Fui8mSOGLpfTq3fJ3a39lFVcaeHFuWCjl7TAqj6oHg
B406KGG2XYqzYQvaTE+yPkPjsNf4gFsueF2slcrrXnAAmmjkpk+pOZNT6aLko+MS
6vuuCFOTAgMBAAECggEALMe33yFg5g5tqv9WAXzIEGqeRH8a5FSdbWRfZpfzIOGJ
QywNKmsT/pZkq5RLPsgaB+r0FRuKlHD3DN6Ty6Z+2jG5/TuO+9p59BsBIDv3/FlF
N4OU3vHwNBR/5iZHy8QAX2eT/sMvXGCWjB9K8uVTwMqAPkwnd4Q7XgqJMfY/MGVg
g8k8M34lFez4dYmopldXAspdfseISDzA0BOB4+VoCQSjKBMlyp8fXNbMlUAEkMC/
IsWpeM3FUE0bEHI4eK/Y1wC43EB9uOKIS/ZFzc8SmdxzWIqmows1Ljt2HNcKSdlx
Fz1xJqozDZshggT1OHT+1DPTqbfMrq30MkUcNbi2vQKBgQDszJMe2hnyckFtQA04
isZa3mWk/46uXHEMUc62+CjZI6NwmRjHPAa7L9CX+2J9wyd4nAYmfc87rQ9NZHLK
pd8D4dpoHq20MFwJXk0f24BMbQyxz8Iqj4Y7kvnlA13h8nrDqxa0YLjhk87bTGmV
6u1JcE6E3HGUzQjXqxTbGOe1RQKBgQDTT326x9wpk8njwLfos69ArnRJklt6JF2n
qFC7mIZxWV+R/KqAbN+XNAuaxv7PaiQFmYD/gFrMhzxXB9DerdXw+HRlX/ittTQ0
NltRFzOL8sJ5grLrZBiOF3bVUZpW5WJE5uchy/R6yr2A7E/eULe3EEA3SLfOsQMp
4zTTCFqW9wKBgDZ3L3evLrynLwlT7DaPJOSNts9mwIi2VoJA5s0K80pOei9R53Mc
CWhQrSfn+FV458FEEd4Une/Z9GUWr5iQ4mTgM/4y4D1Lyj+VYyPqtu3dP0g+wyhK
7tMREU1totBvl3EeDxDaFmw8NR4Xy0liScXUgRrqIW3aYyhH/3oNlm4JAoGBALWC
98ZEvWp9h5N6zL838deGw18bODbQHB7TJx4to3akRcLaHf+ZBesVCs7WFrVGQFEL
DdLrh5Neq0c68IEHI9oNIbae3LciCwi6lHAwlNenHMRRr60hWzJbF3mf0grImUQE
cBAI6SW9F1EyLF0USusWK4MRlMoYJVaK06pe56n7AoGAE+M4r1mBdhIyVYRKfkm9
XAKTTxsuq/BOmVl1p1rE46JQj2WHD/kPIelhWK+gWMMfb5Ke198yoDmYgh1Glh+i
rl54zuCQXxOvPiPWSYErNqM4i+w15aaDdEkNbKgXu5fk7hfwCUmYxglmCamOPUHi
k3w0TtLkfHqW7j39r/l1vfU=
-----END PRIVATE KEY-----`),
  PALMPAY_PUBLIC_KEY: z.string().default(`-----BEGIN PUBLIC KEY-----
MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAw3YksH2gUmABQH4NVIoq
w+a1jWUfbCHkQmyScYau5d1oWcZKd1ahaIzA8H4D0g5AMbwxANZq9Jx6WWv/qbJp
xiiZgIrKzUrFMf+7LCcvYR0bFJ5nHIe9MpvAyfrDwQNeqTjlDthi0L6aTJqPpqln
lyVMQOZYDv/AM+7nFvLU0HjYLcJ4X69Gm47oZEkTbu7SyVfelFG42sgoGCu0vmsb
Kgxqj4cSzN2XhPdBbovJkjhi6X06t3yd2t/ZRVXGnhxblgo5e0wKo+qB4AeNOihh
tl2Ks2EL2kxPsj5D47DX+IBbLnhdrJXK615wAJpo5KZPqTmTU+mi5KPjEur7rghT
kwIDAQAB
-----END PUBLIC KEY-----`),
  PALMPAY_MERCHANT_ID: z.string().default('125072211218254'),
  ENCRYPTION_KEY: z
    .string()
    .default('fec843r00d8991a476d17b4a84680eec9619700c6d01466be9eb8f6232be243b'),
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
