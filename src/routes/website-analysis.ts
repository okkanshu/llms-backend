import { Router, Request, Response, RequestHandler } from "express";
import { firecrawlService } from "../services/firecrawl.service";
import { openRouterService } from "../services/gemini.service";
import {
  WebsiteAnalysisRequestSchema,
  WebsiteAnalysisResponse,
  PathSelection,
  AIGeneratedContent,
} from "../types";

const router = Router();

// Store active analysis sessions for cancellation
const activeSessions = new Map<string, AbortController>();

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
  const bots = (req.query.bots as string)?.split(",").filter(Boolean) || [];
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
    bots,
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
        progress: 1,
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
    // Heartbeat progress during crawling - now goes from 5 to 99
    let crawlProgress = 5;
    let crawlHeartbeat;
    const sendCrawlHeartbeat = () => {
      if (crawlProgress < 99) {
        res.write(
          `event: progress\ndata: ${JSON.stringify({
            progress: crawlProgress,
            message: `Crawling website...`,
          })}\n\n`
        );
        crawlProgress += 3; // Smaller increments for smoother progress
      }
    };
    crawlHeartbeat = setInterval(sendCrawlHeartbeat, 3000); // More frequent updates
    try {
      websiteData = await firecrawlService.extractWebsiteData(url);
    } finally {
      clearInterval(crawlHeartbeat);
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
        progress: 99,
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
      let rateLimitHit = false;
      for (const path of pathSelections) {
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
          const meta = websiteData.pageMetadatas?.find(
            (m) => m.path === path.path
          );
          let content = "";
          if (meta?.title) content += `Title: ${meta.title}\n`;
          if (meta?.description)
            content += `Description: ${meta.description}\n`;
          if (meta?.keywords) content += `Keywords: ${meta.keywords}\n`;
          if (!content) content = `Path: ${path.path}`;

          // AI enrichment (summary)
          let ai;
          try {
            ai = await openRouterService.generateAIContent(path.path, content);
          } catch (error) {
            if (
              error instanceof Error &&
              error.message &&
              error.message.startsWith("RATE_LIMIT_REACHED:")
            ) {
              res.write(
                `event: error\ndata: ${JSON.stringify({
                  error:
                    "AI rate limit reached. Please try again in a few minutes.",
                  details: error.message,
                })}\n\n`
              );
              rateLimitHit = true;
              break;
            } else {
              console.warn(
                `⚠️ AI enrichment failed for path ${path.path}:`,
                error
              );
              // Continue to next path
              continue;
            }
          }
          if (meta && ai) (meta as any).summary = ai.summary;
          if (ai) aiGeneratedContent.push(ai);
        } catch (error) {
          // Already handled above
        }

        completed++;
        const percent = 99 + Math.round((completed / total) * 0.5); // 99-99.5% (only 0.5% for AI)
        res.write(
          `event: progress\ndata: ${JSON.stringify({
            progress: percent,
            message: `AI enrichment: ${completed}/${total}`,
          })}\n\n`
        );

        // Add delay (5s)
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
      if (!rateLimitHit) {
        res.write(
          `event: progress\ndata: ${JSON.stringify({
            progress: 99.5,
            message: "AI enrichment complete",
          })}\n\n`
        );
      }
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

// Helper function to enrich paths with AI-generated content
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

  const batchSize = 3;
  for (let i = 0; i < paths.length; i += batchSize) {
    const batch = paths.slice(i, i + batchSize);

    const batchPromises = batch.map(async (path) => {
      try {
        // Find corresponding metadata
        const metadata = pageMetadatas?.find((m) => m.path === path.path);

        let content = "";
        if (metadata?.title) content += `Title: ${metadata.title}\n`;
        if (metadata?.description)
          content += `Description: ${metadata.description}\n`;
        if (metadata?.keywords) content += `Keywords: ${metadata.keywords}\n`;

        if (!content) {
          content = `Path: ${path.path}`;
        }

        const aiGenerated = await openRouterService.generateAIContent(
          path.path,
          content
        );

        path.summary = aiGenerated.summary;
        path.contextSnippet = aiGenerated.contextSnippet;
        path.priority = aiGenerated.priority;
        path.contentType = aiGenerated.contentType as any;
        path.aiUsageDirective = aiGenerated.aiUsageDirective;

        return aiGenerated;
      } catch (error) {
        console.warn(`⚠️ AI enrichment failed for path ${path.path}:`, error);
        return undefined;
      }
    });

    const batchResults = await Promise.all(batchPromises);
    aiContent.push(...(batchResults.filter(Boolean) as AIGeneratedContent[]));

    if (i + batchSize < paths.length) {
      await new Promise((resolve) => setTimeout(resolve, 5000)); // 5 seconds
    }
  }

  return aiContent;
}

export default router;
