declare module 'jsonwebtoken' {
  export interface SignOptions {
    expiresIn?: string | number;
    algorithm?: string;
    audience?: string;
    issuer?: string;
    jwtid?: string;
    subject?: string;
    noTimestamp?: boolean;
    header?: object;
    keyid?: string;
    mutatePayload?: boolean;
  }

  export interface VerifyOptions {
    algorithms?: string[];
    audience?: string | string[];
    clockTimestamp?: number;
    issuer?: string | string[];
    ignoreExpiration?: boolean;
    subject?: string;
    jwtid?: string;
    nonce?: string;
  }

  export function sign(
    payload: string | object | Buffer,
    secretOrPrivateKey: string | Buffer | object,
    options?: SignOptions
  ): string;

  export function verify(
    token: string,
    secretOrPublicKey: string | Buffer | object,
    options?: VerifyOptions
  ): object | string;
}
