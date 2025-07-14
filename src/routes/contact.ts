import { Router, Request, Response } from "express";
import nodemailer from "nodemailer";

const router = Router();

router.post("/contact", async (req: Request, res: Response) => {
  const { name, email, phone, interest, message } = req.body;

  if (!name || !email || !interest || !message) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const transporter = nodemailer.createTransport({
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
  } catch (err) {
    res.status(500).json({ error: "Failed to send email" });
  }
});

export default router;
