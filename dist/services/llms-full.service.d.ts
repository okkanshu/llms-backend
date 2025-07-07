import { LLMsFullPayload, LLMsFullGenerationResponse } from "../types";
export declare class LLMsFullService {
    private apiKey;
    private app;
    constructor();
    generateLLMsFull(payload: LLMsFullPayload): Promise<LLMsFullGenerationResponse>;
    private extractAllPages;
    private extractPageData;
    private generateFullContent;
    private generatePageContent;
    generateSitemapOverview(url: string): Promise<string>;
    private groupPagesByDepth;
}
export declare const llmsFullService: LLMsFullService;
//# sourceMappingURL=llms-full.service.d.ts.map