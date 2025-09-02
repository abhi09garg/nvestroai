// routes/advisor.js
import express from "express";
import { generateRecommendation } from "../services/advisorService.js";

const router = express.Router();

// POST /api/advisor   body: { age, income, riskTolerance, investmentHorizon, preferences }
router.post("/", async (req, res) => {
  try {
    const profile = req.body || {};
    // Basic validation
    if (!profile.age || !profile.income || !profile.riskTolerance) {
      return res.status(400).json({ error: "Missing required fields: age, income, riskTolerance" });
    }

    const result = await generateRecommendation(profile);
    return res.json(result);
  } catch (err) {
    console.error("Advisor endpoint error:", err);
    return res.status(500).json({ error: "Internal server error" });
  }
});

export default router;
