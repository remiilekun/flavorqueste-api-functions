import { Request, Response } from "express";
import pkg from "../../package.json";

export const getHome = (_: Request, res: Response) => {
  res.send({
    name: pkg.name,
    version: pkg.version,
  });
};
