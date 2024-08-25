import { Request, Response } from "express";
import geoip from "geoip-lite";

export const getGeo = async (req: Request, res: Response) => {
  const ip = req.headers["x-forwarded-for"] || req.socket.remoteAddress;
  const geo = geoip.lookup(ip as string);

  res.send({
    geo: {
      city: geo?.city,
      country: geo?.country,
      countryRegion: geo?.region,
      timezone: geo?.timezone,
      latitude: geo?.ll?.[0],
      longitude: geo?.ll?.[1],
    },
    ip,
  });
};
