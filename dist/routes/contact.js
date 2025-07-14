"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const nodemailer_1 = __importDefault(require("nodemailer"));
const router = (0, express_1.Router)();
router.post("/contact", async (req, res) => {
    const { name, email, phone, interest, message } = req.body;
    if (!name || !email || !interest || !message) {
        res.status(400).json({ error: "Missing required fields" });
        return;
    }
    const transporter = nodemailer_1.default.createTransport({
        host: process.env.SMTP_HOST || "smtp.gmail.com",
        port: Number(process.env.SMTP_PORT) || 465,
        secure: true,
        auth: {
            user: process.env.SMTP_USER || "dummy@gmail.com",
            pass: process.env.SMTP_PASS || "yourpassword",
        },
    });
    const mailOptions = {
        from: process.env.SMTP_USER || "dummy@gmail.com",
        to: "varunce7@gmail.com",
        replyTo: email,
        subject: `Contact Inquiry from ${name}`,
        text: `Name: ${name}\nEmail: ${email}\nPhone: ${phone}\nInterest: ${interest}\nMessage: ${message}`,
        html: `<p><b>Name:</b> ${name}</p><p><b>Email:</b> ${email}</p><p><b>Phone:</b> ${phone}</p><p><b>Interest:</b> ${interest}</p><p><b>Message:</b><br/>${message}</p>`,
    };
    try {
        await transporter.sendMail(mailOptions);
        res.json({ success: true });
    }
    catch (err) {
        res.status(500).json({ error: "Failed to send email" });
    }
});
exports.default = router;
//# sourceMappingURL=contact.js.map