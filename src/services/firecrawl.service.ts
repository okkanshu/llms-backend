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
    this.apiKey = process.env.FIRECRAWL_API_KEY || "";
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
        path: string;
        title: string;
        description: string;
        keywords?: string;
        links: string[];
      }> = [];
      const tempDuplicateTracker = new Set<string>();

      // Fetch main page metadata first (cheaper than full extraction)
      let mainPageData: any = null;
      let mainPageLinks: string[] = [];
      try {
        const mainMeta = await this.app.scrapeUrl(url, {
          formats: ["json"],
          jsonOptions: {
            schema: websiteDataSchema,
            prompt:
              "Extract the title, description, keywords, and internal links from this page. Return JSON with fields: title, description, keywords, links (array).",
          },
          onlyMainContent: false,
        });

        if (mainMeta && (mainMeta as any).metadata) {
          const metaAny = mainMeta as any;
          mainPageData = metaAny.metadata;

          // Prefer links returned in the JSON extraction result
          if (metaAny.json && Array.isArray(metaAny.json.links)) {
            mainPageLinks = metaAny.json.links;
          } else if (Array.isArray(metaAny.links)) {
            // Fallback if links are returned at top level
            mainPageLinks = metaAny.links;
          }

          console.log("📋 Main page metadata fetched via scrapeUrl:", {
            title: mainPageData.title,
            description: mainPageData.description?.substring(0, 200) + "...",
            linksFound: mainPageLinks.length,
          });
        }
      } catch (scrapeErr) {
        console.warn("⚠️ scrapeUrl failed, continuing without it:", scrapeErr);
      }

      // Prepare to discover additional internal pages
      console.log("🔍 Discovering pages from main page links...");

      const discoveredUrls: string[] = [];

      // Use extracted links from JSON result (mainPageLinks)
      if (mainPageLinks.length > 0) {
        const baseDomain = new URL(url).hostname;
        for (const link of mainPageLinks) {
          try {
            const absolute = new URL(link, url);
            if (absolute.hostname === baseDomain) {
              discoveredUrls.push(absolute.href);
            }
          } catch {}
        }
      }

      // Always augment discovery with Firecrawl map endpoint (up to 100 links)
      try {
        console.log("🔍 Augmenting discovery via Firecrawl map...");
        const mapRes = await this.app.mapUrl(url, { limit: 100 });
        if (mapRes.success && Array.isArray(mapRes.links)) {
          const baseDomain = new URL(url).hostname;
          mapRes.links.forEach((link: string) => {
            try {
              const absolute = new URL(link, url);
              if (absolute.hostname === baseDomain) {
                discoveredUrls.push(absolute.href);
              }
            } catch {}
          });
          console.log(
            `📊 Map API added ${mapRes.links.length} links (total discovered: ${discoveredUrls.length})`
          );
        } else {
          console.warn(
            "⚠️ Map API did not return links or failed",
            mapRes.error
          );
        }
      } catch (mapErr) {
        console.warn("⚠️ mapUrl failed, continuing without it:", mapErr);
      }

      // De-duplicate and cap to first 100 pages to avoid excessive credit usage
      const uniqueDiscovered = [...new Set(discoveredUrls)].slice(0, 100);

      console.log(
        `📊 Discovered ${uniqueDiscovered.length} internal links to extract`
      );

      for (let i = 0; i < uniqueDiscovered.length; i++) {
        const pageUrl = uniqueDiscovered[i];

        console.log(
          `📄 Processing page ${i + 1}/${uniqueDiscovered.length}: ${pageUrl}`
        );

        try {
          const extractResult = (await this.app.extract([pageUrl], {
            prompt:
              "Extract the title, description, keywords, and all internal links from this page. Return as JSON with fields: title, description, keywords, links (array of internal URLs).",
            schema: websiteDataSchema,
          })) as FirecrawlExtractResponse;

          if (extractResult.success && extractResult.data) {
            const extractedData = extractResult.data;

            const pagePath = (() => {
              try {
                const u = new URL(pageUrl);
                return u.pathname.endsWith("/") && u.pathname !== "/"
                  ? u.pathname.slice(0, -1)
                  : u.pathname || "/";
              } catch {
                return pageUrl;
              }
            })();

            tempPageData.push({
              url: pageUrl,
              path: pagePath,
              title: extractedData.title,
              description: extractedData.description,
              keywords: extractedData.keywords,
              links: extractedData.links || [],
            } as any);

            if (extractedData.links && Array.isArray(extractedData.links)) {
              extractedData.links.forEach((link) => {
                tempAllLinks.push(link);
                tempDuplicateTracker.add(link);
              });
            }

            console.log(`✅ Extracted from ${pageUrl}:`, {
              title: extractedData.title,
              description: extractedData.description,
              keywords: extractedData.keywords,
              linksCount: extractedData.links?.length || 0,
              uniqueLinksInPage: new Set(extractedData.links || []).size,
            });
          }
        } catch (extractError) {
          console.warn(`⚠️ Failed to extract from ${pageUrl}:`, extractError);
        }
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

      const pageMetadatas = uniquePaths.map((path) => {
        const match =
          tempPageData.find((p: any) => p.path === path) ||
          tempPageData.find((p: any) => p.links.includes(path)) ||
          tempPageData[0];
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
        totalPagesCrawled: tempPageData.length,
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
            if (url.search) {
              normalizedPath += url.search;
            }
            if (url.hash) {
              normalizedPath += url.hash;
            }
            uniquePaths.add(normalizedPath);
          }
        } catch (urlError) {
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

  /** Convert website data to PathSelection format for UI */
  convertToPathSelections(paths: string[]): PathSelection[] {
    return paths.map((path) => ({
      path,
      allow: true, // Default to allow
      description: this.generatePathDescription(path),
    }));
  }

  /** Generate a human-readable description for a path */
  private generatePathDescription(path: string): string {
    const pathLower = path.toLowerCase();

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

export const firecrawlService = new FirecrawlService();

export const extractWebsiteData = (url: string) =>
  firecrawlService.extractWebsiteData(url);
