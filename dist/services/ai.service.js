"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.xaiService = exports.XAIService = void 0;
exports.cleanupSessionRateLimiter = cleanupSessionRateLimiter;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class XAIRateLimiter {
    constructor() {
        this.queue = [];
        this.processing = false;
        this.requestCount = 0;
        this.lastResetTime = Date.now();
        this.MAX_REQUESTS_PER_SECOND = 6;
        this.RESET_INTERVAL = 1000;
    }
    async executeRequest(requestFn, signal, sessionId) {
        this.abortSignal = signal;
        this.sessionId = sessionId;
        return new Promise((resolve, reject) => {
            const wrappedRequest = async () => {
                try {
                    const result = await requestFn();
                    resolve(result);
                }
                catch (error) {
                    reject(error);
                }
            };
            this.queue.push(wrappedRequest);
            this.processQueue();
        });
    }
    async processQueue() {
        if (this.processing)
            return;
        this.processing = true;
        while (this.queue.length > 0) {
            if (this.abortSignal?.aborted) {
                console.log(`[X.AI] Queue processing cancelled for session: ${this.sessionId}`);
                this.queue = [];
                this.processing = false;
                return;
            }
            const now = Date.now();
            if (now - this.lastResetTime >= this.RESET_INTERVAL) {
                this.requestCount = 0;
                this.lastResetTime = now;
            }
            if (this.requestCount < this.MAX_REQUESTS_PER_SECOND) {
                const request = this.queue.shift();
                if (request) {
                    this.requestCount++;
                    console.log(`[X.AI] Processing request ${this.requestCount}/${this.MAX_REQUESTS_PER_SECOND} per second`);
                    await request();
                }
            }
            else {
                const waitTime = this.RESET_INTERVAL - (now - this.lastResetTime);
                console.log(`[X.AI] Rate limit reached, waiting ${Math.round(waitTime)}ms for next second`);
                await new Promise((resolve) => setTimeout(resolve, waitTime));
            }
        }
        this.processing = false;
    }
}
const globalRateLimiter = new XAIRateLimiter();
const sessionRateLimiters = new Map();
console.log("🔑 Loaded XAI_API_KEY:", process.env.XAI_API_KEY
    ? process.env.XAI_API_KEY.slice(0, 8) + "..."
    : undefined);
const XAI_API_KEY = process.env.XAI_API_KEY || "";
const XAI_MODEL = process.env.XAI_MODEL || "grok-3-mini";
const XAI_API_URL = process.env.XAI_API_URL || "https://api.x.ai/v1";
if (!XAI_API_KEY) {
    console.warn("⚠️ XAI_API_KEY not found in environment variables");
}
async function callXAI(messages, temperature = 0.7, maxTokens = 1024, signal, sessionId) {
    let sessionLimiter = sessionRateLimiters.get(sessionId || "default");
    if (!sessionLimiter) {
        sessionLimiter = new XAIRateLimiter();
        if (sessionId) {
            sessionRateLimiters.set(sessionId, sessionLimiter);
        }
    }
    return sessionLimiter.executeRequest(async () => {
        console.log("📡 Sending auth header:", `Bearer ${XAI_API_KEY ? XAI_API_KEY.slice(0, 8) + "..." : ""}`);
        const response = await fetch(`${XAI_API_URL}/chat/completions`, {
            method: "POST",
            headers: {
                Authorization: `Bearer ${XAI_API_KEY}`,
                "Content-Type": "application/json",
            },
            body: JSON.stringify({
                model: XAI_MODEL,
                messages,
                temperature,
                max_tokens: maxTokens,
                stream: false,
            }),
            signal,
        });
        if (response.status === 429) {
            const errorText = await response.text();
            console.error("[X.AI] Rate limit hit (429):", errorText);
            throw new Error("RATE_LIMIT_REACHED: " + errorText);
        }
        if (!response.ok) {
            const errorText = await response.text();
            console.error(`[X.AI] API error: ${response.status} -`, errorText);
            throw new Error(`X.AI API error: ${response.status} - ${errorText}`);
        }
        const data = (await response.json());
        console.log(`[X.AI] API call successful. Rate limiting handled by queue.`);
        return data.choices?.[0]?.message?.content?.trim() || "";
    });
}
class XAIService {
    async generateAIContent(path, content, signal, sessionId) {
        const prompt = `Analyze this webpage content and provide the following information:

Path: ${path}
Content: ${content.substring(0, 3000)}...

Please provide your response in this exact format:

SUMMARY: [1-2 sentence summary of the main purpose and key information]
CONTEXT: [2-3 sentences describing what this page is about and its key value proposition]
KEYWORDS: [keyword1, keyword2, keyword3, keyword4, keyword5]
CONTENT_TYPE: [page|blog|docs|project|archive|terms]
PRIORITY: [high|medium|low]
AI_USAGE: [allow|citation-only|no-fine-tuning|disallow]

Guidelines:
- CONTENT_TYPE: page (regular pages), blog (blog posts), docs (documentation), project (project pages), archive (archived content), terms (legal/terms pages)
- PRIORITY: high (main pages, important content), medium (regular content), low (archive, terms, less important)
- AI_USAGE: allow (standard content), citation-only (citation only), no-fine-tuning (use but don't train), disallow (should not be used by AI)
- KEYWORDS: 5-10 relevant keywords separated by commas
- SUMMARY: concise 1-2 sentence summary
- CONTEXT: brief context about page purpose and value

Return only the formatted response with the exact labels shown above.`;
        try {
            const result = await callXAI([
                {
                    role: "system",
                    content: "You are a helpful assistant for website content analysis. Always provide responses in the exact format requested.",
                },
                { role: "user", content: prompt },
            ], 0.7, 1024, signal, sessionId);
            const lines = result.split("\n").filter((line) => line.trim());
            const parsed = {};
            console.log("🔍 AI raw response:", result);
            console.log("🔍 AI parsed lines:", lines);
            for (const line of lines) {
                if (line.startsWith("SUMMARY:")) {
                    parsed.summary = line.replace("SUMMARY:", "").trim();
                }
                else if (line.startsWith("CONTEXT:")) {
                    parsed.contextSnippet = line.replace("CONTEXT:", "").trim();
                }
                else if (line.startsWith("KEYWORDS:")) {
                    const keywordsStr = line.replace("KEYWORDS:", "").trim();
                    parsed.keywords = keywordsStr
                        .split(",")
                        .map((k) => k.trim())
                        .filter(Boolean);
                }
                else if (line.startsWith("CONTENT_TYPE:")) {
                    parsed.contentType = line
                        .replace("CONTENT_TYPE:", "")
                        .trim()
                        .toLowerCase();
                }
                else if (line.startsWith("PRIORITY:")) {
                    parsed.priority = line.replace("PRIORITY:", "").trim().toLowerCase();
                }
                else if (line.startsWith("AI_USAGE:")) {
                    parsed.aiUsageDirective = line
                        .replace("AI_USAGE:", "")
                        .trim()
                        .toLowerCase();
                }
            }
            console.log("🔍 AI parsed result:", parsed);
            const allowedContentTypes = [
                "page",
                "blog",
                "docs",
                "project",
                "archive",
                "terms",
            ];
            const allowedPriorities = ["high", "medium", "low"];
            const allowedDirectives = [
                "allow",
                "citation-only",
                "no-fine-tuning",
                "disallow",
            ];
            return {
                path,
                summary: parsed.summary || "Summary generation failed",
                contextSnippet: parsed.contextSnippet || "Context snippet generation failed",
                keywords: Array.isArray(parsed.keywords)
                    ? parsed.keywords.slice(0, 10)
                    : [],
                contentType: allowedContentTypes.includes(parsed.contentType)
                    ? parsed.contentType
                    : "page",
                priority: allowedPriorities.includes(parsed.priority)
                    ? parsed.priority
                    : "medium",
                aiUsageDirective: allowedDirectives.includes(parsed.aiUsageDirective)
                    ? parsed.aiUsageDirective
                    : "allow",
                generatedAt: new Date().toISOString(),
                model: XAI_MODEL,
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
                model: XAI_MODEL,
            };
        }
    }
}
exports.XAIService = XAIService;
exports.xaiService = new XAIService();
function cleanupSessionRateLimiter(sessionId) {
    sessionRateLimiters.delete(sessionId);
    console.log(`[X.AI] Cleaned up rate limiter for session: ${sessionId}`);
}
//# sourceMappingURL=ai.service.js.map