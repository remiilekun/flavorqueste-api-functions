"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const dotenv_1 = __importDefault(require("dotenv"));
const cors_1 = __importDefault(require("cors"));
const body_parser_1 = __importDefault(require("body-parser"));
const cookie_parser_1 = __importDefault(require("cookie-parser"));
const bcryptjs_1 = __importDefault(require("bcryptjs"));
const shortid_1 = __importDefault(require("shortid"));
const client_1 = __importDefault(require("./prisma/client"));
const package_json_1 = __importDefault(require("../package.json"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const port = process.env.PORT || 3000;
app.use((0, cors_1.default)());
app.use(body_parser_1.default.json());
app.use((0, cookie_parser_1.default)());
app.get("/", (_, res) => {
    res.send({
        name: package_json_1.default.name,
        version: package_json_1.default.version,
    });
});
app.post("/api/shorten", async (req, res) => {
    const { originalUrl, customCode, expiresAt, password } = req.body;
    const shortCode = customCode || shortid_1.default.generate();
    const existingUrl = await client_1.default.url.findUnique({ where: { shortCode } });
    if (existingUrl) {
        return res.status(409).json({ error: "Short code already in use" });
    }
    const hashedPassword = password ? await bcryptjs_1.default.hash(password, 10) : null;
    await client_1.default.url.create({
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
//# sourceMappingURL=index.js.map