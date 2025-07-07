import { Router, Request, Response } from "express";
import { llmsFullService } from "../services/llms-full.service";
import { markdownGeneratorService } from "../services/markdown-generator.service";
import { geminiService } from "../services/gemini.service";
import {
  LLMsFullPayloadSchema,
  LLMsFullGenerationResponse,
  MarkdownGenerationResponse,
  AnalyticsResponse,
  AnalyticsData,
} from "../types";

const router = Router();

/**
 * POST /api/generate-llms-full
 * Generate comprehensive llms-full.txt content
 */
router.post("/generate-llms-full", async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    console.log("🚀 Starting llms-full.txt generation request");
    console.log("📥 Request body:", req.body);

    // Validate request body
    const validationResult = LLMsFullPayloadSchema.safeParse(req.body);

    if (!validationResult.success) {
      console.error(
        "❌ Request validation failed:",
        validationResult.error.errors
      );
      res.status(400).json({
        success: false,
        error: "Invalid request data",
        details: validationResult.error.errors,
      });
      return;
    }

    const payload = validationResult.data;
    console.log("✅ Request validation passed");

    // Generate llms-full.txt
    const result = await llmsFullService.generateLLMsFull(payload);

    const totalTime = Date.now() - startTime;
    console.log("✅ llms-full.txt generation completed:", {
      totalTime: `${totalTime}ms`,
      success: result.success,
      totalPages: result.totalPages,
      totalWords: result.totalWords,
    });

    res.json(result);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error("❌ llms-full.txt generation failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      totalTime: `${totalTime}ms`,
    });

    res.status(500).json({
      success: false,
      content: "",
      filename: "",
      totalPages: 0,
      totalWords: 0,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/generate-markdown
 * Generate markdown versions of key pages
 */
router.post("/generate-markdown", async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    console.log("🚀 Starting markdown generation request");
    console.log("📥 Request body:", req.body);

    const { websiteUrl } = req.body;

    if (!websiteUrl) {
      res.status(400).json({
        success: false,
        files: [],
        error: "websiteUrl is required",
      });
      return;
    }

    // Generate markdown files
    const result = await markdownGeneratorService.generateMarkdownPages(
      websiteUrl
    );

    const totalTime = Date.now() - startTime;
    console.log("✅ Markdown generation completed:", {
      totalTime: `${totalTime}ms`,
      success: result.success,
      totalFiles: result.files.length,
    });

    res.json(result);
  } catch (error) {
    const totalTime = Date.now() - startTime;
    console.error("❌ Markdown generation failed:", {
      error: error instanceof Error ? error.message : "Unknown error",
      totalTime: `${totalTime}ms`,
    });

    res.status(500).json({
      success: false,
      files: [],
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/llms-index.json
 * Open API endpoint for bots and services
 */
router.get("/llms-index.json", async (req: Request, res: Response) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== "string") {
      res.status(400).json({
        success: false,
        error: "url query parameter is required",
      });
      return;
    }

    console.log(`🔍 Generating llms-index.json for: ${url}`);

    // Generate basic site information
    const siteInfo = {
      website: url,
      generated: new Date().toISOString(),
      version: "1.0.0",
      endpoints: {
        llms_txt: `${url}/llms.txt`,
        llms_full: `${url}/llms-full.txt`,
        sitemap: `${url}/sitemap.xml`,
      },
      features: {
        ai_enrichment: true,
        markdown_pages: true,
        hierarchical_structure: true,
        analytics: true,
      },
      llm_bots: [
        "ChatGPT-User",
        "GPTBot",
        "GoogleExtended",
        "Claude",
        "Anthropic",
        "CCBot",
      ],
    };

    res.json({
      success: true,
      data: siteInfo,
    });
  } catch (error) {
    console.error("❌ llms-index.json generation failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/ai-enrich
 * AI-powered content enrichment
 */
router.post("/ai-enrich", async (req: Request, res: Response) => {
  try {
    console.log("🚀 Starting AI enrichment request");

    const { path, content } = req.body;

    if (!path || !content) {
      res.status(400).json({
        success: false,
        error: "path and content are required",
      });
      return;
    }

    // Generate AI content
    const aiContent = await geminiService.generateAIContent(path, content);

    res.json({
      success: true,
      data: aiContent,
    });
  } catch (error) {
    console.error("❌ AI enrichment failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/hierarchical-structure
 * Generate hierarchical structure suggestions
 */
router.post("/hierarchical-structure", async (req: Request, res: Response) => {
  try {
    console.log("🚀 Starting hierarchical structure generation");

    const { paths } = req.body;

    if (!paths || !Array.isArray(paths)) {
      res.status(400).json({
        success: false,
        error: "paths array is required",
      });
      return;
    }

    // Generate hierarchical structure
    const structure = await geminiService.generateHierarchicalStructure(paths);

    res.json({
      success: true,
      data: structure,
    });
  } catch (error) {
    console.error("❌ Hierarchical structure generation failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * GET /api/analytics
 * Get analytics data for a website
 */
router.get("/analytics", async (req: Request, res: Response) => {
  try {
    const { url } = req.query;

    if (!url || typeof url !== "string") {
      res.status(400).json({
        success: false,
        error: "url query parameter is required",
      });
      return;
    }

    // Mock analytics data (in a real implementation, this would come from a database)
    const analyticsData: AnalyticsData = {
      websiteUrl: url,
      accessCount: Math.floor(Math.random() * 1000) + 100,
      lastAccessed: new Date().toISOString(),
      userAgents: ["ChatGPT-User", "GPTBot", "Google-Extended", "Claude-Web"],
      mostAccessedPaths: [
        { path: "/", count: 150 },
        { path: "/about", count: 75 },
        { path: "/contact", count: 50 },
        { path: "/blog", count: 25 },
      ],
      generationCount: Math.floor(Math.random() * 50) + 10,
      lastGenerated: new Date().toISOString(),
    };

    const response: AnalyticsResponse = {
      success: true,
      data: analyticsData,
    };

    res.json(response);
  } catch (error) {
    console.error("❌ Analytics retrieval failed:", error);
    res.status(500).json({
      success: false,
      data: {} as AnalyticsData,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

/**
 * POST /api/webhook/regenerate
 * Webhook endpoint for external triggers
 */
router.post("/webhook/regenerate", async (req: Request, res: Response) => {
  try {
    console.log("🚀 Webhook regeneration request received");

    const { websiteUrl, type, secret } = req.body;

    // Basic webhook validation (in production, use proper authentication)
    if (!websiteUrl) {
      res.status(400).json({
        success: false,
        error: "websiteUrl is required",
      });
      return;
    }

    // Validate webhook secret if provided
    const expectedSecret = process.env.WEBHOOK_SECRET;
    if (expectedSecret && secret !== expectedSecret) {
      res.status(401).json({
        success: false,
        error: "Invalid webhook secret",
      });
      return;
    }

    let result;

    switch (type) {
      case "llms-full":
        result = await llmsFullService.generateLLMsFull({
          websiteUrl,
          aiEnrichment: true,
        });
        break;
      case "markdown":
        result = await markdownGeneratorService.generateMarkdownPages(
          websiteUrl
        );
        break;
      default:
        // Generate both
        const [fullResult, markdownResult] = await Promise.all([
          llmsFullService.generateLLMsFull({
            websiteUrl,
            aiEnrichment: true,
          }),
          markdownGeneratorService.generateMarkdownPages(websiteUrl),
        ]);
        result = {
          llmsFull: fullResult,
          markdown: markdownResult,
        };
    }

    res.json({
      success: true,
      message: "Regeneration completed successfully",
      data: result,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error("❌ Webhook regeneration failed:", error);
    res.status(500).json({
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    });
  }
});

export default router;
