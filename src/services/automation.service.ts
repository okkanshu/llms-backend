import cron from "node-cron";
import { ScheduledTask } from "node-cron";
import { AutomationConfig } from "../types";
import { llmsFullService } from "./llms-full.service";
import { markdownGeneratorService } from "./markdown-generator.service";
import dotenv from "dotenv";

dotenv.config();

export class AutomationService {
  private jobs: Map<string, ScheduledTask> = new Map();
  private configs: Map<string, AutomationConfig> = new Map();

  constructor() {
    this.initializeAutomation();
  }

  /**
   * Initialize automation system
   */
  private initializeAutomation() {
    const automationEnabled = process.env.AUTOMATION_ENABLED === "true";

    if (!automationEnabled) {
      console.log("⚠️ Automation is disabled in environment variables");
      return;
    }

    console.log("🤖 Initializing automation service...");

    // Load saved configurations (in a real app, this would come from a database)
    this.loadSavedConfigurations();

    // Start all enabled jobs
    this.startAllJobs();
  }

  /**
   * Load saved automation configurations
   */
  private loadSavedConfigurations() {
    // In a real implementation, this would load from a database
    // For now, we'll use environment variables or an empty state
    console.log("📋 Loading automation configurations...");
  }

  /**
   * Start all enabled automation jobs
   */
  private startAllJobs() {
    this.configs.forEach((config, id) => {
      if (config.enabled) {
        this.startJob(id, config);
      }
    });
  }

  /**
   * Start a specific automation job
   */
  private startJob(id: string, config: AutomationConfig) {
    try {
      // Validate cron expression
      if (!cron.validate(config.schedule)) {
        console.error(
          `❌ Invalid cron expression for job ${id}: ${config.schedule}`
        );
        return;
      }

      // Stop existing job if it exists
      this.stopJob(id);

      // Create new job
      const job = cron.schedule(
        config.schedule,
        async () => {
          console.log(
            `🔄 Running automated generation for ${config.websiteUrl}`
          );
          await this.runAutomatedGeneration(config);
        },
        {
          timezone: "UTC",
        }
      );

      // Start the job
      job.start();
      this.jobs.set(id, job);

      console.log(`✅ Started automation job ${id} for ${config.websiteUrl}`);
      console.log(`📅 Schedule: ${config.schedule}`);
    } catch (error) {
      console.error(`❌ Failed to start automation job ${id}:`, error);
    }
  }

  /**
   * Stop a specific automation job
   */
  private stopJob(id: string) {
    const job = this.jobs.get(id);
    if (job) {
      job.stop();
      this.jobs.delete(id);
      console.log(`⏹️ Stopped automation job ${id}`);
    }
  }

  /**
   * Run automated generation for a configuration
   */
  private async runAutomatedGeneration(config: AutomationConfig) {
    const startTime = Date.now();

    try {
      console.log(`🚀 Starting automated generation for ${config.websiteUrl}`);

      const results: {
        llmsFull: any;
        markdown: any;
        timestamp: string;
        duration: number;
      } = {
        llmsFull: null,
        markdown: null,
        timestamp: new Date().toISOString(),
        duration: 0,
      };

      // Generate LLMs Full if enabled
      if (config.generateFull) {
        console.log(`📝 Generating LLMs Full for ${config.websiteUrl}`);
        results.llmsFull = await llmsFullService.generateLLMsFull({
          websiteUrl: config.websiteUrl,
          aiEnrichment: true,
        });
      }

      // Generate Markdown if enabled
      if (config.generateMarkdown) {
        console.log(`📄 Generating Markdown for ${config.websiteUrl}`);
        results.markdown = await markdownGeneratorService.generateMarkdownPages(
          config.websiteUrl
        );
      }

      results.duration = Date.now() - startTime;

      console.log(
        `✅ Automated generation completed for ${config.websiteUrl} in ${results.duration}ms`
      );

      // Update last run time
      config.lastRun = new Date().toISOString();
      this.configs.set(config.websiteUrl, config);

      // Send webhook notification if configured
      if (config.webhookUrl) {
        await this.sendWebhookNotification(config.webhookUrl, results);
      }

      return results;
    } catch (error) {
      console.error(
        `❌ Automated generation failed for ${config.websiteUrl}:`,
        error
      );

      // Send error webhook if configured
      if (config.webhookUrl) {
        await this.sendWebhookNotification(config.webhookUrl, {
          error: error instanceof Error ? error.message : "Unknown error",
          timestamp: new Date().toISOString(),
          websiteUrl: config.websiteUrl,
        });
      }
    }
  }

  /**
   * Send webhook notification
   */
  private async sendWebhookNotification(webhookUrl: string, data: any) {
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
      } else {
        console.log(`📡 Webhook notification sent successfully`);
      }
    } catch (error) {
      console.error("❌ Failed to send webhook notification:", error);
    }
  }

  /**
   * Add a new automation configuration
   */
  async addAutomation(config: AutomationConfig): Promise<boolean> {
    try {
      const id = this.generateJobId(config);

      // Validate configuration
      if (!cron.validate(config.schedule)) {
        throw new Error("Invalid cron expression");
      }

      // Store configuration
      this.configs.set(id, config);

      // Start job if enabled
      if (config.enabled) {
        this.startJob(id, config);
      }

      console.log(`✅ Added automation configuration for ${config.websiteUrl}`);
      return true;
    } catch (error) {
      console.error("❌ Failed to add automation configuration:", error);
      return false;
    }
  }

  /**
   * Update an existing automation configuration
   */
  async updateAutomation(
    id: string,
    config: AutomationConfig
  ): Promise<boolean> {
    try {
      // Stop existing job
      this.stopJob(id);

      // Update configuration
      this.configs.set(id, config);

      // Start new job if enabled
      if (config.enabled) {
        this.startJob(id, config);
      }

      console.log(`✅ Updated automation configuration ${id}`);
      return true;
    } catch (error) {
      console.error(
        `❌ Failed to update automation configuration ${id}:`,
        error
      );
      return false;
    }
  }

  /**
   * Remove an automation configuration
   */
  async removeAutomation(id: string): Promise<boolean> {
    try {
      // Stop job
      this.stopJob(id);

      // Remove configuration
      this.configs.delete(id);

      console.log(`✅ Removed automation configuration ${id}`);
      return true;
    } catch (error) {
      console.error(
        `❌ Failed to remove automation configuration ${id}:`,
        error
      );
      return false;
    }
  }

  /**
   * Get all automation configurations
   */
  getAutomationConfigs(): AutomationConfig[] {
    return Array.from(this.configs.values());
  }

  /**
   * Get a specific automation configuration
   */
  getAutomationConfig(id: string): AutomationConfig | undefined {
    return this.configs.get(id);
  }

  /**
   * Run automation manually for testing
   */
  async runManualAutomation(websiteUrl: string): Promise<any> {
    const config = Array.from(this.configs.values()).find(
      (c) => c.websiteUrl === websiteUrl
    );

    if (!config) {
      throw new Error(`No automation configuration found for ${websiteUrl}`);
    }

    return await this.runAutomatedGeneration(config);
  }

  /**
   * Generate a unique job ID
   */
  private generateJobId(config: AutomationConfig): string {
    return `${config.websiteUrl.replace(/[^a-zA-Z0-9]/g, "_")}_${Date.now()}`;
  }

  /**
   * Get job status
   */
  getJobStatus(id: string): { running: boolean; nextRun?: Date } {
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

  /**
   * Calculate next run time for a cron expression
   */
  private getNextRunTime(cronExpression: string): Date | undefined {
    try {
      // For now, return undefined as node-cron doesn't provide a direct way to get next run time
      // In a production environment, you might want to use a library like 'cron-parser' for this
      console.log(
        `📅 Cron expression: ${cronExpression} - Next run time calculation not implemented`
      );
      return undefined;
    } catch (error) {
      console.error("❌ Failed to parse cron expression:", error);
      return undefined;
    }
  }

  /**
   * Stop all automation jobs
   */
  stopAllJobs() {
    this.jobs.forEach((job, id) => {
      job.stop();
      console.log(`⏹️ Stopped automation job ${id}`);
    });
    this.jobs.clear();
  }
}

export const automationService = new AutomationService();
