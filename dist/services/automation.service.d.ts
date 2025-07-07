import { AutomationConfig } from "../types";
export declare class AutomationService {
    private jobs;
    private configs;
    constructor();
    private initializeAutomation;
    private loadSavedConfigurations;
    private startAllJobs;
    private startJob;
    private stopJob;
    private runAutomatedGeneration;
    private sendWebhookNotification;
    addAutomation(config: AutomationConfig): Promise<boolean>;
    updateAutomation(id: string, config: AutomationConfig): Promise<boolean>;
    removeAutomation(id: string): Promise<boolean>;
    getAutomationConfigs(): AutomationConfig[];
    getAutomationConfig(id: string): AutomationConfig | undefined;
    runManualAutomation(websiteUrl: string): Promise<any>;
    private generateJobId;
    getJobStatus(id: string): {
        running: boolean;
        nextRun?: Date;
    };
    private getNextRunTime;
    stopAllJobs(): void;
}
export declare const automationService: AutomationService;
//# sourceMappingURL=automation.service.d.ts.map