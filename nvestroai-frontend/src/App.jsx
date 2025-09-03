import { useState } from "react";
import axios from "axios";
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer } from "recharts";

function App() {
  const [profile, setProfile] = useState({
    age: "",
    income: "",
    riskTolerance: "medium",
    investmentHorizon: "medium",
    preferences: [],
  });
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState("");

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    if (type === "checkbox") {
      setProfile((prev) => {
        const prefs = prev.preferences.includes(value)
          ? prev.preferences.filter((p) => p !== value)
          : [...prev.preferences, value];
        return { ...prev, preferences: prefs };
      });
    } else {
      setProfile((prev) => ({ ...prev, [name]: value }));
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResult(null);
    try {
      const res = await axios.post("http://localhost:4000/api/advisor", profile);
      setResult(res.data);
    } catch (err) {
      console.error(err);
      setError("Failed to fetch recommendation.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 p-6">
      <div className="max-w-3xl mx-auto bg-white rounded-xl shadow p-6">
        <h1 className="text-2xl font-bold mb-4">NvestroAI Advisor</h1>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label>Age:</label>
            <input
              type="number"
              name="age"
              value={profile.age}
              onChange={handleChange}
              className="border rounded p-2 w-full"
              required
            />
          </div>

          <div>
            <label>Income:</label>
            <input
              type="number"
              name="income"
              value={profile.income}
              onChange={handleChange}
              className="border rounded p-2 w-full"
              required
            />
          </div>

          <div>
            <label>Risk Tolerance:</label>
            <select
              name="riskTolerance"
              value={profile.riskTolerance}
              onChange={handleChange}
              className="border rounded p-2 w-full"
            >
              <option value="low">Low</option>
              <option value="medium">Medium</option>
              <option value="high">High</option>
            </select>
          </div>

          <div>
            <label>Investment Horizon:</label>
            <select
              name="investmentHorizon"
              value={profile.investmentHorizon}
              onChange={handleChange}
              className="border rounded p-2 w-full"
            >
              <option value="short">Short</option>
              <option value="medium">Medium</option>
              <option value="long">Long</option>
            </select>
          </div>

          <div>
            <label>Preferences:</label>
            <div className="flex gap-4">
              {["tech", "crypto", "energy", "healthcare"].map((p) => (
                <label key={p} className="flex items-center gap-1">
                  <input
                    type="checkbox"
                    name="preferences"
                    value={p}
                    checked={profile.preferences.includes(p)}
                    onChange={handleChange}
                  />
                  {p.charAt(0).toUpperCase() + p.slice(1)}
                </label>
              ))}
            </div>
          </div>

          <button
            type="submit"
            className="bg-blue-600 text-white px-4 py-2 rounded hover:bg-blue-700"
            disabled={loading}
          >
            {loading ? "Analyzing..." : "Get Recommendation"}
          </button>
        </form>

        {error && <p className="text-red-500 mt-4">{error}</p>}

        {result && (
          <div className="mt-6 space-y-4">
            <h2 className="text-xl font-semibold">Result</h2>

            <p>
              <strong>Overall Confidence:</strong> {result.overallConfidence}
            </p>
            <p>
              <strong>Advice:</strong> {result.advice}
            </p>
            <p>
              <strong>Explanation:</strong> {result.explanation}
            </p>

            <h3 className="font-semibold mt-4">Base Allocation</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={Object.entries(result.baseAllocation).map(([k, v]) => ({ name: k, value: v }))}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#3b82f6" />
              </BarChart>
            </ResponsiveContainer>

            <h3 className="font-semibold mt-4">Final Allocation</h3>
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={Object.entries(result.finalAllocation).map(([k, v]) => ({ name: k, value: v }))}>
                <XAxis dataKey="name" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="value" fill="#10b981" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>
    </div>
  );
}

export default App;
