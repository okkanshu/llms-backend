import FirecrawlApp from "@mendable/firecrawl-js";
import { z } from "zod";
import { WebsiteAnalysisResponse, PathSelection } from "../types";
import dotenv from "dotenv";
dotenv.config();

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

// Define schema for extracting website data from each page
const websiteDataSchema = z.object({
  title: z.string(),
  description: z.string(),
  keywords: z.string().optional(),
  links: z.array(z.string()),
});

// Type for Firecrawl crawl response
interface FirecrawlCrawlResponse {
  success: boolean;
  status?: string;
  data?: any[];
  error?: string;
}

// Type for Firecrawl extract response
interface FirecrawlExtractResponse {
  success: boolean;
  data?: {
    title: string;
    description: string;
    keywords?: string;
    links: string[];
  };
  error?: string;
}

export class FirecrawlService {
  private apiKey: string;
  private app: FirecrawlApp;

  constructor() {
    this.apiKey = "fc-55931a898b814c2084cf786e41b60260";
    this.app = new FirecrawlApp({
      apiKey: this.apiKey,
    });
  }

  /**
   * Extract website data including metadata and paths from multiple pages
   */
  async extractWebsiteData(url: string): Promise<WebsiteData> {
    if (!this.apiKey) {
      console.error("❌ Missing Firecrawl API key");
      throw new Error("FIRECRAWL_API_KEY is required in environment variables");
    }

    try {
      console.log(`🔍 Starting comprehensive extraction for URL: ${url}`);
      console.log(`🔑 Using API key: ${this.apiKey.substring(0, 10)}...`);

      // Create temporary arrays for tracking
      const tempAllLinks: string[] = [];
      const tempPageData: Array<{
        url: string;
        title: string;
        description: string;
        keywords?: string;
        links: string[];
      }> = [];
      const tempDuplicateTracker = new Set<string>();

      // First, crawl the website to discover all pages
      console.log("🕷️ Starting website crawl to discover pages...");
      const crawlResult = (await this.app.crawlUrl(url, {
        limit: 70, // Increase limit to discover more pages
        scrapeOptions: {
          formats: ["markdown", "html"],
        },
      })) as FirecrawlCrawlResponse;

      console.log("📊 Crawl completed:", {
        success: crawlResult.success,
        status: crawlResult.status,
      });

      if (!crawlResult.success) {
        console.error("❌ Crawl failed:", crawlResult.error);
        throw new Error(`Crawl failed: ${crawlResult.error}`);
      }

      // Check if crawlResult has data property (successful crawl)
      if (!crawlResult.data || !Array.isArray(crawlResult.data)) {
        console.error("❌ No crawl data available");
        throw new Error("No crawl data available");
      }

      console.log("📊 Crawl data available:", {
        totalPages: crawlResult.data.length,
        status: crawlResult.status,
      });

      // Extract data from each discovered page
      console.log("🔍 Extracting data from discovered pages...");
      let mainPageData: any = null;

      for (const page of crawlResult.data) {
        const pageUrl = page.metadata?.sourceURL || page.metadata?.url;
        if (!pageUrl) continue;

        console.log(`📄 Processing page: ${pageUrl}`);

        // Extract structured data from each page
        try {
          const extractResult = (await this.app.extract([pageUrl], {
            prompt:
              "Extract the title, description, keywords, and all internal links from this page. Return as JSON with fields: title, description, keywords, links (array of internal URLs).",
            schema: websiteDataSchema,
          })) as FirecrawlExtractResponse;

          if (extractResult.success && extractResult.data) {
            const extractedData = extractResult.data;

            // Store page data in temporary array
            tempPageData.push({
              url: pageUrl,
              title: extractedData.title,
              description: extractedData.description,
              keywords: extractedData.keywords,
              links: extractedData.links || [],
            });

            // Store main page data (first page or homepage)
            if (!mainPageData && (pageUrl === url || pageUrl.endsWith("/"))) {
              mainPageData = extractedData;
            }

            // Collect all links from this page and track duplicates
            if (extractedData.links && Array.isArray(extractedData.links)) {
              extractedData.links.forEach((link) => {
                tempAllLinks.push(link);
                tempDuplicateTracker.add(link);
              });
            }

            console.log(`✅ Extracted from ${pageUrl}:`, {
              title: extractedData.title,
              linksCount: extractedData.links?.length || 0,
              uniqueLinksInPage: new Set(extractedData.links || []).size,
            });
          }
        } catch (extractError) {
          console.warn(`⚠️ Failed to extract from ${pageUrl}:`, extractError);
        }
      }

      // Also extract from the main URL directly for better coverage
      console.log("🎯 Extracting from main URL for comprehensive data...");
      const mainExtractResult = (await this.app.extract([url], {
        prompt:
          "Extract the title, description, keywords, and all internal links from this page. Return as JSON with fields: title, description, keywords, links (array of internal URLs).",
        schema: websiteDataSchema,
      })) as FirecrawlExtractResponse;

      if (mainExtractResult.success && mainExtractResult.data) {
        const mainData = mainExtractResult.data;

        // Use main page data if we don't have it yet
        if (!mainPageData) {
          mainPageData = mainData;
        }

        // Add main page links to our collection
        if (mainData.links && Array.isArray(mainData.links)) {
          mainData.links.forEach((link) => {
            tempAllLinks.push(link);
            tempDuplicateTracker.add(link);
          });
        }

        console.log("📋 Main page extracted data:", {
          title: mainData.title,
          description: mainData.description?.substring(0, 200) + "...",
          linksCount: mainData.links?.length || 0,
        });
      }

      // Remove duplicates and filter links
      const uniqueLinks = [...new Set(tempAllLinks)];
      console.log(
        `🔗 Found ${uniqueLinks.length} unique links across all pages (${
          tempAllLinks.length
        } total, ${
          tempAllLinks.length - uniqueLinks.length
        } duplicates removed)`
      );

      // Extract unique paths and filter out external URLs
      const uniquePaths = this.extractUniquePaths(uniqueLinks, url);
      console.log(`✅ Filtered to ${uniquePaths.length} unique internal paths`);

      // Map each unique path to its best-matching page metadata
      const pageMetadatas = uniquePaths.map((path) => {
        // Find the first page whose links include this path, or fallback to homepage
        const match =
          tempPageData.find((p) => p.links.includes(path)) || tempPageData[0];
        return {
          path,
          title: match?.title || "",
          description: match?.description || "",
          keywords: match?.keywords || "",
        };
      });

      // Create website data object with enhanced metadata
      const websiteData: WebsiteData = {
        title: mainPageData?.title || "Untitled",
        description: mainPageData?.description || "No description available",
        paths: uniquePaths,
        totalPagesCrawled: crawlResult.data.length,
        totalLinksFound: tempAllLinks.length,
        uniquePathsFound: uniquePaths.length,
        pageMetadatas,
      };

      console.log(
        `✅ Successfully extracted comprehensive website data from ${url}:`,
        {
          title: websiteData.title,
          descriptionLength: websiteData.description.length,
          pathsCount: websiteData.paths.length,
          pagesCrawled: websiteData.totalPagesCrawled,
          totalLinksFound: websiteData.totalLinksFound,
          uniquePathsFound: websiteData.uniquePathsFound,
          duplicateLinksRemoved:
            websiteData.totalLinksFound - uniqueLinks.length,
        }
      );

      return websiteData;
    } catch (error) {
      console.error("❌ Firecrawl extraction failed with error:", {
        message: error instanceof Error ? error.message : "Unknown error",
        stack: error instanceof Error ? error.stack : undefined,
        url: url,
        apiKey: this.apiKey ? "Present" : "Missing",
      });

      // Log additional details for different error types
      if (error instanceof Error) {
        if (error.message.includes("API key")) {
          console.error(
            "🔑 API Key Error - Check if the API key is valid and has proper permissions"
          );
        } else if (error.message.includes("rate limit")) {
          console.error(
            "⏱️ Rate Limit Error - Consider implementing retry logic with exponential backoff"
          );
        } else if (error.message.includes("timeout")) {
          console.error(
            "⏰ Timeout Error - The website might be too large or slow to process"
          );
        } else if (error.message.includes("network")) {
          console.error(
            "🌐 Network Error - Check internet connection and Firecrawl service status"
          );
        }
      }

      throw new Error(
        `Failed to extract website data: ${
          error instanceof Error ? error.message : "Unknown error"
        }`
      );
    }
  }

  /**
   * Extract unique paths from the discovered URLs
   */
  private extractUniquePaths(paths: string[], baseUrl: string): string[] {
    try {
      const baseUrlObj = new URL(baseUrl);
      const baseDomain = baseUrlObj.hostname;

      const uniquePaths = new Set<string>();

      paths.forEach((path) => {
        try {
          const url = new URL(path, baseUrl);

          // Only include paths from the same domain
          if (url.hostname === baseDomain) {
            // Normalize the path (remove trailing slash, etc.)
            let normalizedPath = url.pathname;
            if (normalizedPath.endsWith("/") && normalizedPath !== "/") {
              normalizedPath = normalizedPath.slice(0, -1);
            }

            // Add query parameters if they exist
            if (url.search) {
              normalizedPath += url.search;
            }

            // Add hash if it exists
            if (url.hash) {
              normalizedPath += url.hash;
            }

            uniquePaths.add(normalizedPath);
          }
        } catch (urlError) {
          // Skip invalid URLs
          console.warn(`Skipping invalid URL: ${path}`);
        }
      });

      // Convert to array and sort
      return Array.from(uniquePaths).sort();
    } catch (error) {
      console.error("Error extracting unique paths:", error);
      return [];
    }
  }

  /**
   * Convert website data to PathSelection format for UI
   */
  convertToPathSelections(paths: string[]): PathSelection[] {
    return paths.map((path) => ({
      path,
      allow: true, // Default to allow
      description: this.generatePathDescription(path),
    }));
  }

  /**
   * Generate a human-readable description for a path
   */
  private generatePathDescription(path: string): string {
    const pathLower = path.toLowerCase();

    // Common path patterns
    if (path === "/") return "Homepage";
    if (pathLower.includes("/blog") || pathLower.includes("/news"))
      return "Blog/News";
    if (pathLower.includes("/about")) return "About page";
    if (pathLower.includes("/contact")) return "Contact page";
    if (pathLower.includes("/privacy")) return "Privacy policy";
    if (pathLower.includes("/terms")) return "Terms of service";
    if (pathLower.includes("/api")) return "API endpoint";
    if (pathLower.includes("/admin")) return "Admin panel";
    if (pathLower.includes("/login") || pathLower.includes("/signin"))
      return "Authentication";
    if (pathLower.includes("/product") || pathLower.includes("/service"))
      return "Product/Service page";
    if (pathLower.includes("/help") || pathLower.includes("/support"))
      return "Help/Support";
    if (pathLower.includes("/faq")) return "FAQ page";

    // Extract meaningful name from path
    const pathParts = path.split("/").filter((part) => part.length > 0);
    if (pathParts.length > 0) {
      const lastPart = pathParts[pathParts.length - 1];
      if (lastPart) {
        // Remove file extensions and convert to readable format
        const cleanName = lastPart
          .replace(/\.(html|htm|php|asp|aspx)$/i, "")
          .replace(/[-_]/g, " ")
          .replace(/\b\w/g, (l) => l.toUpperCase());

        return cleanName || "Page";
      }
    }

    return "Page";
  }
}

// Export a singleton instance
export const firecrawlService = new FirecrawlService();

// Export the main function for convenience
export const extractWebsiteData = (url: string) =>
  firecrawlService.extractWebsiteData(url);
