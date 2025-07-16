"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CrawlResultModel = void 0;
const mongoose_1 = __importDefault(require("mongoose"));
const CrawlResultSchema = new mongoose_1.default.Schema({
    url: { type: String, required: true },
    user: { type: String },
    sessionId: { type: String },
    timestamp: { type: Date, default: Date.now },
    crawledData: { type: mongoose_1.default.Schema.Types.Mixed, required: true },
    email: { type: String },
    jobStatus: { type: String, default: "completed" },
});
exports.CrawlResultModel = mongoose_1.default.models.CrawlResult ||
    mongoose_1.default.model("CrawlResult", CrawlResultSchema);
//# sourceMappingURL=crawl-result.model.js.map