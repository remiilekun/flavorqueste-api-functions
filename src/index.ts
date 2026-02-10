import "dotenv/config";
import express, { Express } from "express";
import cors from "cors";
import bodyParser from "body-parser";
import cookieParser from "cookie-parser";
import { getHome } from "./controller/home.controller";
import { getGeo } from "./controller/geo.controller";

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(cors());
app.use(bodyParser.json());
app.use(cookieParser());

app.get("/", getHome);
app.get("/api/geo", getGeo);

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
