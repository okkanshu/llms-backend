"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = __importDefault(require("express"));
const cors_1 = __importDefault(require("cors"));
const helmet_1 = __importDefault(require("helmet"));
const dotenv_1 = __importDefault(require("dotenv"));
const express_rate_limit_1 = __importDefault(require("express-rate-limit"));
const swagger_jsdoc_1 = __importDefault(require("swagger-jsdoc"));
const swagger_ui_express_1 = __importDefault(require("swagger-ui-express"));
const types_1 = require("./types");
const website_analysis_1 = __importDefault(require("./routes/website-analysis"));
const llms_enhanced_1 = __importDefault(require("./routes/llms-enhanced"));
const llms_generator_1 = __importDefault(require("./routes/llms-generator"));
const contact_1 = __importDefault(require("./routes/contact"));
const auth_1 = __importDefault(require("./routes/auth"));
const mongoose_1 = __importDefault(require("mongoose"));
dotenv_1.default.config();
const app = (0, express_1.default)();
const PORT = process.env.PORT || 8000;
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
    console.error("❌ MONGODB_URI not set in environment variables");
    process.exit(1);
}
mongoose_1.default
    .connect(mongoUri)
    .then(() => console.log("✅ Connected to MongoDB"))
    .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
});
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
}));
const limiter = (0, express_rate_limit_1.default)({
    windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"),
    max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"),
    message: {
        success: false,
        error: "Too many requests from this IP, please try again later.",
    },
    standardHeaders: true,
    legacyHeaders: false,
});
app.use(limiter);
app.use((0, helmet_1.default)());
app.use(express_1.default.json({ limit: "10mb" }));
app.use(express_1.default.urlencoded({ extended: true }));
const swaggerOptions = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "TheLLMsTxt API",
            version: "1.0.0",
            description: "API for generating LLMs.txt and enhanced LLM crawler configuration files",
            contact: {
                name: "TheLLMsTxt Support",
                url: "https://thellmstxt.com",
            },
        },
        servers: [
            {
                url: `http://localhost:${PORT}`,
                description: "Development server",
            },
            {
                url: "https://api.thellmstxt.com",
                description: "Production server",
            },
        ],
        components: {
            securitySchemes: {
                ApiKeyAuth: {
                    type: "apiKey",
                    in: "header",
                    name: "X-API-Key",
                },
            },
        },
    },
    apis: ["./src/routes/*.ts"],
};
const specs = (0, swagger_jsdoc_1.default)(swaggerOptions);
app.get("/health", (req, res) => {
    res.json({
        status: "OK",
        timestamp: new Date().toISOString(),
        service: "TheLLMsTxt Backend",
        version: "1.0.0",
        features: {
            ai_enrichment: !!process.env.XAI_API_KEY,
            automation: process.env.AUTOMATION_ENABLED === "true",
            analytics: process.env.ANALYTICS_ENABLED === "true",
        },
    });
});
app.get("/api/llm-bots", (req, res) => {
    res.json({
        success: true,
        bots: Object.values(types_1.LLM_BOT_CONFIGS),
    });
});
app.use("/api-docs", swagger_ui_express_1.default.serve, swagger_ui_express_1.default.setup(specs));
app.use("/api", website_analysis_1.default);
app.use("/api", llms_enhanced_1.default);
app.use("/api", llms_generator_1.default);
app.use("/api", contact_1.default);
app.use("/api", auth_1.default);
app.get("/", (req, res) => {
    res.json({
        success: true,
        message: "Welcome to TheLLMsTxt Backend API!",
        version: "1.0.0",
        endpoints: {
            health: "/health",
            llm_bots: "/api/llm-bots",
            analyze_website: "/api/analyze-website",
            generate_llms_full: "/api/generate-llms-full",
            generate_markdown: "/api/generate-markdown",
        },
        documentation: "/api-docs",
        features: {
            ai_enrichment: !!process.env.GEMINI_API_KEY,
            automation: process.env.AUTOMATION_ENABLED === "true",
            analytics: process.env.ANALYTICS_ENABLED === "true",
        },
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
        available_endpoints: [
            "/health",
            "/api/llm-bots",
            "/api/analyze-website",
            "/api/generate-llms-full",
            "/api/generate-markdown",
        ],
        documentation: "/api-docs",
    });
});
app.listen(PORT, () => {
    console.log(`🚀 TheLLMsTxt Backend server running on port ${PORT}`);
    console.log(`📊 Health check: http://localhost:${PORT}/health`);
});
exports.default = app;
//# sourceMappingURL=index.js.map