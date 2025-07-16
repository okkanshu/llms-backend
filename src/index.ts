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
import llmsGeneratorRoutes from "./routes/llms-generator";
import contactRoutes from "./routes/contact";
import authRoutes from "./routes/auth";
import mongoose from "mongoose";
// console.log("\uD83D\uDCAC contactRoutes type:", typeof contactRoutes);

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 8000;

// MongoDB connection
const mongoUri = process.env.MONGODB_URI;
if (!mongoUri) {
  console.error("❌ MONGODB_URI not set in environment variables");
  process.exit(1);
}
mongoose
  .connect(mongoUri)
  .then(() => console.log("✅ Connected to MongoDB"))
  .catch((err) => {
    console.error("❌ MongoDB connection error:", err);
    process.exit(1);
  });

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
      ai_enrichment: !!process.env.XAI_API_KEY,
      automation: process.env.AUTOMATION_ENABLED === "true",
      analytics: process.env.ANALYTICS_ENABLED === "true",
    },
  });
});

// Test route to check server's public IP
app.get("/my-ip", async (req, res) => {
  try {
    const ip = await fetch("https://ipinfo.io/ip").then((r) => r.text());
    res.send(`Render IP: ${ip}`);
  } catch (err) {
    res.status(500).send("Failed to fetch public IP");
  }
});

// Get available LLM bots
app.get("/api/llm-bots", (req, res) => {
  res.json({
    success: true,
    bots: Object.values(LLM_BOT_CONFIGS),
  });
});

// Simple test endpoint to check website links
app.get("/api/test-links", async (req, res) => {
  const url = req.query.url as string;
  if (!url) {
    return res.status(400).json({ error: "URL parameter required" });
  }

  try {
    console.log(`🧪 Testing links for: ${url}`);

    const response = await fetch(url);
    const html = await response.text();

    // Simple link extraction test
    const linkMatches = html.match(/href=["']([^"']+)["']/g) || [];
    const links = linkMatches
      .map((match) => {
        const href = match.match(/href=["']([^"']+)["']/)?.[1];
        return href;
      })
      .filter(Boolean);

    const baseDomain = new URL(url).hostname;
    const internalLinks = links.filter((link) => {
      if (!link) return false;
      try {
        const abs = new URL(link, url).href;
        return new URL(abs).hostname === baseDomain;
      } catch {
        return false;
      }
    });

    res.json({
      url,
      totalLinks: links.length,
      internalLinks: internalLinks.length,
      sampleLinks: links.slice(0, 10),
      sampleInternalLinks: internalLinks.slice(0, 10),
    });
  } catch (error) {
    res.status(500).json({
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

// API Documentation
app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(specs));
app.use("/api", websiteAnalysisRoutes);
app.use("/api", llmsEnhancedRoutes);
app.use("/api", llmsGeneratorRoutes);
app.use("/api", contactRoutes);
app.use("/api", authRoutes);

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
      "/api/test-links",
    ],
    documentation: "/api-docs",
  });
});

// Start server
app.listen(PORT, () => {
  console.log(`🚀 TheLLMsTxt Backend server running on port ${PORT}`);
  console.log(`📊 Health check: http://localhost:${PORT}/health`);
});

export default app;
