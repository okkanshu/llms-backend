import { PathSelection } from "../types";
interface WebsiteData {
    title: string;
    description: string;
    favicon?: string;
    paths: string[];
    totalPagesCrawled: number;
    totalLinksFound: number;
    uniquePathsFound: number;
    pageMetadatas: {
        path: string;
        title: string;
        description: string;
        keywords?: string;
        bodyContent?: string;
    }[];
}
interface PageMetadata {
    title: string;
    description: string;
    keywords?: string;
    links: string[];
    bodyContent?: string;
}
interface CrawlResult {
    url: string;
    path: string;
    metadata: PageMetadata;
    success: boolean;
    error?: string;
}
export declare class WebCrawlerService {
    private maxPages;
    private timeout;
    private userAgent;
    private rateLimiter;
    extractWebsiteData(url: string, maxDepth?: number, signal?: AbortSignal, maxPagesOverride?: number): Promise<WebsiteData>;
    crawlPage(url: string, baseDomain: string, signal?: AbortSignal): Promise<CrawlResult>;
    private extractMetadata;
    private normalizeUrl;
    private getPathFromUrl;
    private extractUniquePaths;
    private createPageMetadatas;
    private countTotalLinks;
    convertToPathSelections(paths: string[]): PathSelection[];
    private generatePathDescription;
    generateLLMsFull(websiteUrl: string, maxDepth?: number): Promise<{
        content: string;
        totalPages: number;
        totalWords: number;
    }>;
    private extractBodyText;
    scrapePage(url: string): Promise<{
        title: string;
        description: string;
        keywords: string;
        bodySnippet: string;
    }>;
    private scrapeWithCheerio;
    private enforceRateLimit;
}
export declare const webCrawlerService: WebCrawlerService;
export {};
//# sourceMappingURL=web-crawler.service.d.ts.map