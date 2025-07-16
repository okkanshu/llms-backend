import mongoose from "mongoose";

const CrawlResultSchema = new mongoose.Schema({
  url: { type: String, required: true },
  user: { type: String }, // email or user id if available
  sessionId: { type: String },
  timestamp: { type: Date, default: Date.now },
  crawledData: { type: mongoose.Schema.Types.Mixed, required: true }, // store full crawl result as JSON
  email: { type: String },
  jobStatus: { type: String, default: "completed" }, // completed, pending, failed, etc.
});

export const CrawlResultModel =
  mongoose.models.CrawlResult ||
  mongoose.model("CrawlResult", CrawlResultSchema);
