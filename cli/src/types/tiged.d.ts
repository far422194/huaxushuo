declare module "tiged" {
  export interface TigedOptions {
    cache?: boolean;
    force?: boolean;
    verbose?: boolean;
    mode?: "tar" | "git";
    disableCache?: boolean;
  }
  export interface TigedEmitter {
    clone(destination: string): Promise<void>;
    on(event: string, handler: (info: unknown) => void): TigedEmitter;
  }
  export default function tiged(source: string, options?: TigedOptions): TigedEmitter;
}
