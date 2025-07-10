"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const llms_full_service_1 = require("../services/llms-full.service");
const markdown_generator_service_1 = require("../services/markdown-generator.service");
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
exports.default = router;
//# sourceMappingURL=llms-enhanced.js.map