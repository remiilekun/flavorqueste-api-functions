import express, { Express, Request, Response } from "express";
import dotenv from "dotenv";
import cors from "cors";
import pkg from "../package.json";

dotenv.config();

const app: Express = express();
const port = process.env.PORT || 3000;

app.use(express.json());
app.use(cors());

app.get("/", (req: Request, res: Response) => {
  res.send({
    name: pkg.name,
    version: pkg.version,
  });
});

app.listen(port, () => {
  console.log(`[server]: Server is running at http://localhost:${port}`);
});
