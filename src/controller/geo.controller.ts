import { Request, Response } from "express";
import { getRequestGeo } from "../lib/geo";

export const getGeo = async (req: Request, res: Response) => {
  const { ip, geo } = await getRequestGeo(req);

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
