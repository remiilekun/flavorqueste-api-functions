import { Request, Response } from "express";
import { getRequestIp, lookupGeo } from "../lib/geo";

export const getGeo = async (req: Request, res: Response) => {
  const ip = getRequestIp(req);
  const geo = ip ? await lookupGeo(ip) : null;

  res.send({
    geo: {
      city: geo?.city,
      country: geo?.country,
      countryRegion: geo?.countryRegion,
      timezone: geo?.timezone,
      latitude: geo?.latitude,
      longitude: geo?.longitude,
    },
    ip,
  });
};
