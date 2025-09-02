// server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import advisorRoutes from "./routes/advisor.js";

dotenv.config();
const app = express();

app.use(cors());
app.use(express.json());

// mount advisor router
app.use("/api/advisor", advisorRoutes);

app.get("/", (req, res) => res.send("NvestroAI backend is up. Try POST /api/advisor"));

const PORT = process.env.PORT || 4000;
app.listen(PORT, () => console.log(`NvestroAI backend running on http://localhost:${PORT}`));
