import { MarkdownGenerationResponse } from "../types";
export declare class MarkdownGeneratorService {
    private rateLimiter;
    generateMarkdownPages(websiteUrl: string, signal?: AbortSignal): Promise<MarkdownGenerationResponse>;
    private extractKeyPages;
    private getPriorityPaths;
    private shouldIncludePage;
    private extractPageContent;
    private htmlToMarkdown;
    private generateMarkdownFiles;
    private generateSingleMarkdownFile;
    private generateFilename;
    generateMarkdownSitemap(websiteUrl: string): Promise<string>;
    private enforceRateLimit;
    private groupPagesBySection;
}
export declare const markdownGeneratorService: MarkdownGeneratorService;
//# sourceMappingURL=markdown-generator.service.d.ts.map