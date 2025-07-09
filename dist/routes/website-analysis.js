"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const firecrawl_service_1 = require("../services/firecrawl.service");
const gemini_service_1 = require("../services/gemini.service");
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
    if (sessionId) {
        activeSessions.set(sessionId, abortController);
    }
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
    try {
        res.write(`event: progress\ndata: ${JSON.stringify({
            progress: 1,
            message: "Starting extraction...",
        })}\n\n`);
        if (abortController.signal.aborted) {
            res.write(`event: cancelled\ndata: ${JSON.stringify({
                message: "Analysis cancelled by user",
            })}\n\n`);
            res.end();
            if (sessionId)
                activeSessions.delete(sessionId);
            return;
        }
        let websiteData;
        let crawlProgress = 5;
        let crawlHeartbeat;
        const sendCrawlHeartbeat = () => {
            if (crawlProgress < 99) {
                res.write(`event: progress\ndata: ${JSON.stringify({
                    progress: crawlProgress,
                    message: `Crawling website...`,
                })}\n\n`);
                crawlProgress += 3;
            }
        };
        crawlHeartbeat = setInterval(sendCrawlHeartbeat, 3000);
        try {
            websiteData = await firecrawl_service_1.firecrawlService.extractWebsiteData(url);
        }
        finally {
            clearInterval(crawlHeartbeat);
        }
        if (abortController.signal.aborted) {
            res.write(`event: cancelled\ndata: ${JSON.stringify({
                message: "Analysis cancelled by user",
            })}\n\n`);
            res.end();
            if (sessionId)
                activeSessions.delete(sessionId);
            return;
        }
        res.write(`event: progress\ndata: ${JSON.stringify({
            progress: 99,
            message: "Website data extracted",
        })}\n\n`);
        const pathSelections = firecrawl_service_1.firecrawlService.convertToPathSelections(websiteData.paths);
        res.write(`event: progress\ndata: ${JSON.stringify({
            progress: 60,
            message: "Paths converted",
        })}\n\n`);
        let aiGeneratedContent = [];
        let rateLimitHit = false;
        if (aiEnrichment) {
            const total = pathSelections.length;
            let completed = 0;
            for (const path of pathSelections) {
                if (abortController.signal.aborted) {
                    res.write(`event: cancelled\ndata: ${JSON.stringify({
                        message: "Analysis cancelled by user",
                    })}\n\n`);
                    res.end();
                    if (sessionId)
                        activeSessions.delete(sessionId);
                    return;
                }
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
                    let ai;
                    try {
                        ai = await gemini_service_1.openRouterService.generateAIContent(path.path, content);
                    }
                    catch (error) {
                        if (error instanceof Error &&
                            error.message &&
                            error.message.startsWith("RATE_LIMIT_REACHED:")) {
                            res.write(`event: error\ndata: ${JSON.stringify({
                                error: "AI rate limit reached. Please try again in a few minutes.",
                                details: error.message,
                            })}\n\n`);
                            rateLimitHit = true;
                            break;
                        }
                        else {
                            console.warn(`⚠️ AI enrichment failed for path ${path.path}:`, error);
                            continue;
                        }
                    }
                    if (meta && ai)
                        meta.summary = ai.summary;
                    if (ai)
                        aiGeneratedContent.push(ai);
                }
                catch (error) {
                }
                completed++;
                const percent = 99 + Math.round((completed / total) * 0.5);
                res.write(`event: progress\ndata: ${JSON.stringify({
                    progress: percent,
                    message: `AI enrichment: ${completed}/${total}`,
                })}\n\n`);
                await new Promise((resolve) => setTimeout(resolve, 10000));
            }
            if (!rateLimitHit) {
                res.write(`event: progress\ndata: ${JSON.stringify({
                    progress: 99.5,
                    message: "AI enrichment complete",
                })}\n\n`);
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
            res.write(`event: result\ndata: ${JSON.stringify(response)}\n\n`);
            res.write(`event: progress\ndata: ${JSON.stringify({
                progress: 100,
                message: "Analysis complete",
            })}\n\n`);
        }
        res.end();
    }
    catch (error) {
        res.write(`event: error\ndata: ${JSON.stringify({
            error: error instanceof Error ? error.message : "Unknown error",
        })}\n\n`);
        res.end();
    }
    finally {
        if (sessionId)
            activeSessions.delete(sessionId);
    }
});
exports.default = router;
//# sourceMappingURL=website-analysis.js.map