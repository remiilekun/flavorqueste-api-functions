import { Request, Response } from "express";
import { getRequestGeo } from "../lib/geo";

export const getGeo = async (req: Request, res: Response) => {
  const { ip, geo } = await getRequestGeo(req);

  res.send({ geo, ip });
};
