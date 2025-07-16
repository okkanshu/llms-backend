"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const models_1 = require("../models");
const bcrypt_1 = __importDefault(require("bcrypt"));
const jsonwebtoken_1 = __importDefault(require("jsonwebtoken"));
const router = (0, express_1.Router)();
const JWT_SECRET = process.env.JWT_SECRET || "changeme";
router.post("/signup", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res
            .status(400)
            .json({ success: false, error: "Email and password required" });
    }
    try {
        const existing = await models_1.UserModel.findOne({ email });
        if (existing) {
            return res
                .status(409)
                .json({ success: false, error: "Email already registered" });
        }
        const passwordHash = await bcrypt_1.default.hash(password, 10);
        const user = await models_1.UserModel.create({ email, passwordHash });
        const token = jsonwebtoken_1.default.sign({ email: user.email }, process.env.JWT_SECRET || "changeme", {
            expiresIn: "7d",
        });
        res.json({ success: true, token, email: user.email });
    }
    catch (err) {
        res.status(500).json({ success: false, error: "Signup failed" });
    }
});
router.post("/login", async (req, res) => {
    const { email, password } = req.body;
    if (!email || !password) {
        return res
            .status(400)
            .json({ success: false, error: "Email and password required" });
    }
    try {
        const user = await models_1.UserModel.findOne({ email });
        if (!user) {
            return res
                .status(401)
                .json({ success: false, error: "Invalid credentials" });
        }
        const valid = await bcrypt_1.default.compare(password, user.passwordHash);
        if (!valid) {
            return res
                .status(401)
                .json({ success: false, error: "Invalid credentials" });
        }
        const token = jsonwebtoken_1.default.sign({ email: user.email }, process.env.JWT_SECRET || "changeme", {
            expiresIn: "7d",
        });
        res.json({ success: true, token, email: user.email });
    }
    catch (err) {
        res.status(500).json({ success: false, error: "Login failed" });
    }
});
router.post("/logout", (req, res) => {
    res.json({ success: true });
});
exports.default = router;
//# sourceMappingURL=auth.js.map