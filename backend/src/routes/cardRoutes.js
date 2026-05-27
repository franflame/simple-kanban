import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();
const allowedPriorities = new Set(['low', 'normal', 'high', 'urgent']);

function cleanCardInput(body, partial = false) {
  const input = {};

  if (!partial || body.title !== undefined) {
    const title = String(body.title || '').trim();
    if (!title) {
      const error = new Error('Title is required');
      error.status = 400;
      throw error;
    }
    input.title = title;
  }

  if (!partial || body.column_id !== undefined) {
    const columnId = Number(body.column_id);
    if (!Number.isInteger(columnId) || columnId < 1) {
      const error = new Error('Valid column_id is required');
      error.status = 400;
      throw error;
    }
    input.column_id = columnId;
  }

  if (!partial || body.description !== undefined) {
    input.description = body.description ? String(body.description).trim() : null;
  }

  if (!partial || body.priority !== undefined) {
    const priority = String(body.priority || 'normal').toLowerCase();
    if (!allowedPriorities.has(priority)) {
      const error = new Error('Priority must be low, normal, high, or urgent');
      error.status = 400;
      throw error;
    }
    input.priority = priority;
  }

  if (!partial || body.due_date !== undefined) {
    input.due_date = body.due_date || null;
  }

  return input;
}

async function nextPosition(columnId) {
  const [[row]] = await pool.query('SELECT COALESCE(MAX(position), 0) + 1 AS next_position FROM cards WHERE column_id = ?', [columnId]);
  return row.next_position;
}

router.post('/', async (req, res, next) => {
  try {
    const input = cleanCardInput(req.body);
    const position = await nextPosition(input.column_id);

    const [result] = await pool.query(
      `INSERT INTO cards (column_id, title, description, priority, due_date, position)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [input.column_id, input.title, input.description, input.priority, input.due_date, position]
    );

    const [[card]] = await pool.query('SELECT * FROM cards WHERE id = ?', [result.insertId]);
    res.status(201).json(card);
  } catch (error) {
    next(error);
  }
});

router.put('/:id', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const input = cleanCardInput(req.body, true);
    const fields = Object.keys(input);

    if (!fields.length) {
      const error = new Error('No updates provided');
      error.status = 400;
      throw error;
    }

    const setClause = fields.map((field) => `${field} = ?`).join(', ');
    await pool.query(`UPDATE cards SET ${setClause} WHERE id = ?`, [...fields.map((field) => input[field]), id]);

    const [[card]] = await pool.query('SELECT * FROM cards WHERE id = ?', [id]);
    if (!card) {
      const error = new Error('Card not found');
      error.status = 404;
      throw error;
    }

    res.json(card);
  } catch (error) {
    next(error);
  }
});

router.put('/:id/move', async (req, res, next) => {
  try {
    const id = Number(req.params.id);
    const columnId = Number(req.body.column_id);

    if (!Number.isInteger(columnId) || columnId < 1) {
      const error = new Error('Valid column_id is required');
      error.status = 400;
      throw error;
    }

    const position = await nextPosition(columnId);
    await pool.query('UPDATE cards SET column_id = ?, position = ? WHERE id = ?', [columnId, position, id]);

    const [[card]] = await pool.query('SELECT * FROM cards WHERE id = ?', [id]);
    if (!card) {
      const error = new Error('Card not found');
      error.status = 404;
      throw error;
    }

    res.json(card);
  } catch (error) {
    next(error);
  }
});

router.delete('/:id', async (req, res, next) => {
  try {
    const [result] = await pool.query('DELETE FROM cards WHERE id = ?', [Number(req.params.id)]);
    if (result.affectedRows === 0) {
      const error = new Error('Card not found');
      error.status = 404;
      throw error;
    }
    res.status(204).send();
  } catch (error) {
    next(error);
  }
});

export default router;
