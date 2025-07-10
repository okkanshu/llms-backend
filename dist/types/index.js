"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLM_BOT_CONFIGS = exports.LLMsFullPayloadSchema = exports.WebsiteAnalysisRequestSchema = void 0;
const zod_1 = require("zod");
exports.WebsiteAnalysisRequestSchema = zod_1.z.object({
    url: zod_1.z.string().url("Invalid URL format"),
    bots: zod_1.z
        .array(zod_1.z.enum([
        "ChatGPT-User",
        "GPTBot",
        "GoogleExtended",
        "Claude",
        "Anthropic",
        "CCBot",
    ]))
        .min(1, "At least one bot must be selected"),
    aiEnrichment: zod_1.z.boolean().optional(),
});
exports.LLMsFullPayloadSchema = zod_1.z.object({
    websiteUrl: zod_1.z.string().url("Invalid website URL"),
    includeImages: zod_1.z.boolean().optional(),
    includeLinks: zod_1.z.boolean().optional(),
    maxDepth: zod_1.z.number().min(1).max(10).optional(),
    aiEnrichment: zod_1.z.boolean().optional(),
});
exports.LLM_BOT_CONFIGS = {
    "ChatGPT-User": {
        name: "ChatGPT-User",
        userAgent: "ChatGPT-User",
        description: "OpenAI ChatGPT web browsing",
    },
    GPTBot: {
        name: "GPTBot",
        userAgent: "GPTBot",
        description: "OpenAI GPT training crawler",
    },
    GoogleExtended: {
        name: "GoogleExtended",
        userAgent: "Google-Extended",
        description: "Google AI training crawler",
    },
    Claude: {
        name: "Claude",
        userAgent: "Claude-Web",
        description: "Anthropic Claude web browsing",
    },
    Anthropic: {
        name: "Anthropic",
        userAgent: "anthropic-ai",
        description: "Anthropic AI training crawler",
    },
    CCBot: {
        name: "CCBot",
        userAgent: "CCBot",
        description: "Common Crawl bot",
    },
};
//# sourceMappingURL=index.js.map