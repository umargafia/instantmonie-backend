declare module 'hpp' {
  import { RequestHandler } from 'express';

  interface HppOptions {
    whitelist?: string[];
  }

  const hpp: (options?: HppOptions) => RequestHandler;
  export default hpp;
}
