import geoip from "geoip-lite";
import type { Request } from "express";
import redis from "./redis";

export type GeoResult = {
  city?: string;
  country?: string;
  countryRegion?: string;
  timezone?: string;
  latitude?: number;
  longitude?: number;
  source?: "cf" | "iplocate" | "geoip";
};

const CACHE_TTL_SECONDS = 60 * 60 * 24;

const log = {
  info: (...args: unknown[]) => console.log("[geo]", ...args),
  warn: (...args: unknown[]) => console.warn("[geo]", ...args),
  error: (...args: unknown[]) => console.error("[geo]", ...args),
  debug: (...args: unknown[]) => {
    if (process.env.GEO_LOG_LEVEL === "debug") {
      console.log("[geo][debug]", ...args);
    }
  },
};

const getForwardedIp = (value: string | string[] | undefined): string | null => {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const first = raw.split(",")[0]?.trim();
  return first || null;
};

export const getRequestIp = (req: Request): string | null => {
  const ip =
    getForwardedIp(req.headers["cf-connecting-ip"]) ||
    getForwardedIp(req.headers["x-forwarded-for"]) ||
    req.socket.remoteAddress ||
    null;
  log.debug("Resolved request IP", { ip });
  return ip;
};

const parseNumber = (value: string | string[] | undefined): number | undefined => {
  if (!value) return undefined;
  const raw = Array.isArray(value) ? value[0] : value;
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) ? parsed : undefined;
};

export const getCloudflareGeoFromHeaders = (req: Request): GeoResult | null => {
  const city = req.headers["cf-ipcity"];
  const country = req.headers["cf-ipcountry"];
  const region = req.headers["cf-region"];
  const timezone = req.headers["cf-timezone"];
  const latitude = parseNumber(req.headers["cf-iplatitude"]);
  const longitude = parseNumber(req.headers["cf-iplongitude"]);

  const hasAny =
    city ||
    country ||
    region ||
    timezone ||
    latitude !== undefined ||
    longitude !== undefined;

  if (!hasAny) {
    log.debug("No Cloudflare geo headers present");
    return null;
  }

  const result: GeoResult = {
    city: Array.isArray(city) ? city[0] : city,
    country: Array.isArray(country) ? country[0] : country,
    countryRegion: Array.isArray(region) ? region[0] : region,
    timezone: Array.isArray(timezone) ? timezone[0] : timezone,
    latitude,
    longitude,
    source: "cf",
  };
  log.debug("Cloudflare geo headers resolved", result);
  return result;
};

const lookupGeoLite = (ip: string): GeoResult | null => {
  const geo = geoip.lookup(ip);
  if (!geo) {
    log.debug("GeoIP Lite lookup miss", { ip });
    return null;
  }
  const result: GeoResult = {
    city: geo.city,
    country: geo.country,
    countryRegion: geo.region,
    timezone: geo.timezone,
    latitude: geo.ll?.[0],
    longitude: geo.ll?.[1],
    source: "geoip",
  };
  log.debug("GeoIP Lite lookup hit", { ip, result });
  return result;
};

export const lookupGeo = async (ip: string): Promise<GeoResult | null> => {
  const cacheKey = `geo:${ip}`;
  log.debug("Starting geo lookup", { ip, cacheKey });
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      const parsed = JSON.parse(cached) as GeoResult;
      log.debug("Geo cache hit", { ip, cacheKey, parsed });
      return parsed;
    } catch {
      // If cache is corrupted, continue to live lookup.
      log.warn("Geo cache parse failed", { ip, cacheKey });
    }
  }

  const apiKey = process.env.IPLOCATE_API_KEY;
  if (!apiKey) {
    log.debug("IPLocate API key not configured, using GeoIP Lite", { ip });
    const fallback = lookupGeoLite(ip);
    if (fallback) {
      try {
        await redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(fallback));
        log.debug("Geo cache set from GeoIP Lite", { ip, cacheKey });
      } catch (error) {
        log.warn("Geo cache set failed (GeoIP Lite)", { ip, cacheKey, error });
      }
    }
    return fallback;
  }

  try {
    const url = new URL(`https://iplocate.io/api/lookup/${encodeURIComponent(ip)}`);
    url.searchParams.set("apikey", apiKey);
    url.searchParams.set(
      "include",
      "country_code,subdivision,city,latitude,longitude,time_zone"
    );

    log.debug("Calling IPLocate", { ip });
    const response = await fetch(url.toString());
    if (!response.ok) {
      throw new Error(`IPLocate HTTP ${response.status}`);
    }

    const data = (await response.json()) as {
      city?: string;
      subdivision?: string;
      country_code?: string;
      time_zone?: string;
      latitude?: number;
      longitude?: number;
    };

    const result: GeoResult = {
      city: data.city,
      country: data.country_code,
      countryRegion: data.subdivision,
      timezone: data.time_zone,
      latitude: data.latitude,
      longitude: data.longitude,
      source: "iplocate",
    };

    try {
      await redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
      log.debug("Geo cache set from IPLocate", { ip, cacheKey });
    } catch (error) {
      log.warn("Geo cache set failed (IPLocate)", { ip, cacheKey, error });
    }
    return result;
  } catch (error) {
    log.error("IPLocate lookup failed", { ip, error });
    const fallback = lookupGeoLite(ip);
    if (fallback) {
      try {
        await redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(fallback));
        log.debug("Geo cache set from fallback GeoIP Lite", { ip, cacheKey });
      } catch (cacheError) {
        log.warn("Geo cache set failed (fallback GeoIP Lite)", {
          ip,
          cacheKey,
          error: cacheError,
        });
      }
    }
    return fallback;
  }
};

export const getRequestGeo = async (
  req: Request
): Promise<{ ip: string | null; geo: GeoResult | null }> => {
  const ip = getRequestIp(req);
  const headerGeo = getCloudflareGeoFromHeaders(req);
  const hasHeaderLatLong =
    headerGeo?.latitude !== undefined && headerGeo?.longitude !== undefined;

  if (hasHeaderLatLong) {
    log.debug("Resolved request geo from Cloudflare headers", { ip, geo: headerGeo });
    return { ip, geo: headerGeo };
  }

  const ipGeo = ip ? await lookupGeo(ip) : null;
  const hasIpLatLong =
    ipGeo?.latitude !== undefined && ipGeo?.longitude !== undefined;

  if (hasIpLatLong) {
    log.debug("Resolved request geo from IP lookup", { ip, geo: ipGeo });
    return { ip, geo: ipGeo };
  }

  const geo = headerGeo || ipGeo;
  log.debug("Resolved request geo (best available)", { ip, geo });
  return { ip, geo };
};
