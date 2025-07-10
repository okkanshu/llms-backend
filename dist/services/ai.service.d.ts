import { AIGeneratedContent } from "../types";
export declare class XAIService {
    generateAIContent(path: string, content: string, signal?: AbortSignal, sessionId?: string): Promise<AIGeneratedContent>;
}
export declare const xaiService: XAIService;
export declare function cleanupSessionRateLimiter(sessionId: string): void;
//# sourceMappingURL=ai.service.d.ts.map