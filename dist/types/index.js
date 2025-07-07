"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLM_BOT_CONFIGS = exports.AutomationConfigSchema = exports.PathSelectionSchema = exports.LLMsFullPayloadSchema = exports.LLMsTxtPayloadSchema = exports.WebsiteAnalysisRequestSchema = void 0;
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
exports.LLMsTxtPayloadSchema = zod_1.z.object({
    bot: zod_1.z.enum([
        "ChatGPT-User",
        "GPTBot",
        "GoogleExtended",
        "Claude",
        "Anthropic",
        "CCBot",
    ]),
    allowPaths: zod_1.z.array(zod_1.z.string()),
    disallowPaths: zod_1.z.array(zod_1.z.string()),
    websiteUrl: zod_1.z.string().url("Invalid website URL"),
    generateFull: zod_1.z.boolean().optional(),
    generateMarkdown: zod_1.z.boolean().optional(),
    includeSummaries: zod_1.z.boolean().optional(),
    includeContextSnippets: zod_1.z.boolean().optional(),
    hierarchicalLayout: zod_1.z.boolean().optional(),
    aiEnrichment: zod_1.z.boolean().optional(),
});
exports.LLMsFullPayloadSchema = zod_1.z.object({
    websiteUrl: zod_1.z.string().url("Invalid website URL"),
    includeImages: zod_1.z.boolean().optional(),
    includeLinks: zod_1.z.boolean().optional(),
    maxDepth: zod_1.z.number().min(1).max(10).optional(),
    aiEnrichment: zod_1.z.boolean().optional(),
});
exports.PathSelectionSchema = zod_1.z.object({
    path: zod_1.z.string(),
    allow: zod_1.z.boolean(),
    description: zod_1.z.string().optional(),
    priority: zod_1.z.enum(["high", "medium", "low"]).optional(),
    tags: zod_1.z.array(zod_1.z.string()).optional(),
    contentType: zod_1.z
        .enum(["page", "blog", "docs", "project", "archive", "terms"])
        .optional(),
    lastModified: zod_1.z.string().optional(),
    summary: zod_1.z.string().optional(),
    contextSnippet: zod_1.z.string().optional(),
    aiUsageDirective: zod_1.z
        .enum(["allow", "citation-only", "no-fine-tuning", "disallow"])
        .optional(),
});
exports.AutomationConfigSchema = zod_1.z.object({
    enabled: zod_1.z.boolean(),
    schedule: zod_1.z.string(),
    websiteUrl: zod_1.z.string().url("Invalid website URL"),
    llmBot: zod_1.z.enum([
        "ChatGPT-User",
        "GPTBot",
        "GoogleExtended",
        "Claude",
        "Anthropic",
        "CCBot",
    ]),
    generateFull: zod_1.z.boolean(),
    generateMarkdown: zod_1.z.boolean(),
    webhookUrl: zod_1.z.string().url("Invalid webhook URL").optional(),
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