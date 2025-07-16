import { LLMsFullPayload, LLMsFullGenerationResponse } from "../types";
export declare class LLMsFullService {
    private rateLimiter;
    generateLLMsFull(payload: LLMsFullPayload): Promise<LLMsFullGenerationResponse>;
    private extractAllPages;
    private extractPageData;
    private generateFullContent;
    private generatePageContent;
    generateSitemapOverview(url: string): Promise<string>;
    private enforceRateLimit;
    private groupPagesByDepth;
}
export declare function estimateCrawlTime(numPages: number): number;
export declare const llmsFullService: LLMsFullService;
//# sourceMappingURL=llms-full.service.d.ts.map