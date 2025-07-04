import express from "express";
import cors from "cors";
import helmet from "helmet";
import dotenv from "dotenv";
import { LLM_BOT_CONFIGS } from "./types";
import websiteAnalysisRoutes from "./routes/website-analysis";

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

// Other middleware
app.use(helmet());
app.use(express.json({ limit: "10mb" }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get("/health", (req, res) => {
  res.json({
    status: "OK",
    timestamp: new Date().toISOString(),
    service: "TheLLMsTxt Backend",
  });
});

// Get available LLM bots
app.get("/api/llm-bots", (req, res) => {
  res.json({
    success: true,
    bots: Object.values(LLM_BOT_CONFIGS),
  });
});

// Website analysis routes
app.use("/api", websiteAnalysisRoutes);

// Root endpoint
app.get("/", (req, res) => {
  res.json({
    success: true,
    message: "Welcome to TheLLMsTxt Backend API!",
    endpoints: ["/health", "/api/llm-bots", "/api/analyze-website"],
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
});

export default app;
