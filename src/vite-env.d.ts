/// <reference types="vite/client" />
/// <reference types="vitest/globals" />

declare module "*.mp3" {
  const src: string;
  export default src;
}
