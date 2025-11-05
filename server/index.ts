import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';

const app = express();
app.use(cors());
app.use(express.json());

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);


// Health check route
app.get('/', (_req, res) => {
  res.json({ message: '✅ Gemini API backend is running' });
});

// /plan endpoint
app.post('/plan', async (req, res) => {
  try {
    const { goal, horizon } = req.body as {
      goal?: string;
      horizon?: 'today' | 'week';
    };

  if (!goal || !horizon) {
    console.warn("⚠️ [PLAN] Missing goal or horizon!");
    return res.status(400).json({ error: "goal & horizon required" });
  }

  console.log(`🚀 [PLAN] Generating plan for: "${goal}" (${horizon})`);

  // Set headers for SSE
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const horizonDays = horizon === "today" ? 0 : 7;
  const horizonText = horizon === "today" ? "end of today" : "end of this week";

  const prompt = `
Create a concise, actionable task plan for the goal: "${goal}".
Spread tasks between now and the ${horizonText}.
Keep 4–10 tasks max.
Include realistic due dates.
Return ONLY valid JSON matching this shape:
{
  "tasks": [
    {
      "id": "task-1",
      "title": "Task title here",
      "dueDate": "YYYY-MM-DD",
      "priority": "low|medium|high",
      "notes": "Optional notes",
      "emoji": "📝"
    }
  ]
}
`;

    // Use Gemini model
    const model = gemini.getGenerativeModel({ model: 'gemini-2.5-flash' });
    const result = await model.generateContent(prompt);
    const text = result.response.text();

    // Try to parse the JSON returned by the model
   let cleaned = text
  .replace(/```json/i, "")  // remove ```json
  .replace(/```/g, "")      // remove ```
  .trim();

let data;
try {
  data = JSON.parse(cleaned);
} catch (err) {
  console.error('Invalid JSON from Gemini:', cleaned);
  return res.status(502).json({
    error: 'Model returned invalid JSON',
    raw: cleaned,
  });
}


    // Ensure valid data
    if (!data?.tasks || !Array.isArray(data.tasks)) {
      return res.status(502).json({
        error: 'Model did not return a valid tasks array',
        raw: data,
      });
    }

    return res.json(data);
  } catch (err: any) {
    console.error('Error in /plan:', err);
    res.status(500).json({ error: 'Server error', detail: err.message });
  }
}

// --- Start server ---
const port = process.env.PORT ?? 8787;
app.listen(port, () => {
  console.log(`Server is running on http://localhost:${port}`);
});