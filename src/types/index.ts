import { z } from "zod";

// 1. LLMBot - Union type for all supported bots
export type LLMBot =
  | "ChatGPT-User"
  | "GPTBot"
  | "GoogleExtended"
  | "Claude"
  | "Anthropic"
  | "CCBot";

// 2. PathSelection - Type for UI checkbox options
export interface PathSelection {
  path: string;
  allow: boolean;
  description?: string;
}

// 3. LLMsTxtPayload - Request body for generating llms.txt
export interface LLMsTxtPayload {
  bot: LLMBot;
  allowPaths: string[];
  disallowPaths: string[];
  websiteUrl: string;
}

// Additional types for API requests and responses
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

// Zod schemas for validation
export const WebsiteAnalysisRequestSchema = z.object({
  url: z.string().url("Invalid URL format"),
  llmBot: z.enum([
    "ChatGPT-User",
    "GPTBot",
    "GoogleExtended",
    "Claude",
    "Anthropic",
    "CCBot",
  ]),
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
});

export const PathSelectionSchema = z.object({
  path: z.string(),
  allow: z.boolean(),
  description: z.string().optional(),
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
