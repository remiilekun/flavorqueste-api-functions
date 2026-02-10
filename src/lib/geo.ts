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
};

const CACHE_TTL_SECONDS = 60 * 60 * 24;

const getForwardedIp = (value: string | string[] | undefined): string | null => {
  if (!value) return null;
  const raw = Array.isArray(value) ? value[0] : value;
  const first = raw.split(",")[0]?.trim();
  return first || null;
};

export const getRequestIp = (req: Request): string | null => {
  return (
    getForwardedIp(req.headers["x-forwarded-for"]) ||
    req.socket.remoteAddress ||
    null
  );
};

const lookupGeoLite = (ip: string): GeoResult | null => {
  const geo = geoip.lookup(ip);
  if (!geo) return null;
  return {
    city: geo.city,
    country: geo.country,
    countryRegion: geo.region,
    timezone: geo.timezone,
    latitude: geo.ll?.[0],
    longitude: geo.ll?.[1],
  };
};

export const lookupGeo = async (ip: string): Promise<GeoResult | null> => {
  const cacheKey = `geo:${ip}`;
  const cached = await redis.get(cacheKey);
  if (cached) {
    try {
      return JSON.parse(cached) as GeoResult;
    } catch {
      // If cache is corrupted, continue to live lookup.
    }
  }

  const apiKey = process.env.IPLOCATE_API_KEY;
  if (!apiKey) {
    const fallback = lookupGeoLite(ip);
    if (fallback) {
      await redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(fallback));
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
    };

    await redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(result));
    return result;
  } catch (error) {
    console.error("IPLocate lookup failed:", error);
    const fallback = lookupGeoLite(ip);
    if (fallback) {
      await redis.setEx(cacheKey, CACHE_TTL_SECONDS, JSON.stringify(fallback));
    }
    return fallback;
  }
};
