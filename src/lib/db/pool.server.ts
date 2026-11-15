import mysql from "mysql2/promise";
import type { Pool, PoolConnection } from "mysql2/promise";

// Connection settings come from the environment. On Hostinger the
// "Setup website database" step writes DB_HOST/DB_PORT/DB_NAME/DB_USER/
// DB_PASSWORD (and DATABASE_URL) into the Node.js app's environment.
let pool: Pool | undefined;

function config() {
  const url = process.env.DATABASE_URL;
  if (url && /^mysql:\/\//.test(url)) {
    const u = new URL(url);
    return {
      host: u.hostname === "localhost" ? "127.0.0.1" : u.hostname,
      port: Number(u.port || 3306),
      user: decodeURIComponent(u.username),
      password: decodeURIComponent(u.password),
      database: u.pathname.replace(/^\//, ""),
    };
  }
  const host = process.env.DB_HOST || "127.0.0.1";
  return {
    host: host === "localhost" ? "127.0.0.1" : host,
    port: Number(process.env.DB_PORT || 3306),
    user: process.env.DB_USER || "",
    password: process.env.DB_PASSWORD || "",
    database: process.env.DB_NAME || "",
  };
}

export function getPool(): Pool {
  if (!pool) {
    const c = config();
    if (!c.database || !c.user) {
      throw new Error("Database is not configured: set DB_HOST, DB_NAME, DB_USER, DB_PASSWORD (or DATABASE_URL).");
    }
    pool = mysql.createPool({
      ...c,
      charset: "utf8mb4",
      timezone: "Z",
      dateStrings: true,
      decimalNumbers: true,
      supportBigNumbers: true,
      bigNumberStrings: false,
      connectionLimit: Number(process.env.DB_POOL_SIZE || 8),
      waitForConnections: true,
      enableKeepAlive: true,
      multipleStatements: false,
    });
    pool.on("connection", (conn) => {
      conn.query("SET time_zone = '+00:00', SESSION sql_mode = 'STRICT_ALL_TABLES,NO_ENGINE_SUBSTITUTION,ERROR_FOR_DIVISION_BY_ZERO'");
    });
  }
  return pool;
}

export type Executor = Pool | PoolConnection;

export async function withTransaction<T>(fn: (conn: PoolConnection) => Promise<T>): Promise<T> {
  const conn = await getPool().getConnection();
  try {
    await conn.beginTransaction();
    const result = await fn(conn);
    await conn.commit();
    return result;
  } catch (e) {
    try {
      await conn.rollback();
    } catch {
      /* ignore */
    }
    throw e;
  } finally {
    conn.release();
  }
}
