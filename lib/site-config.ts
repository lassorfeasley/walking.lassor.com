export const SITE_NAME = "Walking Forward";
export const SITE_DESCRIPTION = "Panorama image processing and Instagram automation";
export const SITE_HOME_DESCRIPTION =
  "Walking Forward documents Lassor's travels from an unconventional point of view.";
export const DEFAULT_PANORAMA_TITLE = "Walking Forward panorama";
export const DEFAULT_PANORAMA_DESCRIPTION = "Walking Forward panorama detail view.";
export const DEFAULT_OG_IMAGE_PATH = "/og-default.png";

function normalizeSiteUrl(value: string) {
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  return `https://${value}`;
}

export function getSiteUrl() {
  if (process.env.NEXT_PUBLIC_SITE_URL) {
    return process.env.NEXT_PUBLIC_SITE_URL;
  }
  if (process.env.VERCEL_URL) {
    return normalizeSiteUrl(process.env.VERCEL_URL);
  }
  return "http://localhost:3000";
}

export function absoluteUrl(pathOrUrl: string | URL) {
  if (!pathOrUrl) {
    return getSiteUrl();
  }

  const value = pathOrUrl.toString();
  if (value.startsWith("http://") || value.startsWith("https://")) {
    return value;
  }
  if (value.startsWith("//")) {
    return `https:${value}`;
  }

  return new URL(value.startsWith("/") ? value : `/${value}`, getSiteUrl()).toString();
}

