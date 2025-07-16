"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const web_crawler_service_1 = require("../services/web-crawler.service");
const router = (0, express_1.Router)();
router.post("/generate-llms-full", async (req, res) => {
    const startTime = Date.now();
    try {
        const { websiteUrl, maxDepth = 3 } = req.body;
        if (!websiteUrl) {
            res.status(400).json({
                success: false,
                content: "",
                filename: "",
                totalPages: 0,
                totalWords: 0,
                error: "websiteUrl is required",
            });
            return;
        }
        const result = await web_crawler_service_1.webCrawlerService.generateLLMsFull(websiteUrl, maxDepth);
        const totalTime = Date.now() - startTime;
        res.json({
            success: true,
            content: result.content,
            filename: "llms-full.txt",
            totalPages: result.totalPages,
            totalWords: result.totalWords,
        });
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
exports.default = router;
//# sourceMappingURL=llms-generator.js.map