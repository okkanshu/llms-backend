import { z } from "zod";
export type LLMBot = "ChatGPT-User" | "GPTBot" | "GoogleExtended" | "Claude" | "Anthropic" | "CCBot";
export interface PathSelection {
    path: string;
    allow: boolean;
    description?: string;
}
export interface LLMsTxtPayload {
    bot: LLMBot;
    allowPaths: string[];
    disallowPaths: string[];
    websiteUrl: string;
}
export interface WebsiteAnalysisRequest {
    url: string;
    llmBot: LLMBot;
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
    }>;
    success: boolean;
    error?: string;
}
export interface LLMsTxtGenerationResponse {
    success: boolean;
    content: string;
    filename: string;
    error?: string;
}
export declare const WebsiteAnalysisRequestSchema: z.ZodObject<{
    url: z.ZodString;
    llmBot: z.ZodEnum<["ChatGPT-User", "GPTBot", "GoogleExtended", "Claude", "Anthropic", "CCBot"]>;
}, "strip", z.ZodTypeAny, {
    url: string;
    llmBot: "ChatGPT-User" | "GPTBot" | "GoogleExtended" | "Claude" | "Anthropic" | "CCBot";
}, {
    url: string;
    llmBot: "ChatGPT-User" | "GPTBot" | "GoogleExtended" | "Claude" | "Anthropic" | "CCBot";
}>;
export declare const LLMsTxtPayloadSchema: z.ZodObject<{
    bot: z.ZodEnum<["ChatGPT-User", "GPTBot", "GoogleExtended", "Claude", "Anthropic", "CCBot"]>;
    allowPaths: z.ZodArray<z.ZodString, "many">;
    disallowPaths: z.ZodArray<z.ZodString, "many">;
    websiteUrl: z.ZodString;
}, "strip", z.ZodTypeAny, {
    bot: "ChatGPT-User" | "GPTBot" | "GoogleExtended" | "Claude" | "Anthropic" | "CCBot";
    allowPaths: string[];
    disallowPaths: string[];
    websiteUrl: string;
}, {
    bot: "ChatGPT-User" | "GPTBot" | "GoogleExtended" | "Claude" | "Anthropic" | "CCBot";
    allowPaths: string[];
    disallowPaths: string[];
    websiteUrl: string;
}>;
export declare const PathSelectionSchema: z.ZodObject<{
    path: z.ZodString;
    allow: z.ZodBoolean;
    description: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    path: string;
    allow: boolean;
    description?: string | undefined;
}, {
    path: string;
    allow: boolean;
    description?: string | undefined;
}>;
export interface LLMBotConfig {
    name: LLMBot;
    userAgent: string;
    description: string;
}
export declare const LLM_BOT_CONFIGS: Record<LLMBot, LLMBotConfig>;
//# sourceMappingURL=index.d.ts.map