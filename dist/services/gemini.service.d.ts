import { AIGeneratedContent, EnhancedMetadata } from "../types";
export declare class GeminiService {
    private genAI;
    private model;
    private apiKey;
    private lastRequestTime;
    private minRequestInterval;
    constructor();
    private waitForRateLimit;
    private retryWithBackoff;
    generatePathSummary(path: string, content: string): Promise<string>;
    generateContextSnippet(path: string, content: string): Promise<string>;
    extractKeywords(content: string): Promise<string[]>;
    determineContentType(path: string, content: string): Promise<string>;
    determinePriority(path: string, content: string): Promise<"high" | "medium" | "low">;
    suggestAIUsageDirective(path: string, content: string): Promise<"allow" | "citation-only" | "no-fine-tuning" | "disallow">;
    generateAIContent(path: string, content: string): Promise<AIGeneratedContent>;
    enrichMetadata(title: string, description: string, content: string): Promise<EnhancedMetadata>;
    generateHierarchicalStructure(paths: string[]): Promise<Array<{
        group: string;
        paths: string[];
        description: string;
    }>>;
}
export declare const geminiService: GeminiService;
//# sourceMappingURL=gemini.service.d.ts.map