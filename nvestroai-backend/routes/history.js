// routes/history.js
import express from "express";
import { authMiddleware } from "../middleware/authMiddleware.js";
import Recommendation from "../models/Recommendation.js";

const router = express.Router();

// GET /api/history
router.get("/", authMiddleware, async (req, res) => {
  try {
    const history = await Recommendation.find({ user: req.user._id })
      .sort({ createdAt: -1 });
    res.json(history);
  } catch (err) {
    console.error("History fetch error:", err);
    res.status(500).json({ error: "Failed to fetch history" });
  }
});

// DELETE /api/history
// Clear all logs for logged-in user
router.delete("/", authMiddleware, async (req, res) => {
  try {
    await Recommendation.deleteMany({ user: req.user._id });
    res.json({ message: "All history cleared" });
  } catch (err) {
    console.error("Clear history error:", err);
    res.status(500).json({ error: "Failed to clear history" });
  }
});

// DELETE /api/history/:id
// Delete one recommendation
router.delete("/:id", authMiddleware, async (req, res) => {
  try {
    const deleted = await Recommendation.findOneAndDelete({
      _id: req.params.id,
      user: req.user._id, // security: only delete your own log
    });

    if (!deleted) {
      return res.status(404).json({ error: "Recommendation not found" });
    }

    res.json({ message: "Recommendation deleted", deleted });
  } catch (err) {
    console.error("Delete recommendation error:", err);
    res.status(500).json({ error: "Failed to delete recommendation" });
  }
});

router.put("/:id", authMiddleware, async (req, res) => {
  try {
    const { note } = req.body;

    if (typeof note !== "string") {
      return res.status(400).json({ error: "Note must be a string" });
    }

    const updated = await Recommendation.findOneAndUpdate(
      { _id: req.params.id, user: req.user._id },
      { note },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ error: "Recommendation not found" });
    }

    res.json({ message: "Note updated", recommendation: updated });
  } catch (err) {
    console.error("Update note error:", err);
    res.status(500).json({ error: "Failed to update note" });
  }
});

export default router;
