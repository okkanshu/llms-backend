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
    let rateLimitHit = false;
    if (aiEnrichment) {
      const total = pathSelections.length;
      let completed = 0;
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

          // AI enrichment (now only 1 call per path instead of 6)
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

        // Add delay (10s instead of 5s)
        await new Promise((resolve) => setTimeout(resolve, 10000));
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

    // Step 4: Done - only if AI enrichment completed successfully or was not enabled
    if (!aiEnrichment || !rateLimitHit) {
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

      // Log the response data for debugging
      console.log("🔍 Backend sending response:", {
        aiEnrichment,
        rateLimitHit,
        aiGeneratedContentLength: aiGeneratedContent.length,
        hasAiContent: !!response.aiGeneratedContent,
        aiContentSample: response.aiGeneratedContent?.slice(0, 2),
      });

      // Send final result after AI enrichment is complete
      res.write(`event: result\ndata: ${JSON.stringify(response)}\n\n`);
      res.write(
        `event: progress\ndata: ${JSON.stringify({
          progress: 100,
          message: "Analysis complete",
        })}\n\n`
      );
    }
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

export default router;
