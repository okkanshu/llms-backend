"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.LLM_BOT_CONFIGS = exports.PathSelectionSchema = exports.LLMsTxtPayloadSchema = exports.WebsiteAnalysisRequestSchema = void 0;
const zod_1 = require("zod");
exports.WebsiteAnalysisRequestSchema = zod_1.z.object({
    url: zod_1.z.string().url("Invalid URL format"),
    llmBot: zod_1.z.enum([
        "ChatGPT-User",
        "GPTBot",
        "GoogleExtended",
        "Claude",
        "Anthropic",
        "CCBot",
    ]),
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
});
exports.PathSelectionSchema = zod_1.z.object({
    path: zod_1.z.string(),
    allow: zod_1.z.boolean(),
    description: zod_1.z.string().optional(),
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