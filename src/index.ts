import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import rateLimit from "express-rate-limit";
import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { LLM_BOT_CONFIGS } from "./types";
import websiteAnalysisRoutes from "./routes/website-analysis";
import llmsEnhancedRoutes from "./routes/llms-enhanced";

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// CORS configuration - must come BEFORE other middleware
const allowedOrigins = [
  "https://thellmstxt.com",
  "https://llmstxt.store",
  "http://localhost:3000",
  "http://localhost:3001",
  "http://localhost:8000",
];

// Apply CORS middleware FIRST - before any other middleware
app.use(
  cors({
    origin: function (origin, callback) {
      // Allow requests with no origin (like mobile apps or curl requests)
      if (!origin) return callback(null, true);

      if (allowedOrigins.indexOf(origin) !== -1) {
        callback(null, true);
      } else {
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
  })
);

// Rate limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS || "900000"), // 15 minutes
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS || "100"), // limit each IP to 100 requests per windowMs
  message: {
    success: false,
    error: "Too many requests from this IP, please try again later.",
  },
  standardHeaders: true,
  legacyHeaders: false,
});

app.use(limiter);

// Other middleware
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Swagger configuration
const swaggerOptions = {
  definition: {
    openapi: "3.0.0",
    info: {
      title: "TheLLMsTxt API",
      version: "1.0.0",
      description:
        "API for generating LLMs.txt and enhanced LLM crawler configuration files",
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
  apis: ["./src/routes/*.ts"], // Path to the API routes
};

const specs = swaggerJsdoc(swaggerOptions);

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "TheLLMsTxt Backend",
    version: "1.0.0",
    features: {
      ai_enrichment: !!process.env.GEMINI_API_KEY,
      automation: process.env.AUTOMATION_ENABLED === "true",
      analytics: process.env.ANALYTICS_ENABLED === "true",
    },
  });
});

// Get available LLM bots
app.get("/api/llm-bots", (req, res) => {
  res.json({
    success: true,
    bots: Object.values(LLM_BOT_CONFIGS),
  });
});

// API Documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));

// Website analysis routes
app.use("/api", websiteAnalysisRoutes);

// Enhanced LLMs routes
app.use("/api", llmsEnhancedRoutes);

// Root endpoint
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
      llms_index: "/api/llms-index.json",
      ai_enrich: "/api/ai-enrich",
      hierarchical_structure: "/api/hierarchical-structure",
      analytics: "/api/analytics",
      webhook_regenerate: "/api/webhook/regenerate",
    },
    documentation: "/api-docs",
    features: {
      ai_enrichment: !!process.env.GEMINI_API_KEY,
      automation: process.env.AUTOMATION_ENABLED === "true",
      analytics: process.env.ANALYTICS_ENABLED === "true",
    },
  });
});

// Basic error handling middleware
app.use(
  (
    err: Error,
    req: express.Request,
    res: express.Response,
    next: express.NextFunction
  ) => {
    console.error("Error:", err);
    res.status(500).json({
      success: false,
      error: "Internal server error",
      message: err.message,
    });
  }
);

// 404 handler - using a function instead of wildcard pattern
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
      "/api/llms-index.json",
      "/api/ai-enrich",
      "/api/hierarchical-structure",
      "/api/analytics",
      "/api/webhook/regenerate",
    ],
    documentation: "/api-docs",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TheLLMsTxt Backend server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
  console.log(`🤖 LLM Bots: http://localhost:${PORT}/api/llm-bots`);
  console.log(
    `🔍 Website Analysis: http://localhost:${PORT}/api/analyze-website`
  );
  console.log(
    `📝 LLMs Full Generation: http://localhost:${PORT}/api/generate-llms-full`
  );
  console.log(
    `📄 Markdown Generation: http://localhost:${PORT}/api/generate-markdown`
  );
  console.log(`🔗 LLMs Index: http://localhost:${PORT}/api/llms-index.json`);
  console.log(`🧠 AI Enrichment: http://localhost:${PORT}/api/ai-enrich`);
  console.log(`📊 Analytics: http://localhost:${PORT}/api/analytics`);
  console.log(`📚 API Documentation: http://localhost:${PORT}/api-docs`);
});

export default app;
