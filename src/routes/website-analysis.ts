import { Router, Request, Response, RequestHandler } from "express";
import { firecrawlService } from "../services/firecrawl.service";
import { geminiService } from "../services/gemini.service";
import {
  WebsiteAnalysisRequestSchema,
  WebsiteAnalysisResponse,
  PathSelection,
  AIGeneratedContent,
} from "../types";

const router = Router();

// Store active analysis sessions for cancellation
const activeSessions = new Map<string, AbortController>();

/**
 * POST /api/analyze-website
 * Analyze a website and extract metadata and paths with optional AI enrichment
 */
// NOTE: The previous POST /api/analyze-website endpoint has been merged into the
// unified SSE endpoint below to avoid double crawls. If an old client calls the
// POST route we simply inform that it has been deprecated.
router.post("/analyze-website", (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error:
      "This endpoint has been replaced by GET /api/analyze-website (SSE). Update your client to use the new streaming endpoint.",
  });
});

/**
 * Cancel an active analysis session
 */
router.post("/cancel-analysis", (req: Request, res: Response): void => {
  const { sessionId } = req.body;

  if (!sessionId) {
    res.status(400).json({ success: false, error: "Session ID required" });
    return;
  }

  const controller = activeSessions.get(sessionId);
  if (controller) {
    controller.abort();
    activeSessions.delete(sessionId);
    res.json({ success: true, message: "Analysis cancelled" });
  } else {
    res.status(404).json({ success: false, error: "Session not found" });
  }
});

/**
 * SSE endpoint for progress updates
 */
router.get("/analyze-website", async (req: Request, res: Response) => {
  // Set headers for SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  // Parse query params
  const url = req.query.url as string;
  const llmBot = req.query.llmBot as string;
  const aiEnrichment = req.query.aiEnrichment === "true";
  const sessionId = req.query.sessionId as string;

  // Create abort controller for this session
  const abortController = new AbortController();
  if (sessionId) {
    activeSessions.set(sessionId, abortController);
  }

  // Validate
  const validationResult = WebsiteAnalysisRequestSchema.safeParse({
    url,
    llmBot,
    aiEnrichment,
  });
  if (!validationResult.success) {
    res.write(
      `event: error\ndata: ${JSON.stringify({
        error: "Invalid request data",
      })}\n\n`
    );
    res.end();
    if (sessionId) activeSessions.delete(sessionId);
    return;
  }

  try {
    // Step 1: Extract website data
    res.write(
      `event: progress\ndata: ${JSON.stringify({
        progress: 10,
        message: "Starting extraction...",
      })}\n\n`
    );

    // Check for cancellation
    if (abortController.signal.aborted) {
      res.write(
        `event: cancelled\ndata: ${JSON.stringify({
          message: "Analysis cancelled by user",
        })}\n\n`
      );
      res.end();
      if (sessionId) activeSessions.delete(sessionId);
      return;
    }

    let websiteData;
    try {
      websiteData = await firecrawlService.extractWebsiteData(url);
    } catch (error) {
      console.error("❌ Firecrawl extraction failed:", error);
      res.status(500).json({
        success: false,
        error: "Failed to extract website data from Firecrawl",
        details: error instanceof Error ? error.message : String(error),
      });
      return;
    }

    // Check for cancellation
    if (abortController.signal.aborted) {
      res.write(
        `event: cancelled\ndata: ${JSON.stringify({
          message: "Analysis cancelled by user",
        })}\n\n`
      );
      res.end();
      if (sessionId) activeSessions.delete(sessionId);
      return;
    }

    res.write(
      `event: progress\ndata: ${JSON.stringify({
        progress: 40,
        message: "Website data extracted",
      })}\n\n`
    );

    // Step 2: Convert paths
    const pathSelections = firecrawlService.convertToPathSelections(
      websiteData.paths
    );
    res.write(
      `event: progress\ndata: ${JSON.stringify({
        progress: 60,
        message: "Paths converted",
      })}\n\n`
    );

    // Step 3: AI enrichment (if enabled)
    let aiGeneratedContent: AIGeneratedContent[] = [];
    if (aiEnrichment) {
      const total = pathSelections.length;
      let completed = 0;
      for (const path of pathSelections) {
        // Check for cancellation before each AI call
        if (abortController.signal.aborted) {
          res.write(
            `event: cancelled\ndata: ${JSON.stringify({
              message: "Analysis cancelled by user",
            })}\n\n`
          );
          res.end();
          if (sessionId) activeSessions.delete(sessionId);
          return;
        }

        try {
          // Find corresponding metadata
          const meta = websiteData.pageMetadatas?.find(
            (m) => m.path === path.path
          );
          // Compose content for summary
          let content = "";
          if (meta?.title) content += `Title: ${meta.title}\n`;
          if (meta?.description)
            content += `Description: ${meta.description}\n`;
          if (meta?.keywords) content += `Keywords: ${meta.keywords}\n`;
          if (!content) content = `Path: ${path.path}`;

          // AI enrichment (summary)
          const ai = await geminiService.generateAIContent(path.path, content);

          // Add summary to metadata (even if AI failed, we'll have fallback content)
          if (meta) (meta as any).summary = ai.summary;
          aiGeneratedContent.push(ai);
        } catch (error) {
          console.warn(`⚠️ AI enrichment failed for path ${path.path}:`, error);
          // Skip Gemini for this path, do not push fallback, just continue
        }

        completed++;
        const percent = 60 + Math.round((completed / total) * 35); // 60-95%
        res.write(
          `event: progress\ndata: ${JSON.stringify({
            progress: percent,
            message: `AI enrichment: ${completed}/${total}`,
          })}\n\n`
        );

        // Add delay (3s) - reduced from 1.5s to be more reasonable
        await new Promise((resolve) => setTimeout(resolve, 3000));
      }
      res.write(
        `event: progress\ndata: ${JSON.stringify({
          progress: 95,
          message: "AI enrichment complete",
        })}\n\n`
      );
    }

    // Step 4: Done
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
      pageMetadatas: websiteData.pageMetadatas,
      aiGeneratedContent: aiEnrichment ? aiGeneratedContent : undefined,
    };

    // Send final result before closing
    res.write(`event: result\ndata: ${JSON.stringify(response)}\n\n`);
    res.write(
      `event: progress\ndata: ${JSON.stringify({
        progress: 100,
        message: "Analysis complete",
      })}\n\n`
    );
    res.end();
  } catch (error) {
    res.write(
      `event: error\ndata: ${JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      })}\n\n`
    );
    res.end();
  } finally {
    // Clean up session
    if (sessionId) activeSessions.delete(sessionId);
  }
});

/**
 * Helper function to enrich paths with AI-generated content
 */
async function enrichPathsWithAI(
  paths: PathSelection[],
  pageMetadatas?: Array<{
    path: string;
    title?: string;
    description?: string;
    keywords?: string;
  }>
): Promise<AIGeneratedContent[]> {
  const aiContent: AIGeneratedContent[] = [];

  // Process paths in batches to avoid overwhelming the AI service
  const batchSize = 3; // Reduced batch size
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);

    const batchPromises = batch.map(async (path) => {
      try {
        // Find corresponding metadata
        const metadata = pageMetadatas?.find((m) => m.path === path.path);

        // Create content string from available metadata
        let content = "";
        if (metadata?.title) content += `Title: ${metadata.title}\n`;
        if (metadata?.description)
          content += `Description: ${metadata.description}\n`;
        if (metadata?.keywords) content += `Keywords: ${metadata.keywords}\n`;

        // If no metadata, use path as content
        if (!content) {
          content = `Path: ${path.path}`;
        }

        // Generate AI content
        const aiGenerated = await geminiService.generateAIContent(
          path.path,
          content
        );

        // Update the path with AI-generated content
        path.summary = aiGenerated.summary;
        path.contextSnippet = aiGenerated.contextSnippet;
        path.priority = aiGenerated.priority;
        path.contentType = aiGenerated.contentType as any;
        path.aiUsageDirective = aiGenerated.aiUsageDirective;

        return aiGenerated;
      } catch (error) {
        console.warn(`⚠️ AI enrichment failed for path ${path.path}:`, error);
        // Skip Gemini for this path, do not push fallback, just continue
        return undefined;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    aiContent.push(...(batchResults.filter(Boolean) as AIGeneratedContent[]));

    // Longer delay between batches to be respectful to the AI service
    if (i + batchSize < paths.length) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 seconds
    }
  }

  return aiContent;
}

export default router;
