"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const express_1 = require("express");
const nodemailer_1 = __importDefault(require("nodemailer"));
const router = (0, express_1.Router)();
const validateEnvVars = () => {
    const required = ["BREVO_SMTP_USER", "BREVO_SMTP_KEY", "EMAIL_TO"];
    const missing = required.filter((key) => !process.env[key]);
    if (missing.length > 0) {
        console.warn(`Missing environment variables: ${missing.join(", ")}`);
    }
    if (!process.env.BREVO_API_KEY) {
        console.warn("BREVO_API_KEY not set - contact list addition will be skipped");
    }
};
validateEnvVars();
const createBrevoTransporter = () => {
    return nodemailer_1.default.createTransport({
        host: "smtp-relay.brevo.com",
        port: 587,
        auth: {
            user: process.env.BREVO_SMTP_USER || process.env.EMAIL_FROM,
            pass: process.env.BREVO_SMTP_KEY || process.env.BREVO_API_KEY,
        },
    });
};
const addContactToBrevo = async (contactData) => {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
        console.warn("Brevo API key not configured, skipping contact list addition");
        return null;
    }
    const listId = process.env.BREVO_LIST_ID || "3";
    const contactPayload = {
        email: contactData.email,
        attributes: {
            FIRSTNAME: contactData.name.split(" ")[0] || contactData.name,
            LASTNAME: contactData.name.split(" ").slice(1).join(" ") || "",
            PHONE: contactData.phone || "",
            INTEREST: contactData.interest,
            MESSAGE: contactData.message,
        },
        listIds: [parseInt(listId)],
        updateEnabled: true,
    };
    try {
        console.log("Adding contact to Brevo:", {
            email: contactData.email,
            listId,
            attributes: contactPayload.attributes,
        });
        const response = await fetch(`https://api.brevo.com/v3/contacts`, {
            method: "POST",
            headers: {
                accept: "application/json",
                "content-type": "application/json",
                "api-key": apiKey,
            },
            body: JSON.stringify(contactPayload),
        });
        if (!response.ok) {
            const errorData = await response.json();
            console.error("Brevo API error:", errorData);
            throw new Error(`Brevo API error: ${response.status} - ${JSON.stringify(errorData)}`);
        }
        const result = await response.json();
        console.log("Contact added to Brevo successfully:", result);
        return result;
    }
    catch (error) {
        console.error("Error adding contact to Brevo:", error);
        return null;
    }
};
router.post("/contact", async (req, res) => {
    const { name, email, phone, interest, message } = req.body;
    if (!name || !email || !interest || !message) {
        res.status(400).json({ error: "Missing required fields" });
        return;
    }
    try {
        const brevoResult = await addContactToBrevo({
            name,
            email,
            phone,
            interest,
            message,
        });
        const transporter = createBrevoTransporter();
        const mailOptions = {
            from: process.env.EMAIL_FROM || process.env.BREVO_SMTP_USER,
            to: process.env.EMAIL_TO || "varunce7@gmail.com",
            replyTo: email,
            subject: `New Contact Inquiry: ${interest} from ${name}`,
            text: `
Name: ${name}
Email: ${email}
Phone: ${phone || "Not provided"}
Interest: ${interest}
Message: ${message}
      `,
            html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">New Contact Inquiry</h2>
          <div style="background: #f5f5f5; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p><strong>Name:</strong> ${name}</p>
            <p><strong>Email:</strong> <a href="mailto:${email}">${email}</a></p>
            <p><strong>Phone:</strong> ${phone || "Not provided"}</p>
            <p><strong>Interest:</strong> ${interest}</p>
            <p><strong>Message:</strong></p>
            <div style="background: white; padding: 15px; border-radius: 5px; margin-top: 10px;">
              ${message.replace(/\n/g, "<br>")}
            </div>
          </div>
          <p style="color: #666; font-size: 14px;">
            This contact has been automatically added to your Brevo contact list.
          </p>
        </div>
      `,
        };
        await transporter.sendMail(mailOptions);
        res.json({
            success: true,
            message: "Thank you for your inquiry! We'll get back to you soon.",
        });
    }
    catch (err) {
        console.error("Contact form error:", err);
        res.status(500).json({
            error: "Failed to process your request. Please try again later.",
        });
    }
});
router.post("/contact/debug", async (req, res) => {
    const apiKey = process.env.BREVO_API_KEY;
    if (!apiKey) {
        return res.status(400).json({ error: "BREVO_API_KEY not configured" });
    }
    try {
        const attributesToCreate = [
            { name: "PHONE", type: "text", category: "contact" },
            { name: "INTEREST", type: "text", category: "contact" },
            { name: "MESSAGE", type: "text", category: "contact" },
        ];
        console.log("Creating custom attributes in Brevo...");
        for (const attr of attributesToCreate) {
            try {
                const response = await fetch(`https://api.brevo.com/v3/contacts/attributes`, {
                    method: "POST",
                    headers: {
                        accept: "application/json",
                        "content-type": "application/json",
                        "api-key": apiKey,
                    },
                    body: JSON.stringify(attr),
                });
                if (response.ok) {
                    console.log(`Created attribute: ${attr.name}`);
                }
                else {
                    const error = await response.json();
                    console.log(`Attribute ${attr.name} already exists or error:`, error);
                }
            }
            catch (error) {
                console.log(`Error creating attribute ${attr.name}:`, error);
            }
        }
        const testContact = {
            email: "test@example.com",
            attributes: {
                FIRSTNAME: "Test",
                LASTNAME: "User",
                PHONE: "+1234567890",
                INTEREST: "General Inquiry",
                MESSAGE: "This is a test message",
            },
            listIds: [parseInt(process.env.BREVO_LIST_ID || "3")],
            updateEnabled: true,
        };
        console.log("Testing contact creation with attributes:", testContact);
        const contactResponse = await fetch(`https://api.brevo.com/v3/contacts`, {
            method: "POST",
            headers: {
                accept: "application/json",
                "content-type": "application/json",
                "api-key": apiKey,
            },
            body: JSON.stringify(testContact),
        });
        if (contactResponse.ok) {
            const result = await contactResponse.json();
            res.json({
                success: true,
                message: "Test contact created successfully",
                result,
            });
        }
        else {
            const error = await contactResponse.json();
            res.status(400).json({
                error: "Failed to create test contact",
                details: error,
            });
        }
    }
    catch (error) {
        console.error("Debug endpoint error:", error);
        res.status(500).json({ error: "Debug test failed" });
    }
});
router.get("/contact/test", async (req, res) => {
    try {
        const config = {
            smtp: {
                user: process.env.BREVO_SMTP_USER,
                key: process.env.BREVO_SMTP_KEY ? "***configured***" : "NOT SET",
                host: "smtp-relay.brevo.com",
                port: 587,
            },
            api: {
                key: process.env.BREVO_API_KEY ? "***configured***" : "NOT SET",
                listId: process.env.BREVO_LIST_ID || "NOT SET",
            },
            email: {
                from: process.env.EMAIL_FROM,
                to: process.env.EMAIL_TO,
            },
        };
        res.json({
            success: true,
            message: "Brevo configuration check",
            config,
        });
    }
    catch (error) {
        res.status(500).json({ error: "Configuration check failed" });
    }
});
exports.default = router;
//# sourceMappingURL=contact.js.map