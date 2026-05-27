import mysql from 'mysql2/promise';

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: process.env.DB_USER || 'kanban_user',
  password: process.env.DB_PASSWORD || 'kanban_password',
  database: process.env.DB_NAME || 'kanban',
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});
