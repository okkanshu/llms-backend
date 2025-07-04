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
    }[];
}
export declare class FirecrawlService {
    private apiKey;
    private app;
    constructor();
    extractWebsiteData(url: string): Promise<WebsiteData>;
    private extractUniquePaths;
    convertToPathSelections(paths: string[]): PathSelection[];
    private generatePathDescription;
}
export declare const firecrawlService: FirecrawlService;
export declare const extractWebsiteData: (url: string) => Promise<WebsiteData>;
export {};
//# sourceMappingURL=firecrawl.service.d.ts.map