const cmsBaseUrl = import.meta.env.CMS_API_BASE_URL ?? "https://localhost:8080/v1";
const normalizedCmsBaseUrl = String(cmsBaseUrl).replace(/\/$/, "");
const siteSettingsUrl = `${normalizedCmsBaseUrl}/settings/site`;
const defaultSiteTitle = "The Triangle";

type SiteSettingsResponse = {
  site_title?: string;
};

export async function getSiteTitle(): Promise<string> {
  try {
    const response = await fetch(siteSettingsUrl, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "no-store",
    });
    if (!response.ok) {
      return defaultSiteTitle;
    }
    const payload = (await response.json()) as SiteSettingsResponse;
    const title = String(payload.site_title ?? "").trim();
    return title || defaultSiteTitle;
  } catch {
    return defaultSiteTitle;
  }
}
