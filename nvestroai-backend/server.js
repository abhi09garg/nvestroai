// server.js
import express from "express";
import dotenv from "dotenv";
import mongoose from "mongoose";
import cors from "cors";
import advisorRoutes from "./routes/advisor.js";
import authRoutes from "./routes/auth.js";
import historyRoutes from "./routes/history.js";



dotenv.config();
const app = express();



app.use(cors());
app.use(express.json());

// mount advisor router
app.use("/api/advisor", advisorRoutes);

app.use("/api/history", historyRoutes);

app.use("/api/auth", authRoutes);

// MongoDB connection
mongoose.connect(process.env.MONGO_URI, {})
.then(() => console.log("✅ MongoDB connected"))
.catch((err) => console.error("❌ MongoDB error:", err));


app.get("/", (req, res) => res.send("NvestroAI backend is up. Try POST /api/advisor"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`NvestroAI backend running on http://localhost:${PORT}`));
