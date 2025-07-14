import { LLMsFullPayload, LLMsFullGenerationResponse } from "../types";
export declare class LLMsFullService {
    private rateLimiter;
    private playwrightRateLimiter;
    private browser;
    private page;
    private userAgent;
    generateLLMsFull(payload: LLMsFullPayload): Promise<LLMsFullGenerationResponse>;
    private extractAllPages;
    private extractPageData;
    private generateFullContent;
    private generatePageContent;
    generateSitemapOverview(url: string): Promise<string>;
    private enforceRateLimit;
    private enforcePlaywrightRateLimit;
    private getPlaywrightBrowser;
    private getPlaywrightPage;
    private scrapeWithPlaywright;
    scrapePage(url: string): Promise<{
        title: string;
        description: string;
        keywords: string;
        bodySnippet: string;
    }>;
    private isContentSufficient;
    cleanup(): Promise<void>;
    private groupPagesByDepth;
}
export declare const llmsFullService: LLMsFullService;
//# sourceMappingURL=llms-full.service.d.ts.map