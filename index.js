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
import XLSX from "xlsx";
import AdmZip from "adm-zip";

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

const uploadExcel = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.(xlsx|xls)$/i.test(file.originalname);
    cb(ok ? null : new Error("Only .xlsx / .xls files are accepted"), ok);
  },
});

const uploadZip = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 200 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ok = /\.zip$/i.test(file.originalname);
    cb(ok ? null : new Error("Only .zip files are accepted"), ok);
  },
});

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
app.use("/products_images", (_req, res, next) => {
  res.setHeader("Cross-Origin-Resource-Policy", "cross-origin");
  next();
}, express.static(path.join(__dirname, "products_images")));

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

    return res.status(200).json({ accessToken, username: user.username, role: user.role, unique_id: user.unique_id });
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

    return res.status(200).json({ accessToken, username: user.username, role: user.role, unique_id: user.unique_id });
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

// ─── Public Catalog (no auth) ──────────────────────────────────────────────────

app.get("/catalog/products", async (_req, res) => {
  try {
    const [rows] = await pool.promise().query(
      "SELECT unique_id, name, brand, code, sku, category, description, price_list, stock, image_filename FROM products WHERE status = 'PUBLISHED' ORDER BY brand, name"
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error("GET /catalog/products error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/catalog/brands", async (_req, res) => {
  try {
    const [rows] = await pool.promise().query(
      "SELECT DISTINCT brand FROM products WHERE status = 'PUBLISHED' AND brand IS NOT NULL ORDER BY brand"
    );
    return res.status(200).json(rows.map(r => r.brand));
  } catch (err) {
    console.error("GET /catalog/brands error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Products (read for pickers) ───────────────────────────────────────────────

app.get("/products", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.promise().query(
      "SELECT unique_id, name, brand, code, sku, description, category, price_list, stock FROM products WHERE status = 'PUBLISHED' ORDER BY brand, code"
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error("GET /products error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/products/bulk-upload", requireAuth, uploadExcel.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No se recibió ningún archivo" });

  let rows;
  try {
    const wb = XLSX.read(req.file.buffer, { type: "buffer" });
    const ws = wb.Sheets[wb.SheetNames[0]];
    rows = XLSX.utils.sheet_to_json(ws, { defval: null });
  } catch {
    return res.status(400).json({ message: "No se pudo leer el archivo Excel" });
  }

  if (!rows.length) return res.status(400).json({ message: "La hoja está vacía" });

  const records = rows
    .map(r => [
      String(r["name"] ?? "").trim() || null,
      r["brand"] ?? null,
      String(r["code"] ?? "").trim(),
      String(r["sku"] ?? "").trim() || null,
      r["description"] ?? null,
      r["category"] ?? null,
      r["image_filename"] ?? null,
      parseFloat(r["price_list"] ?? 0) || 0,
      1, // stock: all imported products are in stock
    ])
    .filter(r => r[2]); // code is required

  if (!records.length) return res.status(400).json({ message: "No se encontraron filas válidas (code es requerido)" });

  const conn = await pool.promise().getConnection();
  try {
    await conn.beginTransaction();

    const sql = `
      INSERT INTO products (name, brand, code, sku, description, category, image_filename, price_list, stock)
      VALUES ?
      ON DUPLICATE KEY UPDATE
        name           = VALUES(name),
        brand          = VALUES(brand),
        sku            = VALUES(sku),
        description    = VALUES(description),
        category       = VALUES(category),
        image_filename = VALUES(image_filename),
        price_list     = VALUES(price_list),
        stock          = VALUES(stock)
    `;
    const [result] = await conn.query(sql, [records]);

    await conn.commit();
    return res.status(200).json({
      inserted: result.affectedRows - result.changedRows,
      updated: result.changedRows,
      total: records.length,
    });
  } catch (err) {
    await conn.rollback();
    console.error("POST /products/bulk-upload error:", err);
    return res.status(500).json({ message: "Error al guardar los productos — se revirtieron todos los cambios" });
  } finally {
    conn.release();
  }
});

// ─── Product Images Bulk Upload ────────────────────────────────────────────────

app.post("/products/images/bulk-upload", requireAuth, uploadZip.single("file"), async (req, res) => {
  if (!req.file) return res.status(400).json({ message: "No se recibió ningún archivo" });

  const ALLOWED = /\.(jpe?g|png|webp|gif)$/i;
  const destDir = path.join(__dirname, "products_images");

  let zip;
  try {
    zip = new AdmZip(req.file.buffer);
  } catch {
    return res.status(400).json({ message: "No se pudo leer el archivo ZIP" });
  }

  const entries = zip.getEntries().filter(e =>
    !e.isDirectory && ALLOWED.test(e.name) && !e.entryName.startsWith("__MACOSX")
  );

  if (!entries.length) return res.status(400).json({ message: "El ZIP no contiene imágenes válidas" });

  const saved = [];
  for (const entry of entries) {
    const filename = path.basename(entry.name);
    zip.extractEntryTo(entry, destDir, false, true);
    saved.push(filename);
  }

  return res.status(200).json({ saved: saved.length, filenames: saved });
});

// ─── Clients ───────────────────────────────────────────────────────────────────

app.get("/clients", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.promise().query(
      "SELECT unique_id, name, rfc, email, phone, address, source, tier, created_at FROM clients ORDER BY name"
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error("GET /clients error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/clients", requireAuth, async (req, res) => {
  try {
    const { name, rfc, email, phone, address, source, tier } = req.body;
    if (!name?.trim())
      return res.status(400).json({ message: "name is required" });
    if (!email?.trim() && !phone?.trim())
      return res.status(400).json({ message: "email or phone is required" });

    const unique_id = crypto.randomUUID();
    await pool.promise().query(
      "INSERT INTO clients (unique_id, name, rfc, email, phone, address, source, tier) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
      [unique_id, name.trim(), rfc?.trim() || null, email?.trim() || null, phone?.trim() || null, address?.trim() || null, source || "manual", tier?.trim() || null]
    );
    const [rows] = await pool.promise().query(
      "SELECT unique_id, name, rfc, email, phone, address, source, tier, created_at FROM clients WHERE unique_id = ?",
      [unique_id]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    console.error("POST /clients error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.put("/clients/:id", requireAuth, async (req, res) => {
  try {
    const { name, rfc, email, phone, address, source, tier } = req.body;
    const fields = [];
    const values = [];
    if (name !== undefined)    { fields.push("name = ?");    values.push(name.trim()); }
    if (rfc !== undefined)     { fields.push("rfc = ?");     values.push(rfc?.trim() || null); }
    if (email !== undefined)   { fields.push("email = ?");   values.push(email?.trim() || null); }
    if (phone !== undefined)   { fields.push("phone = ?");   values.push(phone?.trim() || null); }
    if (address !== undefined) { fields.push("address = ?"); values.push(address?.trim() || null); }
    if (source !== undefined)  { fields.push("source = ?");  values.push(source); }
    if (tier !== undefined)    { fields.push("tier = ?");    values.push(tier?.trim() || null); }
    if (fields.length === 0)
      return res.status(400).json({ message: "No fields to update" });

    values.push(req.params.id);
    const [result] = await pool.promise().query(
      `UPDATE clients SET ${fields.join(", ")} WHERE unique_id = ?`, values
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Client not found" });
    return res.status(200).json({ message: "Updated" });
  } catch (err) {
    console.error("PUT /clients/:id error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/clients/:id", requireAuth, requireAdmin, async (req, res) => {
  try {
    const [result] = await pool.promise().query(
      "DELETE FROM clients WHERE unique_id = ?", [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Client not found" });
    return res.status(200).json({ message: "Deleted" });
  } catch (err) {
    console.error("DELETE /clients/:id error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Client Special Prices ─────────────────────────────────────────────────────

app.get("/clients/:id/special-prices", requireAuth, async (req, res) => {
  try {
    const [rows] = await pool.promise().query(
      `SELECT csp.unique_id, csp.client_id, csp.product_id,
              p.code AS product_code, p.description AS product_description, p.brand AS product_brand,
              p.price_ex_tax AS list_price_ex_tax,
              csp.price_ex_tax, csp.notes, csp.valid_until
       FROM client_special_prices csp
       LEFT JOIN products p ON p.unique_id = csp.product_id
       WHERE csp.client_id = ?
       ORDER BY p.brand, p.code`,
      [req.params.id]
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error("GET /clients/:id/special-prices error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/clients/:id/special-prices", requireAuth, async (req, res) => {
  try {
    const { product_id, price_ex_tax, notes, valid_until } = req.body;
    if (!product_id)
      return res.status(400).json({ message: "product_id is required" });
    if (price_ex_tax == null)
      return res.status(400).json({ message: "price_ex_tax is required" });

    const unique_id = crypto.randomUUID();
    await pool.promise().query(
      "INSERT INTO client_special_prices (unique_id, client_id, product_id, price_ex_tax, notes, valid_until) VALUES (?, ?, ?, ?, ?, ?)",
      [unique_id, req.params.id, product_id, price_ex_tax, notes?.trim() || null, valid_until || null]
    );
    const [rows] = await pool.promise().query(
      `SELECT csp.unique_id, csp.client_id, csp.product_id,
              p.code AS product_code, p.description AS product_description, p.brand AS product_brand,
              p.price_ex_tax AS list_price_ex_tax,
              csp.price_ex_tax, csp.notes, csp.valid_until
       FROM client_special_prices csp
       LEFT JOIN products p ON p.unique_id = csp.product_id
       WHERE csp.unique_id = ?`,
      [unique_id]
    );
    return res.status(201).json(rows[0]);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Ya existe un precio especial para este producto" });
    console.error("POST /clients/:id/special-prices error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.put("/clients/:id/special-prices/:priceId", requireAuth, async (req, res) => {
  try {
    const { price_ex_tax, notes, valid_until } = req.body;
    const fields = [];
    const values = [];
    if (price_ex_tax !== undefined) { fields.push("price_ex_tax = ?"); values.push(price_ex_tax); }
    if (notes !== undefined)        { fields.push("notes = ?");        values.push(notes?.trim() || null); }
    if (valid_until !== undefined)  { fields.push("valid_until = ?");  values.push(valid_until || null); }
    if (fields.length === 0)
      return res.status(400).json({ message: "No fields to update" });

    values.push(req.params.priceId);
    const [result] = await pool.promise().query(
      `UPDATE client_special_prices SET ${fields.join(", ")} WHERE unique_id = ?`, values
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Special price not found" });
    return res.status(200).json({ message: "Updated" });
  } catch (err) {
    console.error("PUT /clients/:id/special-prices/:priceId error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/clients/:id/special-prices/:priceId", requireAuth, async (req, res) => {
  try {
    const [result] = await pool.promise().query(
      "DELETE FROM client_special_prices WHERE unique_id = ? AND client_id = ?",
      [req.params.priceId, req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Special price not found" });
    return res.status(200).json({ message: "Deleted" });
  } catch (err) {
    console.error("DELETE /clients/:id/special-prices/:priceId error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Quotes ────────────────────────────────────────────────────────────────────

app.get("/quotes", requireAuth, async (_req, res) => {
  try {
    const [rows] = await pool.promise().query(
      `SELECT q.unique_id, q.quote_number, q.client_name_snapshot,
              q.date, q.expiry_date, q.subtotal, q.tax_rate, q.tax_amount, q.total,
              q.status, q.created_by,
              COUNT(qi.id) AS items_count
       FROM quotes q
       LEFT JOIN quote_items qi ON qi.quote_id = q.id
       GROUP BY q.id
       ORDER BY q.created_at DESC`
    );
    return res.status(200).json(rows);
  } catch (err) {
    console.error("GET /quotes error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.get("/quotes/:id", requireAuth, async (req, res) => {
  try {
    const [qRows] = await pool.promise().query(
      "SELECT * FROM quotes WHERE unique_id = ?",
      [req.params.id]
    );
    if (!qRows[0]) return res.status(404).json({ message: "Quote not found" });
    const [items] = await pool.promise().query(
      "SELECT * FROM quote_items WHERE quote_id = ? ORDER BY id",
      [qRows[0].id]
    );
    return res.status(200).json({ ...qRows[0], items });
  } catch (err) {
    console.error("GET /quotes/:id error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.post("/quotes", requireAuth, async (req, res) => {
  const conn = await pool.promise().getConnection();
  try {
    const {
      quote_number, client_id, client_name_snapshot, client_tax_id_snapshot,
      client_address_snapshot, expiry_date, subtotal, tax_rate, tax_amount, total, items = [],
    } = req.body;

    if (!quote_number) return res.status(400).json({ message: "quote_number is required" });
    if (subtotal == null || total == null) return res.status(400).json({ message: "subtotal and total are required" });

    const today = new Date();
    const fmtDate = (d) => d.toISOString().slice(0, 10);
    const resolvedExpiry = expiry_date || (() => { const d = new Date(today); d.setDate(d.getDate() + 30); return fmtDate(d); })();
    const created_by = req.user.sub;

    await conn.beginTransaction();

    const [qResult] = await conn.query(
      `INSERT INTO quotes (unique_id, quote_number, client_id, client_name_snapshot,
        client_tax_id_snapshot, client_address_snapshot, date, expiry_date,
        subtotal, tax_rate, tax_amount, total, status, created_by)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'DRAFT', ?)`,
      [quote_number, client_id || null, client_name_snapshot || null,
       client_tax_id_snapshot || null, client_address_snapshot || null,
       fmtDate(today), resolvedExpiry,
       subtotal, tax_rate ?? 0.16, tax_amount, total, created_by]
    );

    const quoteId = qResult.insertId;

    if (items.length > 0) {
      const itemRows = items.map(it => [
        quoteId, it.product_id || null, it.product_name_snapshot,
        it.unit_price, it.quantity, it.price_list ?? 1,
        it.line_subtotal, it.line_tax, it.line_total,
      ]);
      await conn.query(
        `INSERT INTO quote_items (quote_id, product_id, product_name_snapshot,
           unit_price, quantity, price_list, line_subtotal, line_tax, line_total)
         VALUES ?`,
        [itemRows]
      );
    }

    await conn.commit();

    const [[created]] = await conn.query(
      `SELECT q.unique_id, q.quote_number, q.client_name_snapshot,
              q.date, q.expiry_date, q.subtotal, q.tax_rate, q.tax_amount, q.total,
              q.status, q.created_by, COUNT(qi.id) AS items_count
       FROM quotes q LEFT JOIN quote_items qi ON qi.quote_id = q.id
       WHERE q.id = ? GROUP BY q.id`,
      [quoteId]
    );
    return res.status(201).json(created);
  } catch (err) {
    await conn.rollback();
    if (err.code === "ER_DUP_ENTRY")
      return res.status(409).json({ message: "Quote number already exists" });
    console.error("POST /quotes error:", err);
    return res.status(500).json({ message: "Internal server error" });
  } finally {
    conn.release();
  }
});

app.patch("/quotes/:id/status", requireAuth, async (req, res) => {
  try {
    const allowed = ["DRAFT", "SENT", "ACCEPTED", "REJECTED", "EXPIRED"];
    const { status } = req.body;
    if (!allowed.includes(status))
      return res.status(400).json({ message: "Invalid status value" });
    const [result] = await pool.promise().query(
      "UPDATE quotes SET status = ? WHERE unique_id = ?",
      [status, req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Quote not found" });
    return res.status(200).json({ message: "Updated" });
  } catch (err) {
    console.error("PATCH /quotes/:id/status error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

app.delete("/quotes/:id", requireAuth, async (req, res) => {
  try {
    const [result] = await pool.promise().query(
      "DELETE FROM quotes WHERE unique_id = ?",
      [req.params.id]
    );
    if (result.affectedRows === 0)
      return res.status(404).json({ message: "Quote not found" });
    return res.status(200).json({ message: "Deleted" });
  } catch (err) {
    console.error("DELETE /quotes/:id error:", err);
    return res.status(500).json({ message: "Internal server error" });
  }
});

// ─── Start ─────────────────────────────────────────────────────────────────────

app.listen(3001, () => console.log("DomoHome API running on http://localhost:3001"));
