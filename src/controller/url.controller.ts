import { Request, Response } from "express";
import bcrypt from "bcryptjs";
import shortid from "shortid";
import geoip from "geoip-lite";
import prisma from "../prisma/client";

export const shortenUrl = async (req: Request, res: Response) => {
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
};

export const getAnalytics = async (req: Request, res: Response) => {
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
};

export const redirectUrl = async (req: Request, res: Response) => {
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
};
