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

// 6. LLMs Full Payload
export interface LLMsFullPayload {
  websiteUrl: string;
  includeImages?: boolean;
  includeLinks?: boolean;
  maxDepth?: number;
  aiEnrichment?: boolean;
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

export const LLMsFullPayloadSchema = z.object({
  websiteUrl: z.string().url("Invalid website URL"),
  includeImages: z.boolean().optional(),
  includeLinks: z.boolean().optional(),
  maxDepth: z.number().min(1).max(10).optional(),
  aiEnrichment: z.boolean().optional(),
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
