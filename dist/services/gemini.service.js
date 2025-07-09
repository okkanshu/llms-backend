"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.openRouterService = exports.OpenRouterService = void 0;
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
console.log("🔑 Loaded OPENROUTER_API_KEY:", process.env.OPENROUTER_API_KEY
    ? process.env.OPENROUTER_API_KEY.slice(0, 8) + "..."
    : undefined);
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || "";
const OPENROUTER_MODEL = process.env.OPENROUTER_MODEL || "deepseek/deepseek-r1-0528:free";
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
if (!OPENROUTER_API_KEY) {
    console.warn("⚠️ OPENROUTER_API_KEY not found in environment variables");
}
async function callOpenRouter(messages, temperature = 0.7, maxTokens = 1024) {
    console.log("📡 Sending auth header:", `Bearer ${OPENROUTER_API_KEY ? OPENROUTER_API_KEY.slice(0, 8) + "..." : ""}`);
    const response = await fetch(OPENROUTER_API_URL, {
        method: "POST",
        headers: {
            Authorization: `Bearer ${OPENROUTER_API_KEY}`,
            "Content-Type": "application/json",
        },
        body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages,
            temperature,
            max_tokens: maxTokens,
        }),
    });
    if (response.status === 429) {
        const errorText = await response.text();
        console.error("[OpenRouter] Rate limit hit (429):", errorText);
        throw new Error("RATE_LIMIT_REACHED: " + errorText);
    }
    if (!response.ok) {
        const errorText = await response.text();
        console.error(`[OpenRouter] API error: ${response.status} -`, errorText);
        throw new Error(`OpenRouter API error: ${response.status} - ${errorText}`);
    }
    const data = (await response.json());
    console.log("[OpenRouter] API call successful. Waiting 15 seconds to avoid rate limit...");
    await new Promise((resolve) => setTimeout(resolve, 15000));
    return data.choices?.[0]?.message?.content?.trim() || "";
}
class OpenRouterService {
    async generateAIContent(path, content) {
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
            const result = await callOpenRouter([
                {
                    role: "system",
                    content: "You are a helpful assistant for website content analysis. Always provide responses in the exact format requested.",
                },
                { role: "user", content: prompt },
            ]);
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
                model: OPENROUTER_MODEL,
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
                model: OPENROUTER_MODEL,
            };
        }
    }
    async enrichMetadata(title, description, content) {
        try {
            const aiContent = await this.generateAIContent("", content);
            return {
                title,
                description,
                keywords: aiContent.keywords,
                contentType: aiContent.contentType,
                priority: aiContent.priority,
                aiUsageDirective: aiContent.aiUsageDirective,
                lastModified: new Date().toISOString(),
            };
        }
        catch (error) {
            console.error("Error enriching metadata:", error);
            return {
                title,
                description,
                keywords: [],
                contentType: "page",
                priority: "medium",
                aiUsageDirective: "allow",
                lastModified: new Date().toISOString(),
            };
        }
    }
    async generateHierarchicalStructure(paths) {
        if (!OPENROUTER_API_KEY) {
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
            const result = await callOpenRouter([
                {
                    role: "system",
                    content: "You are a helpful assistant for website content analysis. Always return valid JSON.",
                },
                { role: "user", content: prompt },
            ]);
            const jsonMatch = result.match(/\[[\s\S]*\]/);
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
exports.OpenRouterService = OpenRouterService;
exports.openRouterService = new OpenRouterService();
//# sourceMappingURL=gemini.service.js.map