// Homepage carousel slides, shared by Banner.astro (which draws them) and
// HeroBackgroundPreload.astro (which hints the background they may need) so the
// two always agree. Pure functions only, so tests can run them under plain Node.
import type { HomepageCarouselSlide } from "./types";

/**
 * The 100-years art behind any text-only slide. It is a CSS background
 * (.one-hundred-bg in global.css), so the browser would otherwise only find it
 * after downloading and parsing that stylesheet -- and it is the homepage LCP.
 */
export const ANNIVERSARY_BACKGROUND_URL = "/images/100YearBanner.webp";

/** Used when the CMS sends no carousel. */
export const DEFAULT_CAROUSEL_SLIDES: HomepageCarouselSlide[] = [
  {
    enabled: true,
    title: "100 Years of The Triangle",
    link_url: "/one-hundred",
    image_url: "",
    background_color: "",
    text_color: "#ffffff",
    desktop_only: true,
  },
  {
    enabled: true,
    title: "Podcast",
    link_url: "https://tr.ee/bqz8s-E4NK",
    image_url: "/images/PodcastBanner.webp",
    background_color: "#acd4f4",
    text_color: "#ffffff",
    desktop_only: false,
  },
  {
    enabled: true,
    title: "Classifieds",
    link_url: "/classifieds",
    image_url: "/images/classifiedsBannerNew.webp",
    background_color: "#E5E7EB",
    text_color: "#ffffff",
    desktop_only: false,
  },
  {
    enabled: true,
    title: "Apply to The Triangle",
    link_url: "https://docs.google.com/forms/d/e/1FAIpQLScra_6sUenvmpIuQ5FjmMyWO0a2sz9z36HkrqfnYQvJGH9BGQ/viewform",
    image_url: "/images/applyBannerNew.webp",
    background_color: "#275997",
    text_color: "#ffffff",
    desktop_only: false,
  },
];

/** The slides the carousel actually shows. */
export function visibleCarouselSlides(slides: HomepageCarouselSlide[] = []): HomepageCarouselSlide[] {
  return (slides.length > 0 ? slides : DEFAULT_CAROUSEL_SLIDES).filter((slide) => slide.enabled);
}

/** Whether the carousel draws the anniversary background (any text-only slide). */
export function showsAnniversaryBackground(slides: HomepageCarouselSlide[] = []): boolean {
  return visibleCarouselSlides(slides).some((slide) => !slide.image_url);
}
