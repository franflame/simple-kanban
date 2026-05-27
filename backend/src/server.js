import 'dotenv/config';
import express from 'express';
import cors from 'cors';
import boardRoutes from './routes/boardRoutes.js';
import cardRoutes from './routes/cardRoutes.js';
import aiRoutes from './routes/aiRoutes.js';

const app = express();
const port = Number(process.env.PORT || 5000);

app.use(cors());
app.use(express.json());

app.get('/api/health', (_req, res) => {
  res.json({ ok: true, service: 'kanban-ai-backend' });
});

app.use('/api/board', boardRoutes);
app.use('/api/cards', cardRoutes);
app.use('/api/ai', aiRoutes);

app.use((err, _req, res, _next) => {
  console.error(err);
  res.status(err.status || 500).json({ message: err.message || 'Something went wrong' });
});

app.listen(port, () => {
  console.log(`Backend listening on port ${port}`);
});
