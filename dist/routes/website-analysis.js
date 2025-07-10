"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const web_crawler_service_1 = require("../services/web-crawler.service");
const ai_service_1 = require("../services/ai.service");
const types_1 = require("../types");
const router = (0, express_1.Router)();
const activeSessions = new Map();
router.post("/analyze-website", (_req, res) => {
    res.status(410).json({
        success: false,
        error: "This endpoint has been replaced by GET /api/analyze-website (SSE). Update your client to use the new streaming endpoint.",
    });
});
router.post("/cancel-analysis", (req, res) => {
    const { sessionId } = req.body;
    if (!sessionId) {
        res.status(400).json({ success: false, error: "Session ID required" });
        return;
    }
    const controller = activeSessions.get(sessionId);
    if (controller) {
        controller.abort();
        activeSessions.delete(sessionId);
        (0, ai_service_1.cleanupSessionRateLimiter)(sessionId);
        res.json({ success: true, message: "Analysis cancelled" });
    }
    else {
        res.status(404).json({ success: false, error: "Session not found" });
    }
});
router.get("/analyze-website", async (req, res) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.flushHeaders();
    const url = req.query.url;
    const bots = req.query.bots?.split(",").filter(Boolean) || [];
    const aiEnrichment = req.query.aiEnrichment === "true";
    const sessionId = req.query.sessionId;
    const abortController = new AbortController();
    if (sessionId)
        activeSessions.set(sessionId, abortController);
    const validationResult = types_1.WebsiteAnalysisRequestSchema.safeParse({
        url,
        bots,
        aiEnrichment,
    });
    if (!validationResult.success) {
        res.write(`event: error\ndata: ${JSON.stringify({
            error: "Invalid request data",
        })}\n\n`);
        res.end();
        if (sessionId)
            activeSessions.delete(sessionId);
        return;
    }
    const sendEvent = (event, data) => {
        res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const checkCancellation = () => {
        if (abortController.signal.aborted) {
            sendEvent("cancelled", { message: "Analysis cancelled by user" });
            res.end();
            if (sessionId)
                activeSessions.delete(sessionId);
            return true;
        }
        return false;
    };
    try {
        sendEvent("progress", { progress: 1, message: "Starting extraction..." });
        if (checkCancellation())
            return;
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
            websiteData = await web_crawler_service_1.webCrawlerService.extractWebsiteData(url);
        }
        finally {
            clearInterval(crawlHeartbeat);
        }
        if (checkCancellation())
            return;
        sendEvent("progress", { progress: 99, message: "Website data extracted" });
        const pathSelections = web_crawler_service_1.webCrawlerService.convertToPathSelections(websiteData.paths);
        sendEvent("progress", { progress: 60, message: "Paths converted" });
        let aiGeneratedContent = [];
        let rateLimitHit = false;
        if (aiEnrichment) {
            const total = pathSelections.length;
            let completed = 0;
            for (const path of pathSelections) {
                if (checkCancellation())
                    return;
                try {
                    const meta = websiteData.pageMetadatas?.find((m) => m.path === path.path);
                    let content = "";
                    if (meta?.title)
                        content += `Title: ${meta.title}\n`;
                    if (meta?.description)
                        content += `Description: ${meta.description}\n`;
                    if (meta?.keywords)
                        content += `Keywords: ${meta.keywords}\n`;
                    if (!content)
                        content = `Path: ${path.path}`;
                    const ai = await ai_service_1.xaiService.generateAIContent(path.path, content, abortController.signal, sessionId);
                    if (meta && ai)
                        meta.summary = ai.summary;
                    if (ai)
                        aiGeneratedContent.push(ai);
                }
                catch (error) {
                    if (error instanceof Error &&
                        error.message?.startsWith("RATE_LIMIT_REACHED:")) {
                        sendEvent("error", {
                            error: "AI rate limit reached. Please try again in a few minutes.",
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
            }
            if (!rateLimitHit) {
                sendEvent("progress", {
                    progress: 99.5,
                    message: "AI enrichment complete",
                });
            }
        }
        if (!aiEnrichment || !rateLimitHit) {
            const response = {
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
            console.log("🔍 Backend sending response:", {
                aiEnrichment,
                rateLimitHit,
                aiGeneratedContentLength: aiGeneratedContent.length,
                hasAiContent: !!response.aiGeneratedContent,
                aiContentSample: response.aiGeneratedContent?.slice(0, 2),
            });
            sendEvent("result", response);
            sendEvent("progress", { progress: 100, message: "Analysis complete" });
        }
        res.end();
    }
    catch (error) {
        sendEvent("error", {
            error: error instanceof Error ? error.message : "Unknown error",
        });
        res.end();
    }
    finally {
        if (sessionId) {
            activeSessions.delete(sessionId);
            (0, ai_service_1.cleanupSessionRateLimiter)(sessionId);
        }
    }
});
exports.default = router;
//# sourceMappingURL=website-analysis.js.map