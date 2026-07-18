export type PlaceImage = {
  url: string;
  alt: string;
  credit: string;
  license: string;
  licenseUrl?: string;
  sourceUrl: string;
  provider: "Wikimedia Commons";
};

type ImageInfo = {
  thumburl?: string;
  url?: string;
  descriptionurl?: string;
  thumbwidth?: number;
  thumbheight?: number;
  width?: number;
  height?: number;
  mime?: string;
  extmetadata?: Record<string, { value?: string }>;
};

type CommonsPage = { title?: string; index?: number; imageinfo?: ImageInfo[] };

const apiUrl = "https://commons.wikimedia.org/w/api.php";
const cache = new Map<string, Promise<PlaceImage | null>>();
const rejectWords = /\b(flag|logo|icon|map|diagram|seal|coat of arms|poster|banner|sign|portrait|painting|drawing|plan)\b/i;
const foodWords = /(餐|吃|美食|小吃|酒吧|咖啡|午饭|午餐|晚饭|晚餐|早餐|restaurant|food|bar|cafe|tapas)/i;
const locationAliases: Array<[RegExp, string]> = [
  [/马德里/gu, "Madrid"], [/布达佩斯/gu, "Budapest"], [/唐山/gu, "Tangshan"], [/北京/gu, "Beijing"], [/上海/gu, "Shanghai"],
  [/广州/gu, "Guangzhou"], [/深圳/gu, "Shenzhen"], [/香港/gu, "Hong Kong"], [/澳门/gu, "Macau"], [/台北/gu, "Taipei"],
  [/东京/gu, "Tokyo"], [/大阪/gu, "Osaka"], [/首尔/gu, "Seoul"], [/新加坡/gu, "Singapore"], [/曼谷/gu, "Bangkok"],
  [/巴黎/gu, "Paris"], [/伦敦/gu, "London"], [/罗马/gu, "Rome"], [/米兰/gu, "Milan"], [/巴塞罗那/gu, "Barcelona"],
  [/里斯本/gu, "Lisbon"], [/维也纳/gu, "Vienna"], [/布拉格/gu, "Prague"], [/柏林/gu, "Berlin"], [/慕尼黑/gu, "Munich"],
  [/纽约/gu, "New York"], [/洛杉矶/gu, "Los Angeles"], [/旧金山/gu, "San Francisco"], [/悉尼/gu, "Sydney"], [/迪拜/gu, "Dubai"],
];

function plainText(value: string | undefined) {
  return (value ?? "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function mapDestination(links: unknown) {
  if (!Array.isArray(links)) return "";
  for (const item of links) {
    if (!item || typeof item !== "object") continue;
    const url = (item as { url?: unknown }).url;
    if (typeof url !== "string") continue;
    try {
      const parsed = new URL(url);
      if (!parsed.hostname.includes("google.") || !parsed.pathname.includes("/maps")) continue;
      const value = parsed.searchParams.get("destination") ?? parsed.searchParams.get("query");
      if (value) return value.slice(0, 120);
    } catch { /* Ignore malformed model links. */ }
  }
  return "";
}

export function imageQueryForStop(stop: Record<string, unknown>, destination: string) {
  if (typeof stop.imageQuery === "string" && stop.imageQuery.trim()) return stop.imageQuery.trim().slice(0, 180);
  const mapped = mapDestination(stop.links);
  if (mapped) return `${mapped} ${destination}`.trim();
  const title = typeof stop.title === "string" ? stop.title : "";
  const cleaned = title
    .replace(/^(前往|到达|抵达|返回|回到|出发去?|参观|游览|漫步|探索|享用|品尝|入住|休息)\s*/u, "")
    .replace(/(与返程|和返程|后返程|附近|周边)$/u, "")
    .trim();
  if (foodWords.test(`${title} ${String(stop.text ?? "")}`)) return `${cleaned || destination} local food restaurant ${destination}`.trim();
  return `${cleaned || title || destination} landmark ${destination}`.trim();
}

function scorePage(page: CommonsPage, query: string) {
  const info = page.imageinfo?.[0];
  const title = page.title ?? "";
  const words = query.toLocaleLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2);
  const haystack = `${title} ${plainText(info?.extmetadata?.ImageDescription?.value)}`.toLocaleLowerCase();
  const matches = words.filter((word) => haystack.includes(word)).length;
  const landscape = (info?.thumbwidth ?? info?.width ?? 0) >= (info?.thumbheight ?? info?.height ?? 1);
  return matches * 10 + (landscape ? 4 : 0) - (rejectWords.test(title) ? 20 : 0) - Math.min(page.index ?? 20, 10) / 10;
}

async function searchCommons(query: string): Promise<PlaceImage | null> {
  const params = new URLSearchParams({
    action: "query",
    generator: "search",
    gsrsearch: query,
    gsrnamespace: "6",
    gsrlimit: "8",
    prop: "imageinfo",
    iiprop: "url|mime|size|extmetadata",
    iiurlwidth: "960",
    iiextmetadatafilter: "Artist|Credit|LicenseShortName|LicenseUrl|ImageDescription",
    iiextmetadatalanguage: "zh",
    format: "json",
    formatversion: "2",
    origin: "*",
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6_000);
  try {
    const response = await fetch(`${apiUrl}?${params}`, {
      headers: { "User-Agent": "ROAM travel planner/1.0 (https://roam.animaseed.com/)" },
      signal: controller.signal,
      next: { revalidate: 60 * 60 * 24 * 14 },
    });
    if (!response.ok) return null;
    const payload = await response.json() as { query?: { pages?: CommonsPage[] } };
    const pages = (payload.query?.pages ?? []).filter((page) => {
      const info = page.imageinfo?.[0];
      return Boolean(info?.thumburl && info.mime?.startsWith("image/") && !/svg|gif/i.test(info.mime));
    });
    const page = pages.sort((a, b) => scorePage(b, query) - scorePage(a, query))[0];
    const info = page?.imageinfo?.[0];
    if (!page || !info?.thumburl || !info.descriptionurl) return null;
    const metadata = info.extmetadata ?? {};
    const artist = plainText(metadata.Artist?.value) || plainText(metadata.Credit?.value) || "Wikimedia Commons contributor";
    return {
      url: info.thumburl,
      alt: plainText(metadata.ImageDescription?.value).slice(0, 180) || (page.title ?? "地点参考图").replace(/^File:/, ""),
      credit: artist.slice(0, 120),
      license: plainText(metadata.LicenseShortName?.value) || "查看来源页授权",
      licenseUrl: metadata.LicenseUrl?.value,
      sourceUrl: info.descriptionurl,
      provider: "Wikimedia Commons",
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function latinFallback(query: string) {
  const aliased = locationAliases.reduce((value, [pattern, replacement]) => value.replace(pattern, ` ${replacement} `), query);
  const latin = aliased.split(/\s+/).filter((token) => /[A-Za-zÀ-ž]/.test(token)).join(" ").replace(/\s+/g, " ").trim();
  if (foodWords.test(query)) return `${latin} cuisine restaurant food`.replace(/\b(local|food|restaurant|cuisine)\b(?:\s+\b\1\b)+/gi, "$1").trim();
  return `${latin} city landmark`.replace(/\b(city|landmark)\b(?:\s+\b\1\b)+/gi, "$1").trim();
}

async function searchWithFallback(query: string) {
  const fallback = latinFallback(query);
  if (fallback && fallback.toLocaleLowerCase() !== query.toLocaleLowerCase()) {
    const fallbackImage = await searchCommons(fallback);
    if (fallbackImage) return fallbackImage;
  }
  const direct = await searchCommons(query);
  if (direct) return direct;
  const knownCity = locationAliases.find(([pattern]) => new RegExp(pattern.source, pattern.flags.replace("g", "")).test(query))?.[1];
  const city = knownCity ?? fallback.split(/\s+/).filter((word) => !/^(landmark|city|local|food|restaurant|cuisine)$/i.test(word)).slice(-1).join(" ");
  return searchCommons(foodWords.test(query) ? `${city} cuisine` : `${city} cityscape`);
}

export function findPlaceImage(query: string) {
  const normalized = query.replace(/\s+/g, " ").trim().slice(0, 220);
  if (!normalized) return Promise.resolve(null);
  const key = normalized.toLocaleLowerCase();
  const existing = cache.get(key);
  if (existing) return existing;
  const pending = searchWithFallback(normalized);
  cache.set(key, pending);
  if (cache.size > 500) cache.delete(cache.keys().next().value as string);
  return pending;
}

export async function enrichPlanImages(plan: Record<string, unknown>) {
  const destination = typeof plan.destination === "string" ? plan.destination : "";
  const days = Array.isArray(plan.days) ? plan.days : [];
  const stops = days.flatMap((day) => day && typeof day === "object" && Array.isArray((day as { stops?: unknown[] }).stops)
    ? (day as { stops: unknown[] }).stops.filter((stop): stop is Record<string, unknown> => Boolean(stop) && typeof stop === "object" && !Array.isArray(stop))
    : []);
  let cursor = 0;
  let matched = 0;
  async function worker() {
    while (cursor < stops.length) {
      const stop = stops[cursor++];
      if (stop.image && typeof stop.image === "object") { matched += 1; continue; }
      const image = await findPlaceImage(imageQueryForStop(stop, destination));
      if (image) { stop.image = image; matched += 1; }
    }
  }
  await Promise.all(Array.from({ length: Math.min(5, stops.length) }, () => worker()));
  return { plan, matched, total: stops.length };
}
