declare module "amp-toolbox-cache-url" {
  function createCacheUrl(cacheSuffix: string, url: string): Promise<string>;
  export = createCacheUrl;
}