import { Router } from "express";
import { UserModel } from "../models";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

const router = Router();
const JWT_SECRET = process.env.JWT_SECRET || "changeme";

// Signup
router.post("/signup", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, error: "Email and password required" });
  }
  try {
    const existing = await UserModel.findOne({ email });
    if (existing) {
      return res
        .status(409)
        .json({ success: false, error: "Email already registered" });
    }
    const passwordHash = await bcrypt.hash(password, 10);
    const user = await UserModel.create({ email, passwordHash });
    const token = jwt.sign(
      { email: user.email },
      process.env.JWT_SECRET || "changeme",
      {
        expiresIn: "7d",
      }
    );
    res.json({ success: true, token, email: user.email });
  } catch (err) {
    res.status(500).json({ success: false, error: "Signup failed" });
  }
});

// Login
router.post("/login", async (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) {
    return res
      .status(400)
      .json({ success: false, error: "Email and password required" });
  }
  try {
    const user = await UserModel.findOne({ email });
    if (!user) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
    }
    const valid = await bcrypt.compare(password, user.passwordHash);
    if (!valid) {
      return res
        .status(401)
        .json({ success: false, error: "Invalid credentials" });
    }
    const token = jwt.sign(
      { email: user.email },
      process.env.JWT_SECRET || "changeme",
      {
        expiresIn: "7d",
      }
    );
    res.json({ success: true, token, email: user.email });
  } catch (err) {
    res.status(500).json({ success: false, error: "Login failed" });
  }
});

// Logout (stateless, just a placeholder for frontend)
router.post("/logout", (req, res) => {
  res.json({ success: true });
});

export default router;
