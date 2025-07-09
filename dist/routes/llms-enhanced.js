"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const llms_full_service_1 = require("../services/llms-full.service");
const markdown_generator_service_1 = require("../services/markdown-generator.service");
const gemini_service_1 = require("../services/gemini.service");
const types_1 = require("../types");
const router = (0, express_1.Router)();
router.post("/generate-llms-full", async (req, res) => {
    const startTime = Date.now();
    try {
        console.log("🚀 Starting llms-full.txt generation request");
        console.log("📥 Request body:", req.body);
        const validationResult = types_1.LLMsFullPayloadSchema.safeParse(req.body);
        if (!validationResult.success) {
            console.error("❌ Request validation failed:", validationResult.error.errors);
            res.status(400).json({
                success: false,
                error: "Invalid request data",
                details: validationResult.error.errors,
            });
            return;
        }
        const payload = validationResult.data;
        console.log("✅ Request validation passed");
        const result = await llms_full_service_1.llmsFullService.generateLLMsFull(payload);
        const totalTime = Date.now() - startTime;
        console.log("✅ llms-full.txt generation completed:", {
            totalTime: `${totalTime}ms`,
            success: result.success,
            totalPages: result.totalPages,
            totalWords: result.totalWords,
        });
        res.json(result);
    }
    catch (error) {
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
router.post("/generate-markdown", async (req, res) => {
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
        const result = await markdown_generator_service_1.markdownGeneratorService.generateMarkdownPages(websiteUrl);
        const totalTime = Date.now() - startTime;
        console.log("✅ Markdown generation completed:", {
            totalTime: `${totalTime}ms`,
            success: result.success,
            totalFiles: result.files.length,
        });
        res.json(result);
    }
    catch (error) {
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
router.get("/llms-index.json", async (req, res) => {
    try {
        const { url } = req.query;
        if (!url || typeof url !== "string") {
            res.status(400).json({
                success: false,
                error: "url query parameter is required",
            });
            return;
        }
        console.log(`🔍 Generating llms-index.json for: ${url}`);
        const siteInfo = {
            website: url,
            generated: new Date().toISOString(),
            version: "1.0.0",
            endpoints: {
                llms_txt: `${url}/llms.txt`,
                llms_full: `${url}/llms-full.txt`,
                sitemap: `${url}/sitemap.xml`,
            },
            features: {
                ai_enrichment: true,
                markdown_pages: true,
                hierarchical_structure: true,
                analytics: true,
            },
            llm_bots: [
                "ChatGPT-User",
                "GPTBot",
                "GoogleExtended",
                "Claude",
                "Anthropic",
                "CCBot",
            ],
        };
        res.json({
            success: true,
            data: siteInfo,
        });
    }
    catch (error) {
        console.error("❌ llms-index.json generation failed:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
router.post("/ai-enrich", async (req, res) => {
    try {
        console.log("🚀 Starting AI enrichment request");
        const { path, content } = req.body;
        if (!path || !content) {
            res.status(400).json({
                success: false,
                error: "path and content are required",
            });
            return;
        }
        const aiContent = await gemini_service_1.openRouterService.generateAIContent(path, content);
        res.json({
            success: true,
            data: aiContent,
        });
    }
    catch (error) {
        console.error("❌ AI enrichment failed:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
router.post("/hierarchical-structure", async (req, res) => {
    try {
        console.log("🚀 Starting hierarchical structure generation");
        const { paths } = req.body;
        if (!paths || !Array.isArray(paths)) {
            res.status(400).json({
                success: false,
                error: "paths array is required",
            });
            return;
        }
        const structure = await gemini_service_1.openRouterService.generateHierarchicalStructure(paths);
        res.json({
            success: true,
            data: structure,
        });
    }
    catch (error) {
        console.error("❌ Hierarchical structure generation failed:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
router.get("/analytics", async (req, res) => {
    try {
        const { url } = req.query;
        if (!url || typeof url !== "string") {
            res.status(400).json({
                success: false,
                error: "url query parameter is required",
            });
            return;
        }
        const analyticsData = {
            websiteUrl: url,
            accessCount: Math.floor(Math.random() * 1000) + 100,
            lastAccessed: new Date().toISOString(),
            userAgents: ["ChatGPT-User", "GPTBot", "Google-Extended", "Claude-Web"],
            mostAccessedPaths: [
                { path: "/", count: 150 },
                { path: "/about", count: 75 },
                { path: "/contact", count: 50 },
                { path: "/blog", count: 25 },
            ],
            generationCount: Math.floor(Math.random() * 50) + 10,
            lastGenerated: new Date().toISOString(),
        };
        const response = {
            success: true,
            data: analyticsData,
        };
        res.json(response);
    }
    catch (error) {
        console.error("❌ Analytics retrieval failed:", error);
        res.status(500).json({
            success: false,
            data: {},
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
router.post("/webhook/regenerate", async (req, res) => {
    try {
        console.log("🚀 Webhook regeneration request received");
        const { websiteUrl, type, secret } = req.body;
        if (!websiteUrl) {
            res.status(400).json({
                success: false,
                error: "websiteUrl is required",
            });
            return;
        }
        const expectedSecret = process.env.WEBHOOK_SECRET;
        if (expectedSecret && secret !== expectedSecret) {
            res.status(401).json({
                success: false,
                error: "Invalid webhook secret",
            });
            return;
        }
        let result;
        switch (type) {
            case "llms-full":
                result = await llms_full_service_1.llmsFullService.generateLLMsFull({
                    websiteUrl,
                    aiEnrichment: true,
                });
                break;
            case "markdown":
                result = await markdown_generator_service_1.markdownGeneratorService.generateMarkdownPages(websiteUrl);
                break;
            default:
                const [fullResult, markdownResult] = await Promise.all([
                    llms_full_service_1.llmsFullService.generateLLMsFull({
                        websiteUrl,
                        aiEnrichment: true,
                    }),
                    markdown_generator_service_1.markdownGeneratorService.generateMarkdownPages(websiteUrl),
                ]);
                result = {
                    llmsFull: fullResult,
                    markdown: markdownResult,
                };
        }
        res.json({
            success: true,
            message: "Regeneration completed successfully",
            data: result,
            timestamp: new Date().toISOString(),
        });
    }
    catch (error) {
        console.error("❌ Webhook regeneration failed:", error);
        res.status(500).json({
            success: false,
            error: error instanceof Error ? error.message : "Unknown error",
        });
    }
});
exports.default = router;
//# sourceMappingURL=llms-enhanced.js.map