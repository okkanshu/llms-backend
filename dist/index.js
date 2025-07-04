"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const types_1 = require("./types");
const website_analysis_1 = __importDefault(require("./routes/website-analysis"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8000;
const allowedOrigins = [
    "https://thellmstxt.com",
    "https://llmstxt.store",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:8000",
];
app.use((0, cors_1.default)({
    origin: function (origin, callback) {
        if (!origin)
            return callback(null, true);
        if (allowedOrigins.indexOf(origin) !== -1) {
            callback(null, true);
        }
        else {
            console.log(`CORS blocked origin: ${origin}`);
            callback(new Error("Not allowed by CORS"));
        }
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: [
        "Content-Type",
        "Authorization",
        "X-Requested-With",
        "Accept",
    ],
    optionsSuccessStatus: 200,
    preflightContinue: false,
}));
app.options("*", (0, cors_1.default)());
app.use((0, helmet_1.default)());
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        service: "TheLLMsTxt Backend",
    });
});
app.get("/api/llm-bots", (req, res) => {
    res.json({
        success: true,
        bots: Object.values(types_1.LLM_BOT_CONFIGS),
    });
});
app.use("/api", website_analysis_1.default);
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Welcome to TheLLMsTxt Backend API!",
        endpoints: ["/health", "/api/llm-bots", "/api/analyze-website"],
    });
});
app.use((err, req, res, next) => {
    console.error("Error:", err);
    res.status(500).json({
        success: false,
        error: "Internal server error",
        message: err.message,
    });
});
app.use((req, res) => {
    res.status(404).json({
        success: false,
        error: "Endpoint not found",
        path: req.originalUrl,
    });
});
app.listen(PORT, () => {
    console.log(`🚀 TheLLMsTxt Backend server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
    console.log(`🤖 LLM Bots: http://localhost:${PORT}/api/llm-bots`);
    console.log(`🔍 Website Analysis: http://localhost:${PORT}/api/analyze-website`);
});
exports.default = app;
//# sourceMappingURL=index.js.map