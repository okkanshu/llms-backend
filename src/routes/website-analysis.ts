import { Router, Request, Response } from "express";
import { webCrawlerService } from "../services/web-crawler.service";
import { xaiService, cleanupSessionRateLimiter } from "../services/ai.service";
import {
  WebsiteAnalysisRequestSchema,
  WebsiteAnalysisResponse,
  AIGeneratedContent,
} from "../types";
import { estimateCrawlTime } from "../services/llms-full.service";
import nodemailer from "nodemailer";
import { CrawlResultModel } from "../models";

const router = Router();
const activeSessions = new Map<string, AbortController>();

router.post("/analyze-website", (_req: Request, res: Response) => {
  res.status(410).json({
    success: false,
    error:
      "This endpoint has been replaced by GET /api/analyze-website (SSE). Update your client to use the new streaming endpoint.",
  });
});

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
    cleanupSessionRateLimiter(sessionId); // Clean up session-specific rate limiter
    res.json({ success: true, message: "Analysis cancelled" });
  } else {
    res.status(404).json({ success: false, error: "Session not found" });
  }
});

router.get("/analyze-website", async (req: Request, res: Response) => {
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.flushHeaders();

  const url = req.query.url as string;
  const bots = (req.query.bots as string)?.split(",").filter(Boolean) || [];
  const aiEnrichment = req.query.aiEnrichment === "true";
  const sessionId = req.query.sessionId as string;

  const authHeader = req.headers["authorization"];
  let isAuthenticated = false;
  let userEmail = null;
  if (
    authHeader &&
    typeof authHeader === "string" &&
    authHeader.startsWith("Bearer ")
  ) {
    // Optionally, you could verify the JWT here for extra security
    isAuthenticated = true;
    userEmail = authHeader.replace("Bearer ", "").trim();
  }
  console.log(
    "[AUTH CHECK] Authorization header:",
    authHeader,
    "| isAuthenticated:",
    isAuthenticated
  );

  const abortController = new AbortController();
  if (sessionId) activeSessions.set(sessionId, abortController);

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

  const sendEvent = (event: string, data: any) => {
    res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  };

  const checkCancellation = () => {
    if (abortController.signal.aborted) {
      sendEvent("cancelled", { message: "Analysis cancelled by user" });
      res.end();
      if (sessionId) activeSessions.delete(sessionId);
      return true;
    }
    return false;
  };

  try {
    sendEvent("progress", { progress: 1, message: "Starting extraction..." });
    if (checkCancellation()) return;

    let websiteData;
    let crawlProgress = 5;
    const crawlHeartbeat = setInterval(() => {
      if (crawlProgress < 99) {
        sendEvent("progress", {
          progress: crawlProgress,
          message: "Crawling website...",
        });
        crawlProgress += 3;
      }
    }, 3000);

    try {
      // For unauthenticated (demo) users, only crawl/scrape 5 pages
      if (!isAuthenticated) {
        console.log("🔒 DEMO MODE: Crawling with max 5 pages");
        websiteData = await webCrawlerService.extractWebsiteData(
          url,
          6,
          abortController.signal,
          5 // maxPagesOverride for demo
        );
        console.log(
          `🔒 DEMO MODE: Crawled ${websiteData.totalPagesCrawled} pages`
        );
      } else {
        console.log("🔓 AUTHENTICATED MODE: Crawling with full access");
        websiteData = await webCrawlerService.extractWebsiteData(
          url,
          6,
          abortController.signal
        );
        console.log(
          `🔓 AUTHENTICATED MODE: Crawled ${websiteData.totalPagesCrawled} pages`
        );
      }
    } finally {
      clearInterval(crawlHeartbeat);
    }

    if (checkCancellation()) return;
    sendEvent("progress", { progress: 99, message: "Website data extracted" });

    const pathSelections = webCrawlerService.convertToPathSelections(
      websiteData.paths
    );
    sendEvent("progress", { progress: 60, message: "Paths converted" });

    // DEMO GATING: Check for Authorization header
    let demoLimit = 5;

    // Estimate crawl time (10s per page)
    const estimatedCrawlTime = estimateCrawlTime(pathSelections.length);
    const longJobThreshold = 10 * 60; // 10 minutes in seconds

    // If authenticated and estimated time > 10 min, trigger async job
    if (isAuthenticated && estimatedCrawlTime > longJobThreshold) {
      // Get user email from Authorization (for demo, parse as 'Bearer email')
      const authHeader = req.headers["authorization"];
      let userEmail = null;
      if (
        authHeader &&
        typeof authHeader === "string" &&
        authHeader.startsWith("Bearer ")
      ) {
        userEmail = authHeader.replace("Bearer ", "").trim();
      }
      if (!userEmail) {
        sendEvent("result", {
          success: false,
          error: "Unable to determine user email for async delivery.",
        });
        res.end();
        return;
      }
      // Respond immediately to frontend
      sendEvent("result", {
        success: true,
        asyncJob: true,
        message: `This job will take more than 10 minutes. You can leave the site; we will email your llms.txt to ${userEmail} once it's ready.`,
      });
      sendEvent("progress", { progress: 100, message: "Async job started" });
      res.end();
      // Start background job (no await)
      (async () => {
        try {
          // Re-crawl in background (no abort signal)
          const websiteData = await webCrawlerService.extractWebsiteData(
            url,
            6
          );
          // Generate llms.txt content (simulate, or use real logic)
          const pathSelections = webCrawlerService.convertToPathSelections(
            websiteData.paths
          );
          let content = `llms.txt for ${url}\nPages: ${websiteData.totalPagesCrawled}\n...`;
          // TODO: Use real llms.txt generation logic if needed
          // Send email with llms.txt as attachment
          const transporter = nodemailer.createTransport({
            host: process.env.SMTP_HOST || "smtp.gmail.com",
            port: Number(process.env.SMTP_PORT) || 465,
            secure: true,
            auth: {
              user: process.env.SMTP_USER || "dummy@gmail.com",
              pass: process.env.SMTP_PASS || "yourpassword",
            },
          });
          await transporter.sendMail({
            from: process.env.SMTP_USER || "dummy@gmail.com",
            to: userEmail,
            subject: `Your llms.txt is ready!`,
            text: `Your llms.txt file for ${url} is attached.`,
            attachments: [
              {
                filename: "llms.txt",
                content,
                contentType: "text/plain",
              },
            ],
          });
          console.log(`✅ llms.txt sent to ${userEmail}`);
          // Save crawl result to MongoDB (jobStatus: completed)
          await CrawlResultModel.create({
            url,
            user: userEmail,
            sessionId,
            crawledData: websiteData,
            email: userEmail,
            jobStatus: "completed",
          });
        } catch (err) {
          console.error("❌ Failed to send async llms.txt email:", err);
        }
      })();
      return;
    }

    // After crawling and before sending response
    // Save crawl result to MongoDB
    (async () => {
      try {
        await CrawlResultModel.create({
          url,
          user: isAuthenticated
            ? req.headers["authorization"]
              ? String(req.headers["authorization"])
                  .replace("Bearer ", "")
                  .trim()
              : undefined
            : undefined,
          sessionId,
          crawledData: websiteData,
          email: isAuthenticated
            ? req.headers["authorization"]
              ? String(req.headers["authorization"])
                  .replace("Bearer ", "")
                  .trim()
              : undefined
            : undefined,
          jobStatus: "completed",
        });
      } catch (err) {
        console.error("❌ Failed to save crawl result to MongoDB:", err);
      }
    })();

    let gatedPathSelections = pathSelections;
    let gatedPageMetadatas = websiteData.pageMetadatas;
    let isDemo = false;
    let remainingPages = 0;
    if (!isAuthenticated) {
      isDemo = true;
      // Optionally, you can still limit the number of pages for demo users if needed:
      // gatedPathSelections = pathSelections.slice(0, demoLimit);
      // gatedPageMetadatas = websiteData.pageMetadatas?.slice(0, demoLimit);
      remainingPages =
        pathSelections.length > demoLimit
          ? pathSelections.length - demoLimit
          : 0;
    } else if (pathSelections.length > demoLimit) {
      // Keep the original logic for authenticated users if needed
      remainingPages = pathSelections.length - demoLimit;
    }

    let aiGeneratedContent: AIGeneratedContent[] = [];
    let rateLimitHit = false;

    if (aiEnrichment) {
      const total = gatedPathSelections.length;
      let completed = 0;

      for (const path of gatedPathSelections) {
        if (checkCancellation()) return;

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

          const ai = await xaiService.generateAIContent(
            path.path,
            content,
            abortController.signal,
            sessionId
          );
          if (meta && ai) (meta as any).summary = ai.summary;
          if (ai) aiGeneratedContent.push(ai);
        } catch (error) {
          if (
            error instanceof Error &&
            error.message?.startsWith("RATE_LIMIT_REACHED:")
          ) {
            sendEvent("error", {
              error:
                "AI rate limit reached. Please try again in a few minutes.",
              details: error.message,
            });
            rateLimitHit = true;
            break;
          }
          console.warn(`⚠️ AI enrichment failed for path ${path.path}:`, error);
          continue;
        }

        completed++;
        const percent = 99 + Math.round((completed / total) * 0.5);
        sendEvent("progress", {
          progress: percent,
          message: `AI enrichment: ${completed}/${total}`,
        });
        // No delay needed - AI service queue handles rate limiting automatically
      }

      if (!rateLimitHit) {
        sendEvent("progress", {
          progress: 99.5,
          message: "AI enrichment complete",
        });
      }
    }

    if (!aiEnrichment || !rateLimitHit) {
      const response: WebsiteAnalysisResponse & {
        demo?: boolean;
        remainingPages?: number;
        demoMessage?: string;
      } = {
        success: true,
        metadata: {
          title: websiteData.title,
          description: websiteData.description,
          url: url,
          totalPagesCrawled: websiteData.totalPagesCrawled,
          totalLinksFound: websiteData.totalLinksFound,
          uniquePathsFound: websiteData.uniquePathsFound,
        },
        paths: gatedPathSelections,
        pageMetadatas: gatedPageMetadatas,
        aiGeneratedContent: aiEnrichment ? aiGeneratedContent : undefined,
      };
      if (!isAuthenticated) {
        response.demo = true;
        response.remainingPages = remainingPages;
        response.demoMessage = `Sign up or log in to access all features. You are seeing a demo experience.`;
        console.log(
          "[DEMO GATING] Sending demo response:",
          response.demoMessage +
            "\n" +
            response.demo +
            "\n" +
            response.remainingPages
        );
      }

      console.log("🔍 Backend sending response:", {
        aiEnrichment,
        rateLimitHit,
        aiGeneratedContentLength: aiGeneratedContent.length,
        hasAiContent: !!response.aiGeneratedContent,
        aiContentSample: response.aiGeneratedContent?.slice(0, 2),
      });

      // console.log("[RESULT EVENT] Sending response:", response);
      sendEvent("result", response);
      sendEvent("progress", { progress: 100, message: "Analysis complete" });
    }
    res.end();
  } catch (error) {
    sendEvent("error", {
      error: error instanceof Error ? error.message : "Unknown error",
    });
    res.end();
  } finally {
    if (sessionId) {
      activeSessions.delete(sessionId);
      cleanupSessionRateLimiter(sessionId); // Clean up session-specific rate limiter
    }
  }
});

export default router;
