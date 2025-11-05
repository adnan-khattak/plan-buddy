import "dotenv/config";
import express from "express";
import cors from "cors";
import { GoogleGenerativeAI } from "@google/generative-ai";

const app = express();
app.use(cors());
app.use(express.json());

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// --- Helper functions ---
function computeDueDate(idx: number, horizonDays: number) {
  const today = new Date();
  const dayOffset = horizonDays > 0 ? Math.floor((idx / 6) * horizonDays) : 0;
  const due = new Date(today);
  due.setDate(today.getDate() + dayOffset);
  return due.toISOString().split("T")[0]; // YYYY-MM-DD
}

function randomPriority() {
  const arr = ["low", "medium", "high"];
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomEmoji() {
  const emojis = ["📝", "✅", "🔹", "⚡", "📌", "🔥", "💡", "🎯", "🚀", "⭐"];
  return emojis[Math.floor(Math.random() * emojis.length)];
}

// ✅ MAIN ENDPOINT: /plan with SSE streaming
app.post("/plan", async (req, res) => {
  const { goal, horizon } = req.body;

  console.log("📩 [PLAN] Incoming request:", req.body);

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
Keep 4–10 tasks max. Include realistic due dates.

Return ONLY valid JSON in this exact format:
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

  try {
    console.log("💡 [PLAN] Sending prompt to Gemini...");
    const stream = await model.generateContentStream(prompt);
    console.log("📡 [PLAN] Streaming started...");

    let buffer = "";
    let chunkCount = 0;

    for await (const chunk of stream.stream) {
      const text = chunk.text();
      if (!text) continue;

      chunkCount++;
      console.log(`🔹 [PLAN] Chunk #${chunkCount} (${text.length} chars)`);

      buffer += text;
      res.write(`data: ${JSON.stringify({ type: "delta", content: text })}\n\n`);
      res.flush?.();
    }

    console.log(`📦 [PLAN] All chunks received (${buffer.length} chars)`);

    const cleaned = buffer.replace(/```json/i, "").replace(/```/g, "").trim();

    let tasks;
    try {
      const data = JSON.parse(cleaned);
      tasks = data.tasks || [];

      console.log(`✅ [PLAN] Parsed ${tasks.length} tasks successfully`);

      tasks = tasks.map((task, idx) => ({
        id: task.id || `task-${idx}`,
        title: task.title,
        dueDate: task.dueDate || computeDueDate(idx, horizonDays),
        priority: task.priority?.toLowerCase() || randomPriority(),
        notes: task.notes || "",
        emoji: task.emoji || randomEmoji(),
      }));
    } catch (parseErr) {
      console.error("❌ [PLAN] Failed to parse AI response:", cleaned);
      throw new Error("AI returned invalid JSON");
    }

    res.write(`data: ${JSON.stringify({ type: "done", tasks })}\n\n`);
    res.end();

    console.log(`🏁 [PLAN] Stream completed successfully (${tasks.length} tasks)`);
  } catch (err) {
    console.error("🔥 [PLAN] Generation error:", err);
    res.write(`data: ${JSON.stringify({ type: "error", error: err.message })}\n\n`);
    res.end();
  }
});

// --- Start server ---
const port = process.env.PORT ?? 8787;
app.listen(port, () => {
  console.log(`🚀 PlanBuddy API running at: http://localhost:${port}`);
  console.log(`🧠 Endpoint ready: POST /plan`);
});
