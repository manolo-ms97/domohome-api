import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import multer from "multer";
import path from "path";
import helmet from "helmet";
import { fileURLToPath } from "url";
import { dirname } from "path";
import mysql2 from "mysql2";
import nodemailer from "nodemailer";
import jwt from "jsonwebtoken";
import bcrypt from "bcrypt";
import crypto from "crypto";
import cookieParser from "cookie-parser";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

dotenv.config();

// ─── File Upload ───────────────────────────────────────────────────────────────

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const category = req.query.category;

    let folder = "";
    if (category === "quote") {
      folder = "quotes_pdfs";
    }

    cb(null, path.join(__dirname, folder));
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + "-" + file.originalname);
  },
});

const uploads = multer({ storage });

// ─── App Setup ─────────────────────────────────────────────────────────────────

const app = express();

app.use(helmet());
const allowedOrigins = [
  process.env.CORS_ORIGIN || "http://localhost:8080",
  process.env.CORS_ORIGIN_CRM_PROD || "https://admin.domohome.mx",
  process.env.CORS_ORIGIN_WEBSITE || "http://localhost:3000",
  process.env.CORS_ORIGIN_WEBSITE_PROD || "https://domohome.mx",
  process.env.CORS_ORIGIN_WEBSITE_PROD_WWW || "https://www.domohome.mx",
];
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) cb(null, true);
    else cb(new Error("Not allowed by CORS"));
  },
  credentials: true,
}));
app.use(cookieParser());
app.use(express.json({ limit: "25mb" }));
app.use(express.urlencoded({ extended: true, limit: "25mb" }));

// ─── Static Files ──────────────────────────────────────────────────────────────

app.use("/quotes_pdfs", express.static(path.join(__dirname, "quotes_pdfs")));

// ─── Database Pool ─────────────────────────────────────────────────────────────

const pool = mysql2.createPool({
  host: process.env.DB_HOST,
  port: process.env.DB_PORT,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_DATABASE,
  waitForConnections: true,
  connectionLimit: 10,
  maxIdle: 10,
  idleTimeout: 60000,
  queueLimit: 0,
  enableKeepAlive: true,
  keepAliveInitialDelay: 0,
});

// ─── Auth ──────────────────────────────────────────────────────────────────────

const REFRESH_COOKIE = "refresh_token";
const REFRESH_DAYS = Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS) || 30;

function signAccessToken(user) {
  return jwt.sign(
    { sub: user.unique_id, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || "15m" }
  );
}

function hashToken(token) {
  return crypto.createHash("sha256").update(token).digest("hex");
}

// POST /auth/login
app.post("/auth/login", async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({ message: "username and password are required" });
    }

    const [rows] = await pool.promise().query(
      "SELECT id, unique_id, name, username, email, password_hash, role, is_active FROM users WHERE username = ?",
      [username]
    );

    const user = rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    const passwordMatch = await bcrypt.compare(password, user.password_hash);
    if (!passwordMatch) {
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // Generate stateful refresh token
    const refreshToken = crypto.randomBytes(64).toString("hex");
    const refreshTokenHash = hashToken(refreshToken);
    const expiresAt = new Date(Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000);

    await pool.promise().query(
      "UPDATE users SET refresh_token_hash = ?, refresh_token_expires_at = ?, last_login = NOW() WHERE id = ?",
      [refreshTokenHash, expiresAt, user.id]
    );

    const accessToken = signAccessToken(user);

    res.cookie(REFRESH_COOKIE, refreshToken, {
      httpOnly: true,
      sameSite: "lax",
      secure: false,
      maxAge: REFRESH_DAYS * 24 * 60 * 60 * 1000,
    });

    return res.status(200).json({ accessToken, username: user.username, role: user.role });
  } catch (err) {
    console.error("auth login error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /auth/refresh
app.post("/auth/refresh", async (req, res) => {
  try {
    const token = req.cookies[REFRESH_COOKIE];

    if (!token) {
      return res.status(401).json({ message: "No refresh token" });
    }

    const tokenHash = hashToken(token);

    const [rows] = await pool.promise().query(
      "SELECT unique_id, name, username, email, role, is_active, refresh_token_expires_at FROM users WHERE refresh_token_hash = ?",
      [tokenHash]
    );

    const user = rows[0];

    if (!user || !user.is_active) {
      return res.status(401).json({ message: "Invalid session" });
    }

    if (new Date(user.refresh_token_expires_at) < new Date()) {
      return res.status(401).json({ message: "Session expired" });
    }

    const accessToken = signAccessToken(user);

    return res.status(200).json({ accessToken, username: user.username, role: user.role });
  } catch (err) {
    console.error("auth refresh error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// POST /auth/logout
app.post("/auth/logout", async (req, res) => {
  try {
    const token = req.cookies[REFRESH_COOKIE];

    if (token) {
      const tokenHash = hashToken(token);
      await pool.promise().query(
        "UPDATE users SET refresh_token_hash = NULL, refresh_token_expires_at = NULL WHERE refresh_token_hash = ?",
        [tokenHash]
      );
    }

    res.clearCookie(REFRESH_COOKIE, { httpOnly: true, sameSite: "lax", secure: false });

    return res.status(200).json({ message: "Logged out" });
  } catch (err) {
    console.error("auth logout error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Auth Middleware ────────────────────────────────────────────────────────────

function requireAuth(req, res, next) {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer "))
    return res.status(401).json({ message: "Unauthorized" });
  try {
    req.user = jwt.verify(auth.slice(7), process.env.JWT_SECRET);
    next();
  } catch {
    return res.status(401).json({ message: "Invalid or expired token" });
  }
}

function requireAdmin(req, res, next) {
  if (req.user?.role !== "admin")
    return res.status(403).json({ message: "Forbidden" });
  next();
}

// ─── Routes ────────────────────────────────────────────────────────────────────

// User management — admin only

app.get("/users", requireAuth, requireAdmin, async (_req, res) => {
  try {
    const [rows] = await pool.promise().query(
      "SELECT unique_id, name, username, email, role, is_active FROM users ORDER BY name"
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error("GET /users error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/users", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { name, username, email, password, role } = req.body;
    if (!name?.trim() || !username?.trim() || !password)
      return res.status(400).json({ message: "name, username, and password are required" });

    const [existing] = await pool.promise().query(
      "SELECT id FROM users WHERE username = ?", [username]
    );
    if (existing.length > 0)
      return res.status(409).json({ message: "Username already exists" });

    const unique_id = crypto.randomUUID();
    const password_hash = await bcrypt.hash(password, 12);
    await pool.promise().query(
      "INSERT INTO users (unique_id, name, username, email, password_hash, role, is_active) VALUES (?, ?, ?, ?, ?, ?, 1)",
      [unique_id, name.trim(), username.trim(), email || null, password_hash, role || "sales"]
    );
    return res.status(201).json({
      unique_id,
      name: name.trim(),
      username: username.trim(),
      email: email || null,
      role: role || "sales",
      is_active: 1,
    });
  } catch (err) {
    console.error("POST /users error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.put("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [target] = await pool.promise().query(
      "SELECT role FROM users WHERE unique_id = ?", [req.params.id]
    );
    if (target.length === 0)
      return res.status(404).json({ message: "User not found" });
    if (target[0].role === "admin")
      return res.status(403).json({ message: "Admin users cannot be modified" });

    const { name, username, email, role, is_active, password } = req.body;
    const fields = [];
    const values = [];

    if (name !== undefined)      { fields.push("name = ?");      values.push(name); }
    if (username !== undefined)  { fields.push("username = ?");  values.push(username); }
    if (email !== undefined)     { fields.push("email = ?");     values.push(email || null); }
    if (role !== undefined)      { fields.push("role = ?");      values.push(role); }
    if (is_active !== undefined) { fields.push("is_active = ?"); values.push(is_active ? 1 : 0); }
    if (password)                { fields.push("password_hash = ?"); values.push(await bcrypt.hash(password, 12)); }

    if (fields.length === 0)
      return res.status(400).json({ message: "No fields to update" });

    values.push(req.params.id);
    await pool.promise().query(
      `UPDATE users SET ${fields.join(", ")} WHERE unique_id = ?`, values
    );

    return res.status(200).json({ message: "Updated" });
  } catch (err) {
    console.error("PUT /users/:id error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/users/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [target] = await pool.promise().query(
      "SELECT role FROM users WHERE unique_id = ?", [req.params.id]
    );
    if (target.length === 0)
      return res.status(404).json({ message: "User not found" });
    if (target[0].role === "admin")
      return res.status(403).json({ message: "Admin users cannot be deleted" });

    await pool.promise().query(
      "DELETE FROM users WHERE unique_id = ?", [req.params.id]
    );
    return res.status(200).json({ message: "Deleted" });
  } catch (err) {
    console.error("DELETE /users/:id error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});



// ─── Brands ────────────────────────────────────────────────────────────────────

app.get("/brands", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.promise().query(
      "SELECT unique_id, brand_name, is_active FROM brands ORDER BY brand_name"
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error("GET /brands error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/brands", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { brand_name } = req.body;
    if (!brand_name?.trim())
      return res.status(400).json({ message: "brand_name is required" });

    const [result] = await pool.promise().query(
      "INSERT INTO brands (brand_name) VALUES (?)",
      [brand_name.trim()]
    );
    const [rows] = await pool.promise().query(
      "SELECT unique_id, brand_name, is_active FROM brands WHERE id = ?",
      [result.insertId]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error("POST /brands error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.put("/brands/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const { brand_name, is_active } = req.body;
    const fields = [];
    const values = [];
    if (brand_name !== undefined) { fields.push("brand_name = ?"); values.push(brand_name.trim()); }
    if (is_active !== undefined)  { fields.push("is_active = ?");  values.push(is_active ? 1 : 0); }
    if (fields.length === 0)
      return res.status(400).json({ message: "No fields to update" });

    values.push(req.params.id);
    const [result] = await pool.promise().query(
      `UPDATE brands SET ${fields.join(", ")} WHERE unique_id = ?`, values
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Brand not found" });
    return res.status(200).json({ message: "Updated" });
  } catch (err) {
    console.error("PUT /brands/:id error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/brands/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.promise().query(
      "DELETE FROM brands WHERE unique_id = ?", [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Brand not found" });
    return res.status(200).json({ message: "Deleted" });
  } catch (err) {
    console.error("DELETE /brands/:id error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Downloadables ─────────────────────────────────────────────────────────────

app.post("/downloadables", async (req, res) => {
  try {
    const { type, name, email, company } = req.body;
    if (!type || !["b2b", "b2c"].includes(type) || !name?.trim() || !email?.trim())
      return res.status(400).json({ message: "type, name, and email are required" });

    await pool.promise().query(
      "INSERT INTO downloadables (type, name, company, email) VALUES (?, ?, ?, ?)",
      [type, name.trim(), company?.trim() || null, email.trim()]
    );
    return res.status(201).json({ message: "Recorded" });
  } catch (err) {
    console.error("POST /downloadables error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/downloadables", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.promise().query(
      "SELECT unique_id, type, name, company, email, submitted_at FROM downloadables ORDER BY submitted_at DESC"
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error("GET /downloadables error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/downloadables/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.promise().query(
      "DELETE FROM downloadables WHERE unique_id = ?", [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Downloadable not found" });
    return res.status(200).json({ message: "Deleted" });
  } catch (err) {
    console.error("DELETE /downloadables/:id error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

app.listen(3001, () => console.log("DomoHome API running on http://localhost:3001"));
