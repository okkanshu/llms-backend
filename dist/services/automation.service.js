"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.automationService = exports.AutomationService = void 0;
const node_cron_1 = __importDefault(require("node-cron"));
const llms_full_service_1 = require("./llms-full.service");
const markdown_generator_service_1 = require("./markdown-generator.service");
const dotenv_1 = __importDefault(require("dotenv"));
dotenv_1.default.config();
class AutomationService {
    constructor() {
        this.jobs = new Map();
        this.configs = new Map();
        this.initializeAutomation();
    }
    initializeAutomation() {
        const automationEnabled = process.env.AUTOMATION_ENABLED === "true";
        if (!automationEnabled) {
            console.log("⚠️ Automation is disabled in environment variables");
            return;
        }
        console.log("🤖 Initializing automation service...");
        this.loadSavedConfigurations();
        this.startAllJobs();
    }
    loadSavedConfigurations() {
        console.log("📋 Loading automation configurations...");
    }
    startAllJobs() {
        this.configs.forEach((config, id) => {
            if (config.enabled) {
                this.startJob(id, config);
            }
        });
    }
    startJob(id, config) {
        try {
            if (!node_cron_1.default.validate(config.schedule)) {
                console.error(`❌ Invalid cron expression for job ${id}: ${config.schedule}`);
                return;
            }
            this.stopJob(id);
            const job = node_cron_1.default.schedule(config.schedule, async () => {
                console.log(`🔄 Running automated generation for ${config.websiteUrl}`);
                await this.runAutomatedGeneration(config);
            }, {
                timezone: "UTC",
            });
            job.start();
            this.jobs.set(id, job);
            console.log(`✅ Started automation job ${id} for ${config.websiteUrl}`);
            console.log(`📅 Schedule: ${config.schedule}`);
        }
        catch (error) {
            console.error(`❌ Failed to start automation job ${id}:`, error);
        }
    }
    stopJob(id) {
        const job = this.jobs.get(id);
        if (job) {
            job.stop();
            this.jobs.delete(id);
            console.log(`⏹️ Stopped automation job ${id}`);
        }
    }
    async runAutomatedGeneration(config) {
        const startTime = Date.now();
        try {
            console.log(`🚀 Starting automated generation for ${config.websiteUrl}`);
            const results = {
                llmsFull: null,
                markdown: null,
                timestamp: new Date().toISOString(),
                duration: 0,
            };
            if (config.generateFull) {
                console.log(`📝 Generating LLMs Full for ${config.websiteUrl}`);
                results.llmsFull = await llms_full_service_1.llmsFullService.generateLLMsFull({
                    websiteUrl: config.websiteUrl,
                    aiEnrichment: true,
                });
            }
            if (config.generateMarkdown) {
                console.log(`📄 Generating Markdown for ${config.websiteUrl}`);
                results.markdown = await markdown_generator_service_1.markdownGeneratorService.generateMarkdownPages(config.websiteUrl);
            }
            results.duration = Date.now() - startTime;
            console.log(`✅ Automated generation completed for ${config.websiteUrl} in ${results.duration}ms`);
            config.lastRun = new Date().toISOString();
            this.configs.set(config.websiteUrl, config);
            if (config.webhookUrl) {
                await this.sendWebhookNotification(config.webhookUrl, results);
            }
            return results;
        }
        catch (error) {
            console.error(`❌ Automated generation failed for ${config.websiteUrl}:`, error);
            if (config.webhookUrl) {
                await this.sendWebhookNotification(config.webhookUrl, {
                    error: error instanceof Error ? error.message : "Unknown error",
                    timestamp: new Date().toISOString(),
                    websiteUrl: config.websiteUrl,
                });
            }
        }
    }
    async sendWebhookNotification(webhookUrl, data) {
        try {
            const response = await fetch(webhookUrl, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                },
                body: JSON.stringify({
                    event: "automation_completed",
                    data,
                    timestamp: new Date().toISOString(),
                }),
            });
            if (!response.ok) {
                console.warn(`⚠️ Webhook notification failed: ${response.status}`);
            }
            else {
                console.log(`📡 Webhook notification sent successfully`);
            }
        }
        catch (error) {
            console.error("❌ Failed to send webhook notification:", error);
        }
    }
    async addAutomation(config) {
        try {
            const id = this.generateJobId(config);
            if (!node_cron_1.default.validate(config.schedule)) {
                throw new Error("Invalid cron expression");
            }
            this.configs.set(id, config);
            if (config.enabled) {
                this.startJob(id, config);
            }
            console.log(`✅ Added automation configuration for ${config.websiteUrl}`);
            return true;
        }
        catch (error) {
            console.error("❌ Failed to add automation configuration:", error);
            return false;
        }
    }
    async updateAutomation(id, config) {
        try {
            this.stopJob(id);
            this.configs.set(id, config);
            if (config.enabled) {
                this.startJob(id, config);
            }
            console.log(`✅ Updated automation configuration ${id}`);
            return true;
        }
        catch (error) {
            console.error(`❌ Failed to update automation configuration ${id}:`, error);
            return false;
        }
    }
    async removeAutomation(id) {
        try {
            this.stopJob(id);
            this.configs.delete(id);
            console.log(`✅ Removed automation configuration ${id}`);
            return true;
        }
        catch (error) {
            console.error(`❌ Failed to remove automation configuration ${id}:`, error);
            return false;
        }
    }
    getAutomationConfigs() {
        return Array.from(this.configs.values());
    }
    getAutomationConfig(id) {
        return this.configs.get(id);
    }
    async runManualAutomation(websiteUrl) {
        const config = Array.from(this.configs.values()).find((c) => c.websiteUrl === websiteUrl);
        if (!config) {
            throw new Error(`No automation configuration found for ${websiteUrl}`);
        }
        return await this.runAutomatedGeneration(config);
    }
    generateJobId(config) {
        return `${config.websiteUrl.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;
    }
    getJobStatus(id) {
        const job = this.jobs.get(id);
        const config = this.configs.get(id);
        if (!job || !config) {
            return { running: false };
        }
        return {
            running: job.getStatus() === "scheduled",
            nextRun: this.getNextRunTime(config.schedule),
        };
    }
    getNextRunTime(cronExpression) {
        try {
            console.log(`📅 Cron expression: ${cronExpression} - Next run time calculation not implemented`);
            return undefined;
        }
        catch (error) {
            console.error("❌ Failed to parse cron expression:", error);
            return undefined;
        }
    }
    stopAllJobs() {
        this.jobs.forEach((job, id) => {
            job.stop();
            console.log(`⏹️ Stopped automation job ${id}`);
        });
        this.jobs.clear();
    }
}
exports.AutomationService = AutomationService;
exports.automationService = new AutomationService();
//# sourceMappingURL=automation.service.js.map