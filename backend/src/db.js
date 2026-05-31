import mysql from 'mysql2/promise';

function requiredEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORT || 3306),
  user: requiredEnv('DB_USER'),
  password: requiredEnv('DB_PASSWORD'),
  database: requiredEnv('DB_NAME'),
  waitForConnections: true,
  connectionLimit: 10,
  namedPlaceholders: true
});
