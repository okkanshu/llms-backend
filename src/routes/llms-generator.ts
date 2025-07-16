import { Router, Request, Response } from "express";
import { webCrawlerService } from "../services/web-crawler.service";

const router = Router();

/**
 * POST /api/generate-llms-full
 * Generate detailed llms-full.txt content with body content extraction
 */
router.post("/generate-llms-full", async (req: Request, res: Response) => {
  const startTime = Date.now();

  try {
    // console.log("🚀 Starting llms-full.txt generation request");
    // console.log("📥 Request body:", req.body);

    const { websiteUrl, maxDepth = 3 } = req.body;

    if (!websiteUrl) {
      res.status(400).json({
        success: false,
        content: "",
        filename: "",
        totalPages: 0,
        totalWords: 0,
        error: "websiteUrl is required",
      });
      return;
    }

    // Generate llms-full.txt content
    const result = await webCrawlerService.generateLLMsFull(
      websiteUrl,
      maxDepth
    );

    const totalTime = Date.now() - startTime;
    // console.log("✅ llms-full.txt generation completed:", {
    //   totalTime: `${totalTime}ms`,
    //   totalPages: result.totalPages,
    //   totalWords: result.totalWords,
    // });

    res.json({
      success: true,
      content: result.content,
      filename: "llms-full.txt",
      totalPages: result.totalPages,
      totalWords: result.totalWords,
    });
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

export default router;
