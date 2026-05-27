import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();
const allowedPriorities = new Set(['low', 'normal', 'high', 'urgent']);
const priorityRank = { low: 1, normal: 2, high: 3, urgent: 4 };

function formatDate(value) {
  if (!value) return null;
  return new Date(value).toISOString().slice(0, 10);
}

function urgencyScore(task) {
  let score = (priorityRank[task.priority] || 2) * 2;
  const text = `${task.title} ${task.description}`.toLowerCase();

  if (/block|broken|bug|fail|urgent|deadline|security|production|customer|client|login|payment|deploy|release/.test(text)) score += 3;
  if (/review|contact|confirm|follow up|meeting|approval/.test(text)) score += 1;

  if (task.dueDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(`${task.dueDate}T00:00:00`);
    const daysUntilDue = Math.ceil((due - today) / 86400000);

    if (daysUntilDue < 0) score += 5;
    else if (daysUntilDue === 0) score += 4;
    else if (daysUntilDue <= 2) score += 3;
    else if (daysUntilDue <= 7) score += 1;
  }

  if (task.status === 'In Progress') score += 1;
  if (task.status === 'Done') score -= 10;

  return score;
}

function localFallbackSummary(tasks) {
  const activeTasks = tasks.filter((task) => task.status !== 'Done');
  const suggestedOrder = [...activeTasks]
    .sort((a, b) => {
      const urgencyDelta = urgencyScore(b) - urgencyScore(a);
      if (urgencyDelta !== 0) return urgencyDelta;
      if (a.dueDate && b.dueDate) return new Date(a.dueDate) - new Date(b.dueDate);
      if (a.dueDate) return -1;
      if (b.dueDate) return 1;
      return a.id - b.id;
    })
    .slice(0, 8)
    .map((task) => task.title);

  const topTask = suggestedOrder[0];
  const activeStatuses = [...new Set(activeTasks.map((task) => task.status))].join(', ');

  return {
    source: 'local-fallback',
    summary: activeTasks.length
      ? `Your day is mainly about moving ${activeTasks.length} active task${activeTasks.length === 1 ? '' : 's'} forward across ${activeStatuses}. Start with ${topTask || 'the clearest blocker'}, then use due dates, priority, and dependencies to decide what can wait.`
      : 'There are no active tasks outside Done. You are clear for now.',
    suggestedOrder,
    priorityUpdates: []
  };
}

function cleanJsonText(text) {
  return text
    .replace(/^```json\s*/i, '')
    .replace(/^```\s*/i, '')
    .replace(/```$/i, '')
    .trim();
}

function buildPrompt(tasks, smartPriority) {
  const smartPriorityInstructions = smartPriority
    ? `
Smart Priority is ON.
You MAY recommend priorityUpdates, but be conservative and only change a card's priority when the title, description, due date, or status clearly suggests the current priority is misleading.
Do not change priorities merely to make the order look neater.
Prefer zero, one, or two changes. Do not recommend more than three changes unless the board is clearly mislabeled.
Each priority update must use the card id and one of: low, normal, high, urgent.`
    : `
Smart Priority is OFF.
Do not relabel or reorganize priorities. Return priorityUpdates as an empty array.`;

  return `
You are a thoughtful productivity assistant reviewing a Kanban board.

Return ONLY valid JSON with exactly these keys:
- summary: string, 2 to 4 natural sentences
- suggestedOrder: array of task titles, ordered from most important to least important for today
- priorityUpdates: array of objects with keys id, priority, and reason

Write the summary as an intelligent daily briefing, not as a list recap.
Infer what matters from the task titles, descriptions, due dates, current user-set priority, dependencies, risk, and current status.
Do not merely repeat every task name or read off every card.
Do not mention hidden implementation details.
Do not include markdown or text outside the JSON.
${smartPriorityInstructions}

Kanban tasks:
${JSON.stringify(tasks, null, 2)}
`;
}

async function callGemini(tasks, smartPriority) {
  const apiKey = process.env.AI_API_KEY;
  const model = process.env.AI_MODEL || 'gemini-2.5-flash';

  if (!apiKey) return null;

  const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;

  const response = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [
        {
          role: 'user',
          parts: [{ text: buildPrompt(tasks, smartPriority) }]
        }
      ],
      generationConfig: {
        temperature: 0.42,
        responseMimeType: 'application/json'
      }
    })
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Gemini error: ${response.status} ${text}`);
  }

  const data = await response.json();
  const content = data?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!content) throw new Error('Gemini returned no content');

  return {
    source: 'gemini',
    ...JSON.parse(cleanJsonText(content))
  };
}

async function callAiProvider(tasks, smartPriority) {
  const provider = process.env.AI_PROVIDER || 'gemini';
  if (provider === 'gemini') return callGemini(tasks, smartPriority);
  return null;
}

function sanitizePriorityUpdates(rawUpdates, tasks, smartPriority) {
  if (!smartPriority || !Array.isArray(rawUpdates)) return [];

  const tasksById = new Map(tasks.map((task) => [Number(task.id), task]));
  const updates = [];

  for (const rawUpdate of rawUpdates) {
    const id = Number(rawUpdate?.id);
    const priority = String(rawUpdate?.priority || '').toLowerCase();
    const task = tasksById.get(id);

    if (!task || task.status === 'Done') continue;
    if (!allowedPriorities.has(priority)) continue;
    if (priority === task.priority) continue;

    updates.push({
      id,
      title: task.title,
      previousPriority: task.priority,
      priority,
      reason: String(rawUpdate?.reason || '').slice(0, 180)
    });
  }

  return updates.slice(0, 3);
}

async function applyPriorityUpdates(priorityUpdates) {
  for (const update of priorityUpdates) {
    await pool.query('UPDATE cards SET priority = ? WHERE id = ?', [update.priority, update.id]);
  }
}

router.post('/daily-summary', async (req, res, next) => {
  try {
    const smartPriority = Boolean(req.body?.smartPriority);
    const [rows] = await pool.query(`
      SELECT cards.id, cards.title, cards.description, cards.priority, cards.due_date, columns_table.name AS status
      FROM cards
      JOIN columns_table ON columns_table.id = cards.column_id
      ORDER BY columns_table.position ASC, cards.position ASC, cards.created_at ASC
    `);

    const tasks = rows.map((row) => ({
      id: row.id,
      title: row.title,
      description: row.description || '',
      priority: row.priority || 'normal',
      dueDate: formatDate(row.due_date),
      status: row.status
    }));

    try {
      const aiSummary = await callAiProvider(tasks, smartPriority);
      if (aiSummary) {
        const priorityUpdates = sanitizePriorityUpdates(aiSummary.priorityUpdates, tasks, smartPriority);
        if (priorityUpdates.length) await applyPriorityUpdates(priorityUpdates);
        return res.json({ ...aiSummary, priorityUpdates });
      }
    } catch (aiError) {
      console.warn('Falling back to local summary:', aiError.message);
    }

    res.json(localFallbackSummary(tasks));
  } catch (error) {
    next(error);
  }
});

export default router;
