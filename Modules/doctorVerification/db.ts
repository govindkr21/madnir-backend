import mysql, { Pool, PoolOptions, RowDataPacket, ResultSetHeader } from "mysql2/promise";

const poolConfig: PoolOptions = {
  host: process.env.MYSQL_HOST || "127.0.0.1",
  port: Number(process.env.MYSQL_PORT || 3306),
  user: process.env.MYSQL_USER || "root",
  password: process.env.MYSQL_PASSWORD || "",
  database: process.env.MYSQL_DATABASE || "doctor_app",
  waitForConnections: true,
  connectionLimit: Number(process.env.MYSQL_POOL_SIZE || 10),
  queueLimit: 0,
  charset: "utf8mb4_unicode_ci",
  timezone: "Z",
  enableKeepAlive: true,
  keepAliveInitialDelay: 10_000,
};

let pool: Pool | null = null;

export function getPool(): Pool {
  if (!pool) pool = mysql.createPool(poolConfig);
  return pool;
}

export async function closePool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}

export async function query<T extends RowDataPacket[]>(
  sql: string,
  params: ReadonlyArray<unknown> = []
): Promise<T> {
  const [rows] = await getPool().execute<T>(sql, params as unknown[]);
  return rows;
}

export async function execute(
  sql: string,
  params: ReadonlyArray<unknown> = []
): Promise<ResultSetHeader> {
  const [result] = await getPool().execute<ResultSetHeader>(sql, params as unknown[]);
  return result;
}
