/**
 * Direct-sold ads, run from the site rather than through flytedesk.
 *
 * Each booking carries its own run dates, so an ad goes up and comes down on
 * schedule without anyone remembering to ship a change on the day. The pages
 * that show ads render on request, so the check happens per request; the only
 * lag is the edge cache in front of them (a minute on the homepage, up to an
 * hour on articles).
 *
 * Dates are inclusive calendar days in Philadelphia time, matching how
 * advertisers book them ("9/22 to 10/31" means all of Oct 31, Eastern).
 * Expired entries can be deleted along with their image in public/images/ads.
 */

export type AdPlacement = "homepage-banner" | "sidebar";

export type Ad = {
  placement: AdPlacement;
  /** First day the ad runs, YYYY-MM-DD, Eastern. */
  start: string;
  /** Last day the ad runs, YYYY-MM-DD, Eastern. */
  end: string;
  image: string;
  href: string;
  alt: string;
};

export const ads: Ad[] = [
  {
    placement: "homepage-banner",
    start: "2026-09-22",
    end: "2026-10-31",
    image: "/images/ads/aws_banner_092226_to_103126.png",
    href: "https://bit.ly/3TGzu3l",
    alt: "AWS Builder Center Giveaway: enter for your chance to win a voucher worth up to $1,500",
  },
  {
    placement: "sidebar",
    start: "2026-09-20",
    end: "2026-09-26",
    image: "/images/ads/drexel_flea_092026_to_092626.jpg",
    href: "https://www.philafleamarkets.org",
    alt: "Drexel University 2026 Vintage & Antique Flea Market, along Lancaster Avenue: Saturday, September 26 and Saturday, October 24, 8am to 5pm",
  },
  {
    placement: "sidebar",
    start: "2026-10-18",
    end: "2026-10-24",
    image: "/images/ads/drexel_flea_101826_to_102426.webp",
    href: "https://www.philafleamarkets.org",
    alt: "Vintage & Antique Flea Market at Drexel University, Saturday, October 24, 8am to 5pm, along Lancaster Avenue from 34th to 36th",
  },
];

const easternDate = new Intl.DateTimeFormat("en-CA", {
  timeZone: "America/New_York",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** The ads running in `placement` on the Eastern calendar day containing `now`. */
export function activeAds(placement: AdPlacement, now: Date = new Date()): Ad[] {
  // en-CA formats as YYYY-MM-DD, so plain string comparison orders the days.
  const today = easternDate.format(now);
  return ads.filter((ad) => ad.placement === placement && ad.start <= today && today <= ad.end);
}
