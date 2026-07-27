/// <reference types="astro/client" />

declare global {
  interface Window {
    /**
     * Matomo's command queue. Created by the inline tracker snippet in
     * Matomo.astro / ArticleLayout.astro before matomo.js loads, so it may be
     * absent on the first ticks of a page's life — always guard before pushing.
     */
    _paq?: unknown[][];
  }
}

export {};
