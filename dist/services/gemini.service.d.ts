import { AIGeneratedContent, EnhancedMetadata } from "../types";
export declare class OpenRouterService {
    generateAIContent(path: string, content: string): Promise<AIGeneratedContent>;
    enrichMetadata(title: string, description: string, content: string): Promise<EnhancedMetadata>;
    generateHierarchicalStructure(paths: string[]): Promise<Array<{
        group: string;
        paths: string[];
        description: string;
    }>>;
}
export declare const openRouterService: OpenRouterService;
//# sourceMappingURL=gemini.service.d.ts.map