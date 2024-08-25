import express, { Express } from "express";
import dotenv from "dotenv";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { getHome } from "./controller/home.controller";
import { getGeo } from "./controller/geo.controller";
import { generateQR } from "./controller/qr.controller";
import {
  shortenUrl,
  getAnalytics,
  redirectUrl,
} from "./controller/url.controller";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

app.get("/", getHome);
app.get("/api/geo", getGeo);
app.get("/api/qr/generate", generateQR);
app.post("/api/shorten", shortenUrl);
app.get("/api/analytics/:shortCode", getAnalytics);
app.get("/:shortCode", redirectUrl);

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
