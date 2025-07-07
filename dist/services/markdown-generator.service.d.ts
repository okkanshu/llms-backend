import { MarkdownGenerationResponse } from "../types";
export declare class MarkdownGeneratorService {
    private apiKey;
    private app;
    constructor();
    generateMarkdownPages(websiteUrl: string): Promise<MarkdownGenerationResponse>;
    private extractKeyPages;
    private getPriorityPaths;
    private shouldIncludePage;
    private extractMarkdownPage;
    private htmlToMarkdown;
    private generateMarkdownFiles;
    private generateSingleMarkdownFile;
    private generateFilename;
    generateMarkdownSitemap(websiteUrl: string): Promise<string>;
    private groupPagesBySection;
}
export declare const markdownGeneratorService: MarkdownGeneratorService;
//# sourceMappingURL=markdown-generator.service.d.ts.map