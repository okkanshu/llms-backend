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
                    const ai = await gemini_service_1.geminiService.generateAIContent(path.path, content);
                    if (meta)
                        meta.summary = ai.summary;
                    aiGeneratedContent.push(ai);
                }
                catch (error) {
                    console.warn(`⚠️ AI enrichment failed for path ${path.path}:`, error);
                }
                completed++;
                const percent = 99 + Math.round((completed / total) * 0.5);
                res.write(`event: progress\ndata: ${JSON.stringify({
                    progress: percent,
                    message: `AI enrichment: ${completed}/${total}`,
                })}\n\n`);
                await new Promise((resolve) => setTimeout(resolve, 3000));
            }
            res.write(`event: progress\ndata: ${JSON.stringify({
                progress: 99.5,
                message: "AI enrichment complete",
            })}\n\n`);
        }
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
        res.write(`event: result\ndata: ${JSON.stringify(response)}\n\n`);
        res.write(`event: progress\ndata: ${JSON.stringify({
            progress: 100,
            message: "Analysis complete",
        })}\n\n`);
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
async function enrichPathsWithAI(paths, pageMetadatas) {
    const aiContent = [];
    const batchSize = 3;
    for (let i = 0; i < paths.length; i += batchSize) {
        const batch = paths.slice(i, i + batchSize);
        const batchPromises = batch.map(async (path) => {
            try {
                const metadata = pageMetadatas?.find((m) => m.path === path.path);
                let content = "";
                if (metadata?.title)
                    content += `Title: ${metadata.title}\n`;
                if (metadata?.description)
                    content += `Description: ${metadata.description}\n`;
                if (metadata?.keywords)
                    content += `Keywords: ${metadata.keywords}\n`;
                if (!content) {
                    content = `Path: ${path.path}`;
                }
                const aiGenerated = await gemini_service_1.geminiService.generateAIContent(path.path, content);
                path.summary = aiGenerated.summary;
                path.contextSnippet = aiGenerated.contextSnippet;
                path.priority = aiGenerated.priority;
                path.contentType = aiGenerated.contentType;
                path.aiUsageDirective = aiGenerated.aiUsageDirective;
                return aiGenerated;
            }
            catch (error) {
                console.warn(`⚠️ AI enrichment failed for path ${path.path}:`, error);
                return undefined;
            }
        });
        const batchResults = await Promise.all(batchPromises);
        aiContent.push(...batchResults.filter(Boolean));
        if (i + batchSize < paths.length) {
            await new Promise((resolve) => setTimeout(resolve, 5000));
        }
    }
    return aiContent;
}
exports.default = router;
//# sourceMappingURL=website-analysis.js.map