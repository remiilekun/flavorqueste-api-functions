import { Request, Response } from "express";
import { generateQRCodeWithLogo } from "../lib/qr";
import redis from "../lib/redis";

export const generateQR = async (req: Request, res: Response) => {
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
};
