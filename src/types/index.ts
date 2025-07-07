import { z } from "zod";

// 1. LLMBot - Union type for all supported bots
export type LLMBot =
  | "ChatGPT-User"
  | "GPTBot"
  | "GoogleExtended"
  | "Claude"
  | "Anthropic"
  | "CCBot";

// 2. Enhanced PathSelection - Type for UI checkbox options with new features
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

// 3. AI Generated Content
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

// 4. Enhanced Metadata
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

// 5. LLMsTxtPayload - Request body for generating llms.txt
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

// 6. LLMs Full Payload
export interface LLMsFullPayload {
  websiteUrl: string;
  includeImages?: boolean;
  includeLinks?: boolean;
  maxDepth?: number;
  aiEnrichment?: boolean;
}

// 7. Automation Configuration
export interface AutomationConfig {
  enabled: boolean;
  schedule: string; // cron expression
  websiteUrl: string;
  llmBot: LLMBot;
  generateFull: boolean;
  generateMarkdown: boolean;
  webhookUrl?: string;
  lastRun?: string;
  nextRun?: string;
}

// 8. Analytics Data
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

// Additional types for API requests and responses
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

// Zod schemas for validation
export const WebsiteAnalysisRequestSchema = z.object({
  url: z.string().url("Invalid URL format"),
  bots: z
    .array(
      z.enum([
        "ChatGPT-User",
        "GPTBot",
        "GoogleExtended",
        "Claude",
        "Anthropic",
        "CCBot",
      ])
    )
    .min(1, "At least one bot must be selected"),
  aiEnrichment: z.boolean().optional(),
});

export const LLMsTxtPayloadSchema = z.object({
  bot: z.enum([
    "ChatGPT-User",
    "GPTBot",
    "GoogleExtended",
    "Claude",
    "Anthropic",
    "CCBot",
  ]),
  allowPaths: z.array(z.string()),
  disallowPaths: z.array(z.string()),
  websiteUrl: z.string().url("Invalid website URL"),
  generateFull: z.boolean().optional(),
  generateMarkdown: z.boolean().optional(),
  includeSummaries: z.boolean().optional(),
  includeContextSnippets: z.boolean().optional(),
  hierarchicalLayout: z.boolean().optional(),
  aiEnrichment: z.boolean().optional(),
});

export const LLMsFullPayloadSchema = z.object({
  websiteUrl: z.string().url("Invalid website URL"),
  includeImages: z.boolean().optional(),
  includeLinks: z.boolean().optional(),
  maxDepth: z.number().min(1).max(10).optional(),
  aiEnrichment: z.boolean().optional(),
});

export const PathSelectionSchema = z.object({
  path: z.string(),
  allow: z.boolean(),
  description: z.string().optional(),
  priority: z.enum(["high", "medium", "low"]).optional(),
  tags: z.array(z.string()).optional(),
  contentType: z
    .enum(["page", "blog", "docs", "project", "archive", "terms"])
    .optional(),
  lastModified: z.string().optional(),
  summary: z.string().optional(),
  contextSnippet: z.string().optional(),
  aiUsageDirective: z
    .enum(["allow", "citation-only", "no-fine-tuning", "disallow"])
    .optional(),
});

export const AutomationConfigSchema = z.object({
  enabled: z.boolean(),
  schedule: z.string(),
  websiteUrl: z.string().url("Invalid website URL"),
  llmBot: z.enum([
    "ChatGPT-User",
    "GPTBot",
    "GoogleExtended",
    "Claude",
    "Anthropic",
    "CCBot",
  ]),
  generateFull: z.boolean(),
  generateMarkdown: z.boolean(),
  webhookUrl: z.string().url("Invalid webhook URL").optional(),
});

// Type for LLM bot configurations
export interface LLMBotConfig {
  name: LLMBot;
  userAgent: string;
  description: string;
}

// Available LLM bot configurations
export const LLM_BOT_CONFIGS: Record<LLMBot, LLMBotConfig> = {
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
