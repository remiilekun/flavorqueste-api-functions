import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import geoip from "geoip-lite";
import bcrypt from "bcryptjs";
import shortid from "shortid";
import { generateQRCodeWithLogo } from "./lib/qr";
import prisma from "./prisma/client";
import pkg from "../package.json";
import redis from "./lib/redis";

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

app.get("/api/geo", async (req: Request, res: Response) => {
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
});

app.get("/api/qr/generate", async (req: Request, res: Response) => {
  let url = req.query.url as string;
  const download = (req.query.download as string) === "true";
  const filename = (req.query.filename as string) || "qr-code.png";

  if (!url) {
    return res.status(400).send("URL parameter is required");
  }

  try {
    url = url.replace(/\/$/, "");

    const parsedUrl = new URL(url);
    if (!parsedUrl.hostname.includes("flavorqueste.com")) {
      return res.status(400).send("URL must be from https://flavorqueste.com/");
    }

    const cacheKey = `qr:${url}`;
    const cachedQRCode = await redis.get(cacheKey);

    if (cachedQRCode) {
      console.log("Serving from Redis cache");
      const buffer = Buffer.from(cachedQRCode, "base64");
      if (download) {
        return res
          .type("png")
          .header("Content-Disposition", `attachment; filename="${filename}"`)
          .send(buffer);
      } else {
        return res.type("png").send(buffer);
      }
    }

    const qrBuffer = await generateQRCodeWithLogo({ url });

    await redis.setEx(cacheKey, 60 * 60 * 24, qrBuffer.toString("base64")); // Store for 24 hours

    if (download) {
      res
        .type("png")
        .header("Content-Disposition", `attachment; filename="${filename}"`)
        .send(qrBuffer);
    } else {
      res.type("png").send(qrBuffer);
    }
  } catch (error) {
    console.error("Error generating QR code:", error);
    res.status(500).send("Error generating QR code");
  }
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

app.get("/api/analytics/:shortCode", async (req, res) => {
  const { shortCode } = req.params;

  const url = await prisma.url.findUnique({
    where: { shortCode },
    include: { visits: true },
  });

  if (!url) {
    return res.status(404).json({ error: "URL not found" });
  }

  res.status(200).json({
    originalUrl: url.originalUrl,
    clicks: url.clicks,
    visits: url.visits.map((visit) => ({
      ip: visit.ip,
      userAgent: visit.userAgent,
      referrer: visit.referrer,
      location: visit.location,
      timestamp: visit.createdAt,
    })),
  });
});

app.get("/:shortCode", async (req, res) => {
  const { shortCode } = req.params;

  const url = await prisma.url.findUnique({ where: { shortCode } });

  if (!url || (url.expiresAt && new Date() > url.expiresAt)) {
    return res.status(404).json({ error: "URL not found or expired" });
  }

  if (url.password) {
    const { password } = req.query as { password: string };

    if (!password || !(await bcrypt.compare(password, url.password))) {
      return res.status(401).json({ error: "Unauthorized" });
    }
  }

  await prisma.visit.create({
    data: {
      urlId: url.id,
      ip: (req.headers["x-forwarded-for"] ||
        req.socket.remoteAddress) as string,
      userAgent: req.headers["user-agent"],
      referrer: req.headers.referer,
      location: geoip.lookup(
        (req.headers["x-forwarded-for"] || req.socket.remoteAddress) as string
      )?.country,
    },
  });

  await prisma.url.update({
    where: { id: url.id },
    data: { clicks: { increment: 1 } },
  });

  res.redirect(url.originalUrl);
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
