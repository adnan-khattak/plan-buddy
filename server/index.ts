import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import { GoogleGenerativeAI } from '@google/generative-ai';
import { v4 as uuidv4 } from 'uuid';

const app = express();
app.use(cors());
app.use(express.json());

const gemini = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

// In-memory store for plans in progress
const plansInProgress: Record<string, any> = {};

// --- Helper functions ---
function computeDueDate(idx: number, horizonDays: number) {
  const today = new Date();
  const dayOffset = horizonDays > 0 ? Math.floor((idx / 6) * horizonDays) : 0;
  const due = new Date(today);
  due.setDate(today.getDate() + dayOffset);
  return due.toISOString().split('T')[0]; // YYYY-MM-DD
}

function randomPriority() {
  const arr = ['low', 'medium', 'high'];
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomEmoji() {
  const emojis = ['📝','✅','🔹','⚡','📌','🔥','💡','🎯','🚀','⭐'];
  return emojis[Math.floor(Math.random() * emojis.length)];
}

// ✅ MAIN ENDPOINT: /plan with SSE streaming
app.post("/plan", async (req, res) => {
  const { goal, horizon } = req.body;

  console.log("📩 [PLAN] Incoming request body:", req.body);

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
Keep 4-10 tasks max. Include realistic due dates.

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
    console.log("📡 [PLAN] Streaming response started");

    let buffer = "";
    let chunkCount = 0;

    for await (const chunk of stream.stream) {
      const text = chunk.text();
      if (!text) continue;

      chunkCount++;
      console.log(`🔹 [PLAN] Chunk #${chunkCount} received (${text.length} chars)`);

      buffer += text;
      res.write(`data: ${JSON.stringify({ type: "delta", content: text })}\n\n`);
      res.flush?.();
    }

    console.log(`📦 [PLAN] All chunks received. Total length: ${buffer.length} chars`);

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


// --- LEGACY ENDPOINTS (optional, keep for backwards compatibility) ---

app.post('/plan/start', (req, res) => {
  const { goal, horizon } = req.body as { goal: string; horizon: 'today' | 'week' };

  if (!goal || !horizon) return res.status(400).json({ error: 'goal & horizon required' });

  const planId = uuidv4();
  plansInProgress[planId] = { status: 'pending', plan: null };

  generatePlanBackground(planId, goal, horizon);

  res.json({ planId, status: 'pending' });
});

app.get('/plan/status/:planId', (req, res) => {
  const { planId } = req.params;
  const planStatus = plansInProgress[planId];

  if (!planStatus) return res.status(404).json({ error: 'Invalid planId' });

  res.json(planStatus);
});

app.post("/plan/stream", async (req, res) => {
  const { goal, horizon } = req.body;

  console.log("📩 [STREAM] Incoming request body:", req.body);

  if (!goal || !horizon) {
    console.warn("⚠️ [STREAM] Missing goal or horizon!");
    return res.status(400).json({ error: "goal & horizon required" });
  }

  // SSE headers
  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");

  console.log(`🚀 [STREAM] Starting Gemini stream for "${goal}" (${horizon})`);

  const model = gemini.getGenerativeModel({ model: "gemini-2.0-flash-exp" });

  const prompt = `
Generate 4–6 concise task titles for the goal: "${goal}".
Return as JSON only: {"tasks": [{"title": "string"}]}
`;

  try {
    console.log("💡 [STREAM] Sending prompt to Gemini...");
    const stream = await model.generateContentStream(prompt);
    console.log("📡 [STREAM] Stream started successfully");

    let buffer = "";
    let chunkCount = 0;

    for await (const chunk of stream.stream) {
      const text = chunk.text();
      if (!text) continue;

      chunkCount++;
      console.log(`🔹 [STREAM] Chunk #${chunkCount} (${text.length} chars):`, text);

      buffer += text;
      res.write(`data: ${JSON.stringify({ chunk: text })}\n\n`);
      res.flush?.();
    }

    console.log("📦 [STREAM] Finished receiving all chunks, total length:", buffer.length);

    const cleaned = buffer.replace(/```json/i, "").replace(/```/g, "").trim();
    console.log("🧹 [STREAM] Cleaned response:", cleaned);

    let data;
    try {
      data = JSON.parse(cleaned);
      console.log("✅ [STREAM] Parsed final JSON successfully");
    } catch (parseErr) {
      console.error("❌ [STREAM] JSON parse error:", parseErr.message);
      throw new Error("Invalid AI JSON output");
    }

    const tasks = (data.tasks ?? []).map((t, idx) => ({
      id: `task-${idx}`,
      title: t.title,
      dueDate: computeDueDate(idx, horizon === "today" ? 0 : 7),
      priority: randomPriority(),
      notes: "",
      emoji: randomEmoji(),
    }));

    console.log(`🏁 [STREAM] Sending done signal (${tasks.length} tasks)`);
    res.write(`data: ${JSON.stringify({ done: true, tasks })}\n\n`);
    res.end();

    console.log("✅ [STREAM] SSE connection closed successfully");
  } catch (err) {
    console.error("🔥 [STREAM] Stream error:", err);
    res.write(`data: ${JSON.stringify({ error: err.message })}\n\n`);
    res.end();
  }
});


async function generatePlanBackground(planId: string, goal: string, horizon: 'today' | 'week') {
  try {
    const horizonDays = horizon === 'today' ? 0 : 7;

    const prompt = `
Generate 4-6 concise task titles for the goal: "${goal}".
Return JSON only: {"tasks": [{"title": "string"}]}
`;

    const model = gemini.getGenerativeModel({ model: 'gemini-2.0-flash-exp' });

    console.log(`=== AI GenerateContent Start for planId: ${planId} ===`);
    const result = await model.generateContent(prompt);

    const text = result.response.text();
    const cleaned = text.replace(/```json/i, "").replace(/```/g, "").trim();
    const data = JSON.parse(cleaned);

    const tasks = (data.tasks ?? []).map((t: any, idx: number) => ({
      id: `task-${idx}`,
      title: t.title,
      dueDate: computeDueDate(idx, horizonDays),
      priority: randomPriority(),
      notes: "",
      emoji: randomEmoji(),
    }));

    plansInProgress[planId] = { status: 'completed', plan: { tasks } };
  } catch (err: any) {
    console.error(`Error generating plan ${planId}:`, err);
    plansInProgress[planId] = { status: 'error', error: err.message };
  }
}

// Start server
const port = process.env.PORT ?? 8787;
app.listen(port, () => {
  console.log(`🚀 PlanBuddy API listening on http://localhost:${port}`);
  console.log(`Available endpoints:`);
  console.log(`  POST /plan - Main endpoint with SSE streaming`);
  console.log(`  POST /plan/start - Start plan generation (polling)`);
  console.log(`  GET /plan/status/:planId - Check plan status`);
  console.log(`  POST /plan/stream - Legacy streaming endpoint`);
});