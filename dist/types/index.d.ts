import { z } from "zod";
export type LLMBot = "ChatGPT-User" | "GPTBot" | "GoogleExtended" | "Claude" | "Anthropic" | "CCBot";
export interface PathSelection {
    path: string;
    allow: boolean;
    description?: string;
    priority?: "high" | "medium" | "low";
    tags?: string[];
    contentType?: "page" | "blog" | "docs" | "project" | "archive" | "terms";
    lastModified?: string;
    summary?: string;
    contextSnippet?: string;
    aiUsageDirective?: "allow" | "citation-only" | "no-fine-tuning" | "disallow";
}
export interface AIGeneratedContent {
    path: string;
    summary?: string;
    contextSnippet?: string;
    keywords?: string[];
    contentType?: string;
    priority?: "high" | "medium" | "low";
    aiUsageDirective?: "allow" | "citation-only" | "no-fine-tuning" | "disallow";
    generatedAt: string;
    model: string;
}
export interface LLMsFullPayload {
    websiteUrl: string;
    includeImages?: boolean;
    includeLinks?: boolean;
    maxDepth?: number;
    aiEnrichment?: boolean;
}
export interface WebsiteAnalysisRequest {
    url: string;
    bots: LLMBot[];
    aiEnrichment?: boolean;
}
export interface WebsiteAnalysisResponse {
    metadata: {
        title: string;
        description: string;
        url: string;
        totalPagesCrawled?: number;
        totalLinksFound?: number;
        uniquePathsFound?: number;
    };
    paths: PathSelection[];
    pageMetadatas?: Array<{
        path: string;
        title: string;
        description: string;
        keywords?: string;
        bodyContent?: string;
    }>;
    aiGeneratedContent?: AIGeneratedContent[];
    perPathMetadata?: Array<{
        path: string;
        title?: string;
        description?: string;
        keywords?: string;
    }>;
    success: boolean;
    error?: string;
}
export interface LLMsFullGenerationResponse {
    success: boolean;
    content: string;
    filename: string;
    totalPages: number;
    totalWords: number;
    error?: string;
}
export interface MarkdownGenerationResponse {
    success: boolean;
    files: Array<{
        path: string;
        content: string;
        filename: string;
    }>;
    error?: string;
}
export declare const WebsiteAnalysisRequestSchema: z.ZodObject<{
    url: z.ZodString;
    bots: z.ZodArray<z.ZodEnum<["ChatGPT-User", "GPTBot", "GoogleExtended", "Claude", "Anthropic", "CCBot"]>, "many">;
    aiEnrichment: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    url: string;
    bots: ("ChatGPT-User" | "GPTBot" | "GoogleExtended" | "Claude" | "Anthropic" | "CCBot")[];
    aiEnrichment?: boolean | undefined;
}, {
    url: string;
    bots: ("ChatGPT-User" | "GPTBot" | "GoogleExtended" | "Claude" | "Anthropic" | "CCBot")[];
    aiEnrichment?: boolean | undefined;
}>;
export declare const LLMsFullPayloadSchema: z.ZodObject<{
    websiteUrl: z.ZodString;
    includeImages: z.ZodOptional<z.ZodBoolean>;
    includeLinks: z.ZodOptional<z.ZodBoolean>;
    maxDepth: z.ZodOptional<z.ZodNumber>;
    aiEnrichment: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    websiteUrl: string;
    aiEnrichment?: boolean | undefined;
    includeImages?: boolean | undefined;
    includeLinks?: boolean | undefined;
    maxDepth?: number | undefined;
}, {
    websiteUrl: string;
    aiEnrichment?: boolean | undefined;
    includeImages?: boolean | undefined;
    includeLinks?: boolean | undefined;
    maxDepth?: number | undefined;
}>;
export interface LLMBotConfig {
    name: LLMBot;
    userAgent: string;
    description: string;
}
export declare const LLM_BOT_CONFIGS: Record<LLMBot, LLMBotConfig>;
//# sourceMappingURL=index.d.ts.map