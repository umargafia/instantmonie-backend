import { Request } from 'express';

declare global {
  namespace Express {
    interface Request {
      requestTime?: string;
      user?: any;
    }
  }
}

declare module 'xss-clean' {
  import { RequestHandler } from 'express';
  const xss: () => RequestHandler;
  export default xss;
}

declare module 'hpp' {
  import { RequestHandler } from 'express';
  interface HppOptions {
    whitelist?: string[];
  }
  const hpp: (options?: HppOptions) => RequestHandler;
  export default hpp;
}
