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
export interface EnhancedMetadata {
    title: string;
    description: string;
    keywords?: string[];
    language?: string;
    contentType?: string;
    lastModified?: string;
    priority?: "high" | "medium" | "low";
    aiUsageDirective?: "allow" | "citation-only" | "no-fine-tuning" | "disallow";
}
export interface LLMsTxtPayload {
    bot: LLMBot;
    allowPaths: string[];
    disallowPaths: string[];
    websiteUrl: string;
    generateFull?: boolean;
    generateMarkdown?: boolean;
    includeSummaries?: boolean;
    includeContextSnippets?: boolean;
    hierarchicalLayout?: boolean;
    aiEnrichment?: boolean;
}
export interface LLMsFullPayload {
    websiteUrl: string;
    includeImages?: boolean;
    includeLinks?: boolean;
    maxDepth?: number;
    aiEnrichment?: boolean;
}
export interface AutomationConfig {
    enabled: boolean;
    schedule: string;
    websiteUrl: string;
    llmBot: LLMBot;
    generateFull: boolean;
    generateMarkdown: boolean;
    webhookUrl?: string;
    lastRun?: string;
    nextRun?: string;
}
export interface AnalyticsData {
    websiteUrl: string;
    accessCount: number;
    lastAccessed: string;
    userAgents: string[];
    mostAccessedPaths: Array<{
        path: string;
        count: number;
    }>;
    generationCount: number;
    lastGenerated: string;
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
export interface LLMsTxtGenerationResponse {
    success: boolean;
    content: string;
    filename: string;
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
export interface AnalyticsResponse {
    success: boolean;
    data: AnalyticsData;
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
export declare const LLMsTxtPayloadSchema: z.ZodObject<{
    bot: z.ZodEnum<["ChatGPT-User", "GPTBot", "GoogleExtended", "Claude", "Anthropic", "CCBot"]>;
    allowPaths: z.ZodArray<z.ZodString, "many">;
    disallowPaths: z.ZodArray<z.ZodString, "many">;
    websiteUrl: z.ZodString;
    generateFull: z.ZodOptional<z.ZodBoolean>;
    generateMarkdown: z.ZodOptional<z.ZodBoolean>;
    includeSummaries: z.ZodOptional<z.ZodBoolean>;
    includeContextSnippets: z.ZodOptional<z.ZodBoolean>;
    hierarchicalLayout: z.ZodOptional<z.ZodBoolean>;
    aiEnrichment: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    bot: "ChatGPT-User" | "GPTBot" | "GoogleExtended" | "Claude" | "Anthropic" | "CCBot";
    allowPaths: string[];
    disallowPaths: string[];
    websiteUrl: string;
    aiEnrichment?: boolean | undefined;
    generateFull?: boolean | undefined;
    generateMarkdown?: boolean | undefined;
    includeSummaries?: boolean | undefined;
    includeContextSnippets?: boolean | undefined;
    hierarchicalLayout?: boolean | undefined;
}, {
    bot: "ChatGPT-User" | "GPTBot" | "GoogleExtended" | "Claude" | "Anthropic" | "CCBot";
    allowPaths: string[];
    disallowPaths: string[];
    websiteUrl: string;
    aiEnrichment?: boolean | undefined;
    generateFull?: boolean | undefined;
    generateMarkdown?: boolean | undefined;
    includeSummaries?: boolean | undefined;
    includeContextSnippets?: boolean | undefined;
    hierarchicalLayout?: boolean | undefined;
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
export declare const PathSelectionSchema: z.ZodObject<{
    path: z.ZodString;
    allow: z.ZodBoolean;
    description: z.ZodOptional<z.ZodString>;
    priority: z.ZodOptional<z.ZodEnum<["high", "medium", "low"]>>;
    tags: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    contentType: z.ZodOptional<z.ZodEnum<["page", "blog", "docs", "project", "archive", "terms"]>>;
    lastModified: z.ZodOptional<z.ZodString>;
    summary: z.ZodOptional<z.ZodString>;
    contextSnippet: z.ZodOptional<z.ZodString>;
    aiUsageDirective: z.ZodOptional<z.ZodEnum<["allow", "citation-only", "no-fine-tuning", "disallow"]>>;
}, "strip", z.ZodTypeAny, {
    allow: boolean;
    path: string;
    description?: string | undefined;
    priority?: "high" | "medium" | "low" | undefined;
    tags?: string[] | undefined;
    contentType?: "page" | "blog" | "docs" | "project" | "archive" | "terms" | undefined;
    lastModified?: string | undefined;
    summary?: string | undefined;
    contextSnippet?: string | undefined;
    aiUsageDirective?: "allow" | "citation-only" | "no-fine-tuning" | "disallow" | undefined;
}, {
    allow: boolean;
    path: string;
    description?: string | undefined;
    priority?: "high" | "medium" | "low" | undefined;
    tags?: string[] | undefined;
    contentType?: "page" | "blog" | "docs" | "project" | "archive" | "terms" | undefined;
    lastModified?: string | undefined;
    summary?: string | undefined;
    contextSnippet?: string | undefined;
    aiUsageDirective?: "allow" | "citation-only" | "no-fine-tuning" | "disallow" | undefined;
}>;
export declare const AutomationConfigSchema: z.ZodObject<{
    enabled: z.ZodBoolean;
    schedule: z.ZodString;
    websiteUrl: z.ZodString;
    llmBot: z.ZodEnum<["ChatGPT-User", "GPTBot", "GoogleExtended", "Claude", "Anthropic", "CCBot"]>;
    generateFull: z.ZodBoolean;
    generateMarkdown: z.ZodBoolean;
    webhookUrl: z.ZodOptional<z.ZodString>;
}, "strip", z.ZodTypeAny, {
    websiteUrl: string;
    generateFull: boolean;
    generateMarkdown: boolean;
    enabled: boolean;
    schedule: string;
    llmBot: "ChatGPT-User" | "GPTBot" | "GoogleExtended" | "Claude" | "Anthropic" | "CCBot";
    webhookUrl?: string | undefined;
}, {
    websiteUrl: string;
    generateFull: boolean;
    generateMarkdown: boolean;
    enabled: boolean;
    schedule: string;
    llmBot: "ChatGPT-User" | "GPTBot" | "GoogleExtended" | "Claude" | "Anthropic" | "CCBot";
    webhookUrl?: string | undefined;
}>;
export interface LLMBotConfig {
    name: LLMBot;
    userAgent: string;
    description: string;
}
export declare const LLM_BOT_CONFIGS: Record<LLMBot, LLMBotConfig>;
//# sourceMappingURL=index.d.ts.map