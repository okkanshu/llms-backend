"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.geminiService = exports.GeminiService = void 0;
const generative_ai_1 = require("@google/generative-ai");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class GeminiService {
    constructor() {
        this.lastRequestTime = 0;
        this.minRequestInterval = 8000;
        this.apiKey = process.env.GEMINI_API_KEY || "";
        if (!this.apiKey) {
            console.warn("⚠️ GEMINI_API_KEY not found in environment variables");
        }
        this.genAI = new generative_ai_1.GoogleGenerativeAI(this.apiKey);
        this.model = this.genAI.getGenerativeModel({
            model: "gemini-2.0-flash-exp",
        });
    }
    async waitForRateLimit() {
        const now = Date.now();
        const timeSinceLastRequest = now - this.lastRequestTime;
        if (timeSinceLastRequest < this.minRequestInterval) {
            const waitTime = this.minRequestInterval - timeSinceLastRequest;
            await new Promise((resolve) => setTimeout(resolve, waitTime));
        }
        this.lastRequestTime = Date.now();
    }
    async retryWithBackoff(fn, maxRetries = 3, baseDelay = 8000) {
        for (let attempt = 0; attempt <= maxRetries; attempt++) {
            try {
                await this.waitForRateLimit();
                return await fn();
            }
            catch (error) {
                if (attempt === maxRetries) {
                    throw error;
                }
                if (error.status === 429 || error.message?.includes("429")) {
                    const delay = baseDelay;
                    console.warn(`⚠️ Rate limited, retrying in ${delay}ms (attempt ${attempt + 1}/${maxRetries + 1})`);
                    await new Promise((resolve) => setTimeout(resolve, delay));
                    continue;
                }
                throw error;
            }
        }
        throw new Error("Max retries exceeded");
    }
    async generatePathSummary(path, content) {
        if (!this.apiKey) {
            return "Summary not available (AI service not configured)";
        }
        try {
            const prompt = `Generate a concise 1-2 sentence summary for this webpage content. Focus on the main purpose and key information.

Path: ${path}
Content: ${content.substring(0, 2000)}...

Summary:`;
            return await this.retryWithBackoff(async () => {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                return response.text().trim();
            });
        }
        catch (error) {
            console.error("Error generating path summary:", error);
            return "Summary generation failed";
        }
    }
    async generateContextSnippet(path, content) {
        if (!this.apiKey) {
            return "Context snippet not available (AI service not configured)";
        }
        try {
            const prompt = `Generate a brief context snippet (2-3 sentences) that describes what this page is about and its key value proposition.

Path: ${path}
Content: ${content.substring(0, 2000)}...

Context Snippet:`;
            return await this.retryWithBackoff(async () => {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                return response.text().trim();
            });
        }
        catch (error) {
            console.error("Error generating context snippet:", error);
            return "Context snippet generation failed";
        }
    }
    async extractKeywords(content) {
        if (!this.apiKey) {
            return [];
        }
        try {
            const prompt = `Extract 5-10 relevant keywords from this content. Return only the keywords as a comma-separated list.

Content: ${content.substring(0, 2000)}...

Keywords:`;
            return await this.retryWithBackoff(async () => {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const keywords = response
                    .text()
                    .trim()
                    .split(",")
                    .map((k) => k.trim());
                return keywords.filter((k) => k.length > 0);
            });
        }
        catch (error) {
            console.error("Error extracting keywords:", error);
            return [];
        }
    }
    async determineContentType(path, content) {
        if (!this.apiKey) {
            return "page";
        }
        try {
            const prompt = `Based on the path and content, determine the content type. Choose from: page, blog, docs, project, archive, terms.

Path: ${path}
Content: ${content.substring(0, 1000)}...

Content Type:`;
            return await this.retryWithBackoff(async () => {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const contentType = response.text().trim().toLowerCase();
                const allowedTypes = [
                    "page",
                    "blog",
                    "docs",
                    "project",
                    "archive",
                    "terms",
                ];
                return allowedTypes.includes(contentType) ? contentType : "page";
            });
        }
        catch (error) {
            console.error("Error determining content type:", error);
            return "page";
        }
    }
    async determinePriority(path, content) {
        if (!this.apiKey) {
            return "medium";
        }
        try {
            const prompt = `Based on the path and content, determine the priority level for AI crawling. Consider factors like:
- High: Main pages, important content, frequently accessed
- Medium: Regular content pages
- Low: Archive, terms, less important pages

Path: ${path}
Content: ${content.substring(0, 1000)}...

Priority (high/medium/low):`;
            return await this.retryWithBackoff(async () => {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const priority = response.text().trim().toLowerCase();
                if (priority === "high" ||
                    priority === "medium" ||
                    priority === "low") {
                    return priority;
                }
                return "medium";
            });
        }
        catch (error) {
            console.error("Error determining priority:", error);
            return "medium";
        }
    }
    async suggestAIUsageDirective(path, content) {
        if (!this.apiKey) {
            return "allow";
        }
        try {
            const prompt = `Based on the path and content, suggest an AI usage directive:
- allow: Standard content that can be freely used
- citation-only: Content that should only be used for citations
- no-fine-tuning: Content that can be used but not for training
- disallow: Content that should not be used by AI

Path: ${path}
Content: ${content.substring(0, 1000)}...

Directive:`;
            return await this.retryWithBackoff(async () => {
                const result = await this.model.generateContent(prompt);
                const response = await result.response;
                const directive = response.text().trim().toLowerCase();
                const allowedDirectives = [
                    "allow",
                    "citation-only",
                    "no-fine-tuning",
                    "disallow",
                ];
                return allowedDirectives.includes(directive)
                    ? directive
                    : "allow";
            });
        }
        catch (error) {
            console.error("Error suggesting AI usage directive:", error);
            return "allow";
        }
    }
    async generateAIContent(path, content) {
        try {
            const [summary, contextSnippet, keywords, contentType, priority, aiUsageDirective,] = await Promise.all([
                this.generatePathSummary(path, content),
                this.generateContextSnippet(path, content),
                this.extractKeywords(content),
                this.determineContentType(path, content),
                this.determinePriority(path, content),
                this.suggestAIUsageDirective(path, content),
            ]);
            return {
                path,
                summary,
                contextSnippet,
                keywords,
                contentType,
                priority,
                aiUsageDirective,
                generatedAt: new Date().toISOString(),
                model: "gemini-2.0-flash-exp",
            };
        }
        catch (error) {
            console.error("Error generating AI content:", error);
            return {
                path,
                summary: "AI analysis failed",
                contextSnippet: "Context analysis failed",
                keywords: [],
                contentType: "page",
                priority: "medium",
                aiUsageDirective: "allow",
                generatedAt: new Date().toISOString(),
                model: "gemini-2.0-flash-exp",
            };
        }
    }
    async enrichMetadata(title, description, content) {
        const [keywords, contentType, priority, aiUsageDirective] = await Promise.all([
            this.extractKeywords(content),
            this.determineContentType("", content),
            this.determinePriority("", content),
            this.suggestAIUsageDirective("", content),
        ]);
        return {
            title,
            description,
            keywords,
            contentType,
            priority,
            aiUsageDirective,
            lastModified: new Date().toISOString(),
        };
    }
    async generateHierarchicalStructure(paths) {
        if (!this.apiKey) {
            return [];
        }
        try {
            const prompt = `Group these website paths into logical hierarchical sections. For each group, provide a name and description.

Paths: ${paths.join("\n")}

Return as JSON array with format:
[
  {
    "group": "Main Pages",
    "paths": ["/", "/about", "/contact"],
    "description": "Primary navigation pages"
  }
]`;
            const result = await this.model.generateContent(prompt);
            const response = await result.response;
            const jsonMatch = response.text().match(/\[[\s\S]*\]/);
            if (jsonMatch) {
                return JSON.parse(jsonMatch[0]);
            }
            return [];
        }
        catch (error) {
            console.error("Error generating hierarchical structure:", error);
            return [];
        }
    }
}
exports.GeminiService = GeminiService;
exports.geminiService = new GeminiService();
//# sourceMappingURL=gemini.service.js.map