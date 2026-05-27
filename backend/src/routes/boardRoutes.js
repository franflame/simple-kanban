import { Router } from 'express';
import { pool } from '../db.js';

const router = Router();

router.get('/', async (_req, res, next) => {
  try {
    const [columns] = await pool.query('SELECT * FROM columns_table ORDER BY position ASC');
    const [cards] = await pool.query('SELECT * FROM cards ORDER BY column_id ASC, position ASC, created_at ASC');

    const board = columns.map((column) => ({
      ...column,
      cards: cards.filter((card) => card.column_id === column.id)
    }));

    res.json(board);
  } catch (error) {
    next(error);
  }
});

export default router;
