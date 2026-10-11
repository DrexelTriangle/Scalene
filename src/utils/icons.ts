// Inline SVG icons for components/Icon.astro.
//
// These replace the Font Awesome webfont, which cost every page ~60 KB of CSS
// and four woff2 files (~258 KB) to draw seven glyphs.
//
// The path and viewBox data below is copied unchanged from
// @fortawesome/fontawesome-free 7.3.1 (svgs/solid and svgs/brands):
//   Font Awesome Free 7.3.1 by @fontawesome - https://fontawesome.com
//   License - https://fontawesome.com/license/free
//   (Icons: CC BY 4.0, Fonts: SIL OFL 1.1, Code: MIT License)
//   Copyright 2026 Fonticons, Inc.
// Brand icons are trademarks of their respective owners and are used here only
// to link to The Triangle's accounts on those services.

export type IconData = { viewBox: string; path: string };

export const icons = {
  // svgs/solid/magnifying-glass.svg
  'magnifying-glass': {
    viewBox: '0 0 512 512',
    path: 'M416 208c0 45.9-14.9 88.3-40 122.7L502.6 457.4c12.5 12.5 12.5 32.8 0 45.3s-32.8 12.5-45.3 0L330.7 376C296.3 401.1 253.9 416 208 416 93.1 416 0 322.9 0 208S93.1 0 208 0 416 93.1 416 208zM208 352a144 144 0 1 0 0-288 144 144 0 1 0 0 288z',
  },
  // svgs/solid/bars.svg
  bars: {
    viewBox: '0 0 448 512',
    path: 'M0 96C0 78.3 14.3 64 32 64l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 128C14.3 128 0 113.7 0 96zM0 256c0-17.7 14.3-32 32-32l384 0c17.7 0 32 14.3 32 32s-14.3 32-32 32L32 288c-17.7 0-32-14.3-32-32zM448 416c0 17.7-14.3 32-32 32L32 448c-17.7 0-32-14.3-32-32s14.3-32 32-32l384 0c17.7 0 32 14.3 32 32z',
  },
  // svgs/solid/xmark.svg (the header's old "close" glyph)
  xmark: {
    viewBox: '0 0 384 512',
    path: 'M55.1 73.4c-12.5-12.5-32.8-12.5-45.3 0s-12.5 32.8 0 45.3L147.2 256 9.9 393.4c-12.5 12.5-12.5 32.8 0 45.3s32.8 12.5 45.3 0L192.5 301.3 329.9 438.6c12.5 12.5 32.8 12.5 45.3 0s12.5-32.8 0-45.3L237.8 256 375.1 118.6c12.5-12.5 12.5-32.8 0-45.3s-32.8-12.5-45.3 0L192.5 210.7 55.1 73.4z',
  },
  // svgs/brands/instagram.svg
  instagram: {
    viewBox: '0 0 448 512',
    path: 'M224.3 141a115 115 0 1 0 -.6 230 115 115 0 1 0 .6-230zm-.6 40.4a74.6 74.6 0 1 1 .6 149.2 74.6 74.6 0 1 1 -.6-149.2zm93.4-45.1a26.8 26.8 0 1 1 53.6 0 26.8 26.8 0 1 1 -53.6 0zm129.7 27.2c-1.7-35.9-9.9-67.7-36.2-93.9-26.2-26.2-58-34.4-93.9-36.2-37-2.1-147.9-2.1-184.9 0-35.8 1.7-67.6 9.9-93.9 36.1s-34.4 58-36.2 93.9c-2.1 37-2.1 147.9 0 184.9 1.7 35.9 9.9 67.7 36.2 93.9s58 34.4 93.9 36.2c37 2.1 147.9 2.1 184.9 0 35.9-1.7 67.7-9.9 93.9-36.2 26.2-26.2 34.4-58 36.2-93.9 2.1-37 2.1-147.8 0-184.8zM399 388c-7.8 19.6-22.9 34.7-42.6 42.6-29.5 11.7-99.5 9-132.1 9s-102.7 2.6-132.1-9c-19.6-7.8-34.7-22.9-42.6-42.6-11.7-29.5-9-99.5-9-132.1s-2.6-102.7 9-132.1c7.8-19.6 22.9-34.7 42.6-42.6 29.5-11.7 99.5-9 132.1-9s102.7-2.6 132.1 9c19.6 7.8 34.7 22.9 42.6 42.6 11.7 29.5 9 99.5 9 132.1s2.7 102.7-9 132.1z',
  },
  // svgs/brands/x-twitter.svg
  'x-twitter': {
    viewBox: '0 0 448 512',
    path: 'M357.2 48L427.8 48 273.6 224.2 455 464 313 464 201.7 318.6 74.5 464 3.8 464 168.7 275.5-5.2 48 140.4 48 240.9 180.9 357.2 48zM332.4 421.8l39.1 0-252.4-333.8-42 0 255.3 333.8z',
  },
  // svgs/brands/letterboxd.svg
  letterboxd: {
    viewBox: '0 0 640 512',
    path: 'M521.3 128C586.9 128 640 181.1 640 246.6S586.9 365.2 521.3 365.2c-42.5 0-79.7-22.3-100.7-55.8 11.4-18.2 18-39.7 18-62.8s-6.6-44.6-18-62.8l.8-1.2c20.8-32.3 56.8-53.9 97.9-54.6l2 0zM320 128c42.5 0 79.7 22.3 100.7 55.8-11.4 18.2-18 39.7-18 62.8s6.6 44.6 18 62.8l-.8 1.2c-20.8 32.3-56.8 53.9-97.9 54.6l-2 0c-42.5 0-79.7-22.3-100.7-55.8 11.4-18.2 18-39.7 18-62.8s-6.6-44.6-18-62.8l.8-1.2c20.8-32.3 56.8-53.9 97.9-54.6l2 0zm-201.3 0c42.5 0 79.7 22.3 100.7 55.8-11.4 18.2-18 39.7-18 62.8s6.6 44.6 18 62.8l-.8 1.2c-20.8 32.3-56.8 53.9-97.9 54.6l-2 0C53.1 365.1 0 312.1 0 246.6S53.1 128 118.7 128z',
  },
  // svgs/brands/reddit-alien.svg
  'reddit-alien': {
    viewBox: '0 0 512 512',
    path: 'M373 138.6c-25.2 0-46.3-17.5-51.9-41-30.6 4.3-54.2 30.7-54.2 62.4l0 .2c47.4 1.8 90.6 15.1 124.9 36.3 12.6-9.7 28.4-15.5 45.5-15.5 41.3 0 74.7 33.4 74.7 74.7 0 29.8-17.4 55.5-42.7 67.5-2.4 86.8-97 156.6-213.2 156.6S45.5 410.1 43 323.4c-25.4-11.9-43-37.7-43-67.7 0-41.3 33.4-74.7 74.7-74.7 17.2 0 33 5.8 45.7 15.6 34-21.1 76.8-34.4 123.7-36.4l0-.3c0-44.3 33.7-80.9 76.8-85.5 4.9-24.2 26.3-42.4 52.1-42.4 29.4 0 53.3 23.9 53.3 53.3s-23.9 53.3-53.3 53.3zM157.5 255.3c-20.9 0-38.9 20.8-40.2 47.9s17.1 38.1 38 38.1 36.6-9.8 37.8-36.9-14.7-49.1-35.7-49.1l.1 0zM395 303.1c-1.2-27.1-19.2-47.9-40.2-47.9s-36.9 22-35.7 49.1 16.9 36.9 37.8 36.9 39.3-11 38-38.1l.1 0zm-60.1 70.8c1.5-3.6-1-7.7-4.9-8.1-23-2.3-47.9-3.6-73.8-3.6s-50.8 1.3-73.8 3.6c-3.9 .4-6.4 4.5-4.9 8.1 12.9 30.8 43.3 52.4 78.7 52.4s65.8-21.6 78.7-52.4z',
  },
} as const satisfies Record<string, IconData>;

export type IconName = keyof typeof icons;

/**
 * Accessibility attributes for an inline icon. With a label the SVG is an
 * image with that name; without one it is decoration and hidden from assistive
 * tech (the surrounding control or text carries the meaning).
 */
export function iconA11yAttributes(label?: string): Record<string, string> {
  const name = label?.trim();
  return name
    ? { role: 'img', 'aria-label': name }
    : { 'aria-hidden': 'true', focusable: 'false' };
}
