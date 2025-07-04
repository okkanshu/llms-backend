import { Router, Request, Response } from "express";
import cors from "cors";
import { firecrawlService } from "../services/firecrawl.service";
import {
  WebsiteAnalysisRequestSchema,
  WebsiteAnalysisResponse,
} from "../types";

const router = Router();

// CORS configuration for this route
const corsOptions = {
  origin: [
    "https://thellmstxt.com",
    "https://llmstxt.store",
    "http://localhost:3000",
    "http://localhost:3001",
    "http://localhost:8000",
  ],
  credentials: true,
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization", "X-Requested-With"],
  optionsSuccessStatus: 200,
};

/**
 * OPTIONS /api/analyze-website
 * Handle preflight requests for the analyze-website endpoint
 */
router.options("/analyze-website", cors(corsOptions));

/**
 * POST /api/analyze-website
 * Analyze a website and extract metadata and paths
 */
router.post(
  "/analyze-website",
  cors(corsOptions),
  async (req: Request, res: Response) => {
    const startTime = Date.now();

    try {
      console.log("🚀 Starting website analysis request");
      console.log("📥 Request body:", {
        url: req.body.url,
        llmBot: req.body.llmBot,
        bodyKeys: Object.keys(req.body),
      });

      // Validate request body
      console.log("🔍 Validating request data...");
      const validationResult = WebsiteAnalysisRequestSchema.safeParse(req.body);

      if (!validationResult.success) {
        console.error("❌ Request validation failed:", {
          errors: validationResult.error.errors,
          receivedData: req.body,
        });

        res.status(400).json({
          success: false,
          error: "Invalid request data",
          details: validationResult.error.errors,
          receivedData: req.body,
        });
        return;
      }

      const { url, llmBot } = validationResult.data;
      console.log("✅ Request validation passed");

      console.log(`🔍 Analyzing website: ${url} for bot: ${llmBot}`);
      console.log(`⏱️ Starting extraction at: ${new Date().toISOString()}`);

      // Extract website data using Firecrawl
      const websiteData = await firecrawlService.extractWebsiteData(url);

      const extractionTime = Date.now() - startTime;
      console.log(`⏱️ Extraction completed in ${extractionTime}ms`);

      // Convert paths to PathSelection format for UI
      console.log("🔄 Converting paths to UI format...");
      const pathSelections = firecrawlService.convertToPathSelections(
        websiteData.paths
      );
      console.log(`✅ Converted ${pathSelections.length} paths to UI format`);

      const response: WebsiteAnalysisResponse = {
        success: true,
        metadata: {
          title: websiteData.title,
          description: websiteData.description,
          url: url,
          totalPagesCrawled: websiteData.totalPagesCrawled,
          totalLinksFound: websiteData.totalLinksFound,
          uniquePathsFound: websiteData.uniquePathsFound,
        },
        paths: pathSelections,
      };

      const totalTime = Date.now() - startTime;
      console.log("✅ Website analysis completed successfully:", {
        totalTime: `${totalTime}ms`,
        extractionTime: `${extractionTime}ms`,
        pathsFound: pathSelections.length,
        title: websiteData.title,
        descriptionLength: websiteData.description.length,
        totalPagesCrawled: websiteData.totalPagesCrawled,
        totalLinksFound: websiteData.totalLinksFound,
        uniquePathsFound: websiteData.uniquePathsFound,
      });

      res.json(response);
    } catch (error) {
      const totalTime = Date.now() - startTime;

      console.error("❌ Website analysis failed:", {
        error: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        totalTime: `${totalTime}ms`,
        requestBody: req.body,
        url: req.body?.url,
        llmBot: req.body?.llmBot,
        timestamp: new Date().toISOString(),
      });

      // Log specific error types for better debugging
      if (error instanceof Error) {
        if (error.message.includes("API key")) {
          console.error(
            "🔑 API Key Issue - Check environment variables and API key validity"
          );
        } else if (error.message.includes("rate limit")) {
          console.error(
            "⏱️ Rate Limit Issue - Consider implementing request throttling"
          );
        } else if (error.message.includes("timeout")) {
          console.error(
            "⏰ Timeout Issue - Website might be too large or slow"
          );
        } else if (error.message.includes("network")) {
          console.error(
            "🌐 Network Issue - Check internet connection and service availability"
          );
        } else if (error.message.includes("validation")) {
          console.error(
            "📝 Validation Issue - Check request format and required fields"
          );
        }
      }

      res.status(500).json({
        success: false,
        error: "Failed to analyze website",
        message: error instanceof Error ? error.message : "Unknown error",
        timestamp: new Date().toISOString(),
        requestId: Math.random().toString(36).substring(7),
      });
    }
  }
);

export default router;
