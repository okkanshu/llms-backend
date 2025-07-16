import { Router, Request, Response } from "express";
import nodemailer from "nodemailer";

const router = Router();

// Validate required environment variables
const validateEnvVars = () => {
  const required = ["BREVO_SMTP_USER", "BREVO_SMTP_KEY", "EMAIL_TO"];
  const missing = required.filter((key) => !process.env[key]);

  if (missing.length > 0) {
    console.warn(`Missing environment variables: ${missing.join(", ")}`);
  }

  if (!process.env.BREVO_API_KEY) {
    console.warn(
      "BREVO_API_KEY not set - contact list addition will be skipped"
    );
  }
};

validateEnvVars();

interface ContactFormData {
  name: string;
  email: string;
  phone?: string;
  interest: string;
  message: string;
}

// Brevo SMTP configuration
const createBrevoTransporter = () => {
  return nodemailer.createTransport({
    host: "smtp-relay.brevo.com",
    port: 587,
    auth: {
      user: process.env.BREVO_SMTP_USER || process.env.EMAIL_FROM,
      pass: process.env.BREVO_SMTP_KEY || process.env.BREVO_API_KEY,
    },
  });
};

// Add contact to Brevo list via API
const addContactToBrevo = async (contactData: ContactFormData) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    console.warn(
      "Brevo API key not configured, skipping contact list addition"
    );
    return null; // Don't fail the entire request if API key is missing
  }

  const listId = process.env.BREVO_LIST_ID || "3"; // Updated to match your list ID

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

  // Log environment and payload for debugging
  console.log("[Brevo] ENV:", {
    BREVO_API_KEY: apiKey ? "***set***" : "NOT SET",
    BREVO_LIST_ID: listId,
  });
  console.log("[Brevo] Payload:", contactPayload);

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

    // Log status and headers
    console.log(`[Brevo] Response status: ${response.status}`);
    console.log(`[Brevo] Response headers:`, response.headers);

    // Read response as text first for robust logging
    const responseText = await response.text();
    console.log(`[Brevo] Raw response body:`, responseText);

    let result;
    try {
      result = responseText ? JSON.parse(responseText) : null;
    } catch (jsonErr) {
      console.error("[Brevo] Failed to parse response as JSON:", jsonErr);
      result = null;
    }

    if (!response.ok) {
      console.error("[Brevo] API error:", result || responseText);
      throw new Error(
        `Brevo API error: ${response.status} - ${JSON.stringify(
          result || responseText
        )}`
      );
    }

    console.log("Contact added to Brevo successfully:", result);
    return result;
  } catch (error) {
    console.error("Error adding contact to Brevo:", error);
    // Don't throw error - let email still be sent even if Brevo API fails
    return null;
  }
};

router.post("/contact", async (req: Request, res: Response) => {
  const { name, email, phone, interest, message }: ContactFormData = req.body;

  if (!name || !email || !interest || !message) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  try {
    // 1. Add contact to Brevo list (don't fail if this doesn't work)
    const brevoResult = await addContactToBrevo({
      name,
      email,
      phone,
      interest,
      message,
    });

    // 2. Send email notification using Brevo SMTP
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
  } catch (err) {
    console.error("Contact form error:", err);
    res.status(500).json({
      error: "Failed to process your request. Please try again later.",
    });
  }
});

// Debug endpoint to test Brevo API and create attributes
router.post("/contact/debug", async (req: Request, res: Response) => {
  const apiKey = process.env.BREVO_API_KEY;
  if (!apiKey) {
    return res.status(400).json({ error: "BREVO_API_KEY not configured" });
  }

  try {
    // First, let's try to create the custom attributes
    const attributesToCreate = [
      { name: "PHONE", type: "text", category: "contact" },
      { name: "INTEREST", type: "text", category: "contact" },
      { name: "MESSAGE", type: "text", category: "contact" },
    ];

    console.log("Creating custom attributes in Brevo...");

    for (const attr of attributesToCreate) {
      try {
        const response = await fetch(
          `https://api.brevo.com/v3/contacts/attributes`,
          {
            method: "POST",
            headers: {
              accept: "application/json",
              "content-type": "application/json",
              "api-key": apiKey,
            },
            body: JSON.stringify(attr),
          }
        );

        if (response.ok) {
          console.log(`Created attribute: ${attr.name}`);
        } else {
          const error = await response.json();
          console.log(`Attribute ${attr.name} already exists or error:`, error);
        }
      } catch (error) {
        console.log(`Error creating attribute ${attr.name}:`, error);
      }
    }

    // Now test adding a contact with all attributes
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
    } else {
      const error = await contactResponse.json();
      res.status(400).json({
        error: "Failed to create test contact",
        details: error,
      });
    }
  } catch (error) {
    console.error("Debug endpoint error:", error);
    res.status(500).json({ error: "Debug test failed" });
  }
});

router.get("/contact/test", async (req: Request, res: Response) => {
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
  } catch (error) {
    res.status(500).json({ error: "Configuration check failed" });
  }
});

export default router;
