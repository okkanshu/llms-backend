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
import jwt from "jsonwebtoken";

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
  // Deployment environment check
  // console.log("🌍 DEPLOYMENT INFO:", {
  //   NODE_ENV: process.env.NODE_ENV,
  //   PORT: process.env.PORT,
  //   ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS,
  //   timestamp: new Date().toISOString(),
  // });

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
  // console.log(
  //   "[AUTH CHECK] Authorization header:",
  //   authHeader,
  //   "| isAuthenticated:",
  //   isAuthenticated,
  //   "| NODE_ENV:",
  //   process.env.NODE_ENV
  // );

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
    let asyncPromptSent = false; // Track if asyncPrompt was sent
    let userEmailForAsync: string | null = null; // Track user email for asyncPrompt
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
        // console.log(`🔒 DEMO MODE: Environment: ${process.env.NODE_ENV}`);

        // In production, ensure we get at least 5 pages for demo users
        const demoMaxPages = process.env.NODE_ENV === "production" ? 5 : 5;
        console.log(`🔒 DEMO MODE: Using maxPages: ${demoMaxPages}`);

        websiteData = await webCrawlerService.extractWebsiteData(
          url,
          6,
          abortController.signal,
          demoMaxPages // maxPagesOverride for demo
        );
        // console.log(
        //   `🔒 DEMO MODE: Crawled ${websiteData.totalPagesCrawled} pages`
        // );
      } else {
        // Authenticated: crawl all pages, send asyncPrompt after 20
        const authHeader = req.headers["authorization"];
        userEmailForAsync = getEmailFromAuthHeader(authHeader);
        websiteData = await webCrawlerService.extractWebsiteData(
          url,
          6,
          abortController.signal,
          1000, // No artificial limit, crawl all
          (pagesCrawled) => {
            if (!asyncPromptSent && pagesCrawled === 20) {
              sendEvent("asyncPrompt", {
                message:
                  "Generating llms.txt for your website may take more time. You can leave this website while it is under process. We will send you the file in your email when it is completed.",
              });
              asyncPromptSent = true;
            }
          }
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

    // If asyncPrompt was sent and user is authenticated, send llms.txt email now
    if (
      asyncPromptSent &&
      isAuthenticated &&
      typeof userEmailForAsync === "string" &&
      userEmailForAsync.trim().length > 0 &&
      /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(userEmailForAsync)
    ) {
      try {
        // Build rules from pathSelections (Allow all by default)
        const rules = pathSelections.map((p: any) => ({
          id: p.path,
          userAgent: "*",
          type: "Allow",
          path: p.path,
        }));
        // Use bots from query or websiteData if available
        const selectedBots =
          bots && bots.length > 0
            ? bots
            : (websiteData as any).selectedBots || [];
        const llmsTxtContent = generateLlmsTxtContent({
          websiteData,
          pathSelections,
          rules,
          selectedBots,
          aiGeneratedContent: (websiteData as any).aiGeneratedContent || [],
          enhancedFeatures: { aiEnrichment },
        });
        console.log(
          "[EMAIL DEBUG] llms.txt content to be sent as attachment:\n",
          llmsTxtContent
        );
        // Prepare links
        const llmsFullLink = `https://thellmstxt.com/?llmsfull=1&url=${encodeURIComponent(
          url
        )}`;
        const markdownLink = `https://thellmstxt.com/?markdown=1&url=${encodeURIComponent(
          url
        )}`;
        // Compose email
        const transporter = nodemailer.createTransport({
          host: "smtp-relay.brevo.com",
          port: 587,
          secure: false,
          auth: {
            user: process.env.BREVO_SMTP_USER,
            pass: process.env.BREVO_SMTP_KEY,
          },
        });
        const mailResult = await transporter.sendMail({
          from: process.env.SMTP_USER,
          to: userEmailForAsync,
          subject: `Your llms.txt for ${url} is ready!`,
          text: `Your llms.txt file for ${url} is attached.\n\nQuick links:\n- LLMs Full: ${llmsFullLink}\n- Markdown: ${markdownLink}\n\nThank you for using TheLLMsTxt!`,
          html: `
  <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; background: #f7fafd; border-radius: 8px; box-shadow: 0 2px 8px #0001; padding: 32px 24px; border: 1px solid #e5e7eb;">
    <div style="text-align: center;">
      <h2 style="color: #1e293b; font-size: 1.7rem; margin-bottom: 8px; font-weight: 700;">Your llms.txt is ready!</h2>
      <p style="color: #334155; font-size: 1.05rem; margin-bottom: 18px;">
        Your <b>llms.txt</b> file for <a href="${url}" style="color: #2563eb; text-decoration: underline;">${url}</a> is attached.
      </p>
      <a href="${llmsFullLink}" style="display: inline-block; margin: 8px 0 0 0; padding: 10px 24px; background: #2563eb; color: #fff; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 1rem;">View LLMs Full Version</a>
      <br/>
      <a href="${markdownLink}" style="display: inline-block; margin: 12px 0 0 0; padding: 10px 24px; background: #059669; color: #fff; border-radius: 6px; text-decoration: none; font-weight: 600; font-size: 1rem;">View Markdown Version</a>
    </div>
    <hr style="margin: 32px 0 18px 0; border: none; border-top: 1px solid #e0e0e0;">
    <div style="color: #64748b; font-size: 0.97rem; text-align: center;">
      Thank you for using <a href="https://thellmstxt.com" style="color: #2563eb; text-decoration: underline;">TheLLMsTxt</a>!<br>
      If you have questions, just reply to this email.
    </div>
  </div>
`,
          attachments: [
            {
              filename: "llms.txt",
              content: llmsTxtContent,
              contentType: "text/plain",
            },
          ],
        });
        console.log(`[EMAIL] sendMail result:`, mailResult);
        if (mailResult.accepted && mailResult.accepted.length > 0) {
          console.log(`[EMAIL] accepted for delivery to:`, mailResult.accepted);
        } else {
          console.warn(
            `[EMAIL] NOT accepted for delivery. Response:`,
            mailResult
          );
        }
      } catch (err) {
        console.error("❌ Failed to send llms.txt email:", err);
      }
    } else if (asyncPromptSent && isAuthenticated) {
      if (
        typeof userEmailForAsync === "string" &&
        userEmailForAsync.trim().length > 0
      ) {
        if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(userEmailForAsync)) {
          console.warn(
            `[EMAIL] Not sending async llms.txt email: email present but invalid format: ${userEmailForAsync}`
          );
        } else {
          console.warn(
            `[EMAIL] Not sending async llms.txt email: unknown reason. Value: ${userEmailForAsync}`
          );
        }
      } else {
        console.warn(
          `[EMAIL] Not sending async llms.txt email: userEmailForAsync is missing or invalid. Value: ${userEmailForAsync}`
        );
      }
    }

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
        pathSelections.length > 5 // Changed from demoLimit to 5 for demo users
          ? pathSelections.length - 5
          : 0;
    } else if (pathSelections.length > 5) {
      // Changed from demoLimit to 5 for authenticated users
      // Keep the original logic for authenticated users if needed
      remainingPages = pathSelections.length - 5;
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
        // console.log(
        //   "[DEMO GATING] Sending demo response:",
        //   response.demoMessage +
        //     "\n" +
        //     response.demo +
        //     "\n" +
        //     response.remainingPages
        // );
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

// Simple test endpoint to check website links
router.get("/test-links", async (req: Request, res: Response) => {
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

// Helper to extract email from JWT, with debug logging
function getEmailFromAuthHeader(authHeader: string | undefined): string | null {
  if (
    !authHeader ||
    typeof authHeader !== "string" ||
    !authHeader.startsWith("Bearer ")
  )
    return null;
  const token = authHeader.replace("Bearer ", "").trim();
  try {
    const decoded = jwt.decode(token);
    console.log("[EMAIL] Decoded JWT payload:", decoded);
    if (
      decoded &&
      typeof decoded === "object" &&
      decoded.email &&
      typeof decoded.email === "string"
    ) {
      return decoded.email;
    } else {
      console.warn("[EMAIL] No email field in decoded JWT payload:", decoded);
    }
  } catch (err) {
    console.warn("[EMAIL] Failed to decode JWT for email extraction", err);
  }
  return null;
}

// Helper to generate llms.txt content matching frontend Generator.tsx
function generateLlmsTxtContent({
  websiteData,
  pathSelections,
  rules = [],
  selectedBots = [],
  aiGeneratedContent = [],
  enhancedFeatures = {},
}: {
  websiteData: any;
  pathSelections: any[];
  rules?: any[];
  selectedBots?: string[];
  aiGeneratedContent?: any[];
  enhancedFeatures?: any;
}) {
  // Build quick metadata lookup
  const metaMap = new Map();
  if (websiteData.pageMetadatas && Array.isArray(websiteData.pageMetadatas)) {
    websiteData.pageMetadatas.forEach((m: any) => metaMap.set(m.path, m));
  }
  // Build AI content lookup
  const aiContentMap = new Map();
  if (aiGeneratedContent && Array.isArray(aiGeneratedContent)) {
    aiGeneratedContent.forEach((ai: any) => aiContentMap.set(ai.path, ai));
  }
  // --- DETAILS SECTION ---
  let content = `# ${websiteData.title || "Website Overview"}\n`;
  content += `# Website: ${
    websiteData.url || websiteData.metadata?.url || ""
  }\n`;
  content += `# Last updated: ${new Date().toISOString().slice(0, 10)}\n`;
  content += `# AI Enrichment: ${
    enhancedFeatures.aiEnrichment ? "Enabled" : "Disabled"
  }\n`;
  content += `\n`;
  if (websiteData.description) {
    content += `> ${websiteData.description}\n\n`;
  }
  content += `## Company Information\n`;
  content += `- **Name**: ${websiteData.title || "N/A"}\n`;
  content += `- **Website**: ${
    websiteData.url || websiteData.metadata?.url || ""
  }\n`;
  if (websiteData.totalPagesCrawled)
    content += `- **Pages Crawled**: ${websiteData.totalPagesCrawled}\n`;
  if (websiteData.totalLinksFound)
    content += `- **Total Links Found**: ${websiteData.totalLinksFound}\n`;
  if (websiteData.uniquePathsFound)
    content += `- **Unique Paths Found**: ${websiteData.uniquePathsFound}\n`;
  content += `- **Generated**: ${new Date().toISOString()}\n`;
  content += `\n`;
  content += `## Access Permissions for LLMs\n`;
  content += `LLMs and indexing agents are encouraged to read and use this file for accurate citation and integration guidance.\n\n`;
  // Add AI tool permissions section
  const LLM_BOT_CONFIGS: { [key: string]: any } = {};
  try {
    Object.assign(LLM_BOT_CONFIGS, require("../types").LLM_BOT_CONFIGS);
  } catch {}
  const allBots = Object.keys(LLM_BOT_CONFIGS);
  const allowedBots = selectedBots || [];
  const disallowedBots = allBots.filter((b) => !allowedBots.includes(b));
  content += `## AI Tool Permissions\n\n`;
  content += `Allowed:\n`;
  allowedBots.forEach((bot: string) => {
    content += `- ${bot} (${LLM_BOT_CONFIGS[bot]?.description || ""})\n`;
  });
  content += `\nDisallowed:\n`;
  disallowedBots.forEach((bot: string) => {
    content += `- ${bot} (${LLM_BOT_CONFIGS[bot]?.description || ""})\n`;
  });
  content += `\n`;
  // --- PATHS SECTION ---
  content += `Navigation Structure\n----------------------\n`;
  // List allowed paths
  const allowedPaths = rules.filter((r: any) => r.type === "Allow");
  if (allowedPaths.length > 0) {
    content += `# Allowed Paths\n`;
    allowedPaths.forEach((rule: any) => {
      content += `- ${rule.path}\n`;
      // Merge data from pathSelections, pageMetadatas (metaMap), and aiGeneratedContent (aiContentMap)
      const pathData =
        pathSelections.find((p: any) => p.path === rule.path) || {};
      const meta = metaMap.get(rule.path) || {};
      const aiContent = aiContentMap.get(rule.path) || {};
      // Prefer richer data from meta and aiContent
      if (meta.title) content += `    • Title: ${meta.title}\n`;
      else if (pathData.title) content += `    • Title: ${pathData.title}\n`;
      if (meta.description)
        content += `    • Description: ${meta.description}\n`;
      else if (pathData.description)
        content += `    • Description: ${pathData.description}\n`;
      if (meta.keywords) content += `    • Keywords: ${meta.keywords}\n`;
      else if (pathData.keywords)
        content += `    • Keywords: ${pathData.keywords}\n`;
      if (aiContent.summary)
        content += `    • AI Summary: ${aiContent.summary}\n`;
      if (aiContent.contextSnippet)
        content += `    • AI Context: ${aiContent.contextSnippet}\n`;
      if (aiContent.contentType)
        content += `    • Content Type: ${aiContent.contentType}\n`;
      if (aiContent.priority)
        content += `    • Priority: ${aiContent.priority}\n`;
      if (aiContent.aiUsageDirective)
        content += `    • AI Usage: ${aiContent.aiUsageDirective}\n`;
      if (
        enhancedFeatures.aiEnrichment &&
        aiContent.keywords &&
        aiContent.keywords.length > 0
      ) {
        content += `    • AI Keywords: ${aiContent.keywords.join(", ")}\n`;
      }
    });
  }
  // List disallowed paths
  const disallowedPaths = rules.filter((r: any) => r.type === "Disallow");
  if (disallowedPaths.length > 0) {
    content += `# Disallowed Paths\n`;
    disallowedPaths.forEach((rule: any) => {
      content += `- ${rule.path}\n`;
    });
  }
  content += `\n`;
  // Sitemap section
  if (websiteData.paths && websiteData.paths.length > 0) {
    content += `Sitemap Structure\n-----------------\n`;
    websiteData.paths.forEach((p: any) => {
      content += `- ${typeof p === "string" ? p : p.path}\n`;
    });
    content += `\n`;
  }
  return content;
}

export default router;
