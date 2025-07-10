import { Router, Request, Response } from "express";
import { llmsFullService } from "../services/llms-full.service";
import { markdownGeneratorService } from "../services/markdown-generator.service";
import {
  LLMsFullPayloadSchema,
  LLMsFullGenerationResponse,
  MarkdownGenerationResponse,
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

export default router;
