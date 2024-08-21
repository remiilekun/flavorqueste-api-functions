import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import geoip from "geoip-lite";
import bcrypt from "bcryptjs";
import shortid from "shortid";
import prisma from "./prisma/client";
import pkg from "../package.json";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

app.get("/", (_, res: Response) => {
  res.send({
    name: pkg.name,
    version: pkg.version,
  });
});

app.post("/api/shorten", async (req: Request, res: Response) => {
  const { originalUrl, customCode, expiresAt, password } = req.body;

  const shortCode = customCode || shortid.generate();
  const existingUrl = await prisma.url.findUnique({ where: { shortCode } });

  if (existingUrl) {
    return res.status(409).json({ error: "Short code already in use" });
  }

  const hashedPassword = password ? await bcrypt.hash(password, 10) : null;

  await prisma.url.create({
    data: {
      originalUrl,
      shortCode,
      customCode,
      expiresAt: expiresAt ? new Date(expiresAt) : null,
      password: hashedPassword,
    },
  });

  res.status(201).json({ url: `${req.headers.host}/${shortCode}` });
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
