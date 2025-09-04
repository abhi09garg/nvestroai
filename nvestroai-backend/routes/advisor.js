// routes/advisor.js
import express from "express";
import { generateRecommendation } from "../services/advisorService.js";
import { authMiddleware } from "../middleware/authMiddleware.js";

const router = express.Router();

// Health-check endpoint
router.get("/ping", (req, res) => {
  res.json({ status: "advisor alive" });
});

// POST /api/advisor
// body: { age, income, riskTolerance, investmentHorizon?, preferences? }
router.post("/", authMiddleware, async (req, res) => {
  try {
    const { age, income, riskTolerance, investmentHorizon, preferences } = req.body || {};

    // Basic validation
    if (!age || !income || !riskTolerance) {
      return res.status(400).json({
        error: "Missing required fields: age, income, riskTolerance",
      });
    }

    // Apply defaults for optional fields
    const profile = {
      age,
      income,
      riskTolerance,
      investmentHorizon: investmentHorizon || "medium", // default horizon
      preferences: preferences || [], // default to empty list
    };

    // ✅ Pass userId so history is saved inside the service
    const result = await generateRecommendation(profile, req.user._id);

    // Ensure explanation always exists
    const safeResult = {
      ...result,
      explanation:
        result.explanation ||
        "Based on available data, we suggest a balanced allocation strategy.",
    };

    return res.json(safeResult);
  } catch (err) {
    console.error("Advisor endpoint error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
