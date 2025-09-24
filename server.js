const express = require("express");
const http = require("http");
const WebSocket = require("ws");
const mysql = require("mysql2/promise");
const axios = require("axios");
const https = require("https");
const path = require("path");
const fs = require("fs");
const multer = require("multer");
const { v4: uuidv4 } = require("uuid");

const UPLOADS_DIR = path.join(__dirname, "uploads");
const VOICE_UPLOADS_DIR = path.join(UPLOADS_DIR, "voices");
const FILE_UPLOADS_DIR = path.join(UPLOADS_DIR, "files");

// Ensure directories exist
[UPLOADS_DIR, VOICE_UPLOADS_DIR, FILE_UPLOADS_DIR].forEach((dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
});

// Multer storage configurations
const voiceStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, VOICE_UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueSuffix = uuidv4();
    cb(null, uniqueSuffix + "-" + safeName);
  },
});

const fileStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, FILE_UPLOADS_DIR);
  },
  filename: (req, file, cb) => {
    const safeName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
    const uniqueSuffix = uuidv4();
    cb(null, uniqueSuffix + "-" + safeName);
  },
});

const uploadVoice = multer({ storage: voiceStorage });
const uploadFile = multer({ storage: fileStorage });

const agent = new https.Agent({
  rejectUnauthorized: false,
});

const SERVER_PORT = process.env.PORT || 3000;
const DB_CONFIG = {
  host: process.env.DB_HOST || "localhost",
  user: process.env.DB_USER || "root",
  password: process.env.DB_PASS || "",
  database: process.env.DB_NAME || "chat_app_db",
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
};

class Database {
  constructor(config) {
    this.pool = mysql.createPool(config);
  }

  async initialize() {
    try {
      await this.pool.getConnection();
      console.log("✅ Database connected");
      // await this.createTables();
    } catch (err) {
      console.error("❌ Database initialization failed:", err);
      throw err;
    }
  }

  // async createTables() {
  //   try {
  //     await this.pool.execute(`
  //       CREATE TABLE IF NOT EXISTS users (
  //         id INT AUTO_INCREMENT PRIMARY KEY,
  //         name VARCHAR(255) NOT NULL,
  //         email VARCHAR(255) UNIQUE NOT NULL,
  //         created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  //       )
  //     `);

  //     await this.pool.execute(`
  //       CREATE TABLE IF NOT EXISTS messages (
  //         id INT AUTO_INCREMENT PRIMARY KEY,
  //         sender_email VARCHAR(255) NOT NULL,
  //         sender_name VARCHAR(255) NOT NULL,
  //         recipient_email VARCHAR(255) NOT NULL,
  //         content TEXT,
  //         message_type VARCHAR(50) NOT NULL DEFAULT 'text',
  //         timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
  //       )
  //     `);
  //     console.log("✅ Tables created");
  //   } catch (err) {
  //     console.error("❌ Table creation error:", err);
  //     throw err;
  //   }
  // }

async saveMessage(
  senderEmail,
  senderName,
  recipientEmail,
  content,
  type = "text",
  fileName = null,
  fileType = null
) {
  try {
    await this.pool.execute(
      `INSERT INTO messages (sender_email, sender_name, recipient_email, content, message_type, file_name, file_type) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [senderEmail, senderName, recipientEmail, content, type, fileName, fileType]
    );
  } catch (err) {
    console.error("❌ Message save error:", err);
  }
}

  // async saveMessage(senderEmail, senderName, recipientEmail, content) {
  //   try {
  //     const response = await axios.post(
  //       "https://py.slichealth.com/ords/phmis/chat/messages",
  //       {
  //         sender_email: senderEmail,
  //         sender_name: senderName,
  //         recipient_email: recipientEmail,
  //         content: content,
  //         message_type: "text",
  //       },
  //       { httpsAgent: agent }
  //     );

  //     console.log("✅ Message saved via API:", response.data);
  //     return response.data;
  //   } catch (err) {
  //     console.error("❌ API Message save error:", err.message);
  //     throw err;
  //   }
  // }

  // async getChatHistory(userEmail, partnerEmail) {
  //   try {
  //     // Fetch directly from your API
  //     const response = await axios.get(
  //       "https://py.slichealth.com/ords/phmis/chat/history",
  //       {
  //         params: { userEmail, partnerEmail },
  //         httpsAgent: agent,
  //       }
  //     );

  //     const rows = response.data.items || response.data;

  //     return rows.map((row) => ({
  //       ...row,
  //       created_at: new Date(row.created_at).toISOString(),
  //     }));
  //   } catch (err) {
  //     console.error("❌ History fetch error:", err.response?.data || err);
  //     return [];
  //   }
  // }

async getChatHistory(userEmail, partnerEmail) {
  try {
    const [rows] = await this.pool.execute(
      `SELECT * FROM messages
       WHERE (sender_email = ? AND recipient_email = ?)
          OR (sender_email = ? AND recipient_email = ?)
       ORDER BY timestamp ASC`,
      [userEmail, partnerEmail, partnerEmail, userEmail]
    );

    return rows.map((row) => ({
      ...row,
      timestamp: new Date(row.timestamp).toISOString(),
    }));
  } catch (err) {
    console.error("❌ History fetch error:", err);
    return [];
  }
}

  async getUserByEmail(email) {
    try {
      const [rows] = await this.pool.execute(
        "SELECT * FROM users WHERE email = ?",
        [email]
      );
      return rows[0] || null;
    } catch (err) {
      console.error("❌ User fetch error:", err);
      return null;
    }
  }

  async createOrUpdateUser(name, email) {
    try {
      const user = await this.getUserByEmail(email);

      if (!user) {
        await this.pool.execute(
          "INSERT INTO users (name, email) VALUES (?, ?)",
          [name, email]
        );
      } else if (user.name !== name) {
        await this.pool.execute("UPDATE users SET name = ? WHERE email = ?", [
          name,
          email,
        ]);
      }

      return true;
    } catch (err) {
      console.error("❌ User update error:", err);
      return false;
    }
  }
}

class ChatServer {
  constructor(port, db) {
    this.port = port;
    this.db = db;
    this.clients = new Map();
    this.adminClient = null;

    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocket.Server({ server: this.server });

    this.configureMiddleware();
    this.setupWebSocket();
  }

  configureMiddleware() {
    this.app.use(express.static("public"));
    this.app.use(express.json({ limit: "50mb" }));

    // Serve uploaded files
    this.app.use("/uploads", express.static(UPLOADS_DIR));

    // Voice upload endpoint
    this.app.post(
      "/api/upload/voice",
      uploadVoice.single("voice"),
      async (req, res) => {
        try {
          if (!req.file)
            return res.status(400).json({ error: "No file uploaded" });

          const filePath = `/uploads/voices/${req.file.filename}`;
          res.json({ success: true, path: filePath });
        } catch (err) {
          console.error("❌ Voice upload error:", err);
          res.status(500).json({ error: "Voice upload failed" });
        }
      }
    );

    // File upload endpoint
    this.app.post(
      "/api/upload/file",
      uploadFile.single("file"),
      async (req, res) => {
        try {
          if (!req.file)
            return res.status(400).json({ error: "No file uploaded" });

          const filePath = `/uploads/files/${req.file.filename}`;
          res.json({
            success: true,
            path: filePath,
            fileName: req.file.originalname,
            fileType: req.file.mimetype,
          });
        } catch (err) {
          console.error("❌ File upload error:", err);
          res.status(500).json({ error: "File upload failed" });
        }
      }
    );

    this.app.get("/api/users", async (req, res) => {
      try {
        const [rows] = await this.db.pool.execute("SELECT * FROM users");
        res.json(rows);
      } catch (err) {
        console.error("User fetch error:", err);
        res.status(500).send("Server error");
      }
    });
  }

  setupWebSocket() {
    this.wss.on("connection", (ws) => this.handleConnection(ws));
  }

  handleConnection(ws) {
    const clientId = uuidv4(); // ✅ unique client ID
    this.clients.set(ws, {
      id: clientId,
      authenticated: false,
      type: "connecting",
      name: null,
      email: null,
    });

    ws.on("message", (data) => this.handleMessage(ws, data));
    ws.on("close", () => this.handleDisconnect(ws));
    ws.on("error", (err) => this.handleError(ws, err));
  }

  async handleMessage(ws, data) {
    const client = this.clients.get(ws);
    if (!client) return;

    try {
      const message = JSON.parse(data.toString());

      switch (message.type) {
        case "admin-info":
          await this.handleAdminAuth(ws, message, client);
          break;
        case "user-info":
          await this.handleUserAuth(ws, message, client);
          break;
        case "admin-message":
          await this.handleAdminMessage(ws, client, message);
          break;
        case "user-message":
          await this.handleUserMessage(ws, client, message);
          break;
        case "admin-voice":
          await this.handleAdminVoice(ws, client, message);
          break;
        case "user-voice":
          await this.handleUserVoice(ws, client, message);
          break;
        case "admin-file":
          await this.handleAdminFile(ws, client, message);
          break;
        case "user-file":
          await this.handleUserFile(ws, client, message);
          break;
        case "request-chat-history":
          await this.handleHistoryRequest(ws, client, message);
          break;
        case "request-user-list":
          this.sendOnlineUsers();
          break;
        default:
          console.warn(`⚠️ Unknown message type: ${message.type}`);
      }
    } catch (err) {
      console.error("❌ Message processing error:", err);
      this.sendSystemMessage(ws, "Malformed message received.");
    }
  }
  async handleAdminAuth(ws, message, client) {
    // single-admin policy (as in your original)
    if (this.adminClient && this.adminClient !== ws) {
      ws.close(4000, "Admin already connected");
      return;
    }

    const admin = await this.db.getUserByEmail(message.email);
    if (!admin) {
      ws.close(4001, "Invalid admin credentials");
      return;
    }

    client.type = "admin";
    client.name = admin.name;
    client.email = admin.email;
    client.authenticated = true;
    this.adminClient = ws;

    this.sendToClient(ws, { type: "auth-success", email: admin.email });
    this.sendOnlineUsers();
  }

  async handleUserAuth(ws, message, client) {
    const { name, email } = message;

    if (!name || !email) {
      ws.close(4002, "Name and email required");
      return;
    }

    const success = await this.db.createOrUpdateUser(name, email);
    if (!success) {
      ws.close(4003, "Server error");
      return;
    }

    client.type = "user";
    client.name = name;
    client.email = email;
    client.authenticated = true;

    this.sendToClient(ws, { type: "auth-success", email });
    this.sendOnlineUsers();
  }

  async handleAdminMessage(ws, client, message) {
    const msgType = message.messageType || "text"; // text or voice
    const payload = {
      type: "admin-message",
      content: message.content, // text OR file path
      sender: client.name,
      senderEmail: client.email,
      recipient: message.recipient,
      messageType: msgType,
      timestamp: new Date().toISOString(),
    };

    this.sendToRecipient(message.recipient, payload);
    this.sendToClient(ws, payload);

    await this.db.saveMessage(
      client.email,
      client.name,
      message.recipient,
      message.content,
      msgType
    );
  }

  async handleUserMessage(ws, client, message) {
    const msgType = message.messageType || "text"; // text or voice
    const payload = {
      type: "user-message",
      content: message.content, // text OR file path
      sender: client.name,
      senderEmail: client.email,
      recipient: message.recipient,
      messageType: msgType,
      timestamp: new Date().toISOString(),
    };

    this.sendToRecipient(message.recipient, payload);
    this.sendToClient(ws, payload);

    await this.db.saveMessage(
      client.email,
      client.name,
      message.recipient,
      message.content,
      msgType
    );
  }

  async handleAdminVoice(ws, client, message) {
    const payload = {
      type: "admin-voice",
      content: message.content,
      fileName: message.fileName,
      fileType: message.fileType,
      sender: client.name,
      senderEmail: client.email,
      recipient: message.recipient,
      timestamp: new Date().toISOString(),
    };

    this.sendToRecipient(message.recipient, payload);
    this.sendToClient(ws, payload);

    await this.db.saveMessage(
      client.email,
      client.name,
      message.recipient,
      message.content,
      "voice",
      message.fileName,
      message.fileType
    );
  }

  async handleUserVoice(ws, client, message) {
    const payload = {
      type: "user-voice",
      content: message.content,
      fileName: message.fileName,
      fileType: message.fileType,
      sender: client.name,
      senderEmail: client.email,
      recipient: message.recipient,
      timestamp: new Date().toISOString(),
    };

    this.sendToRecipient(message.recipient, payload);
    this.sendToClient(ws, payload);

    await this.db.saveMessage(
      client.email,
      client.name,
      message.recipient,
      message.content,
      "voice",
      message.fileName,
      message.fileType
    );
  }

  async handleAdminFile(ws, client, message) {
    const payload = {
      type: "admin-file",
      content: message.content,
      fileName: message.fileName,
      fileType: message.fileType,
      isImage: message.isImage,
      isVideo: message.isVideo,
      sender: client.name,
      senderEmail: client.email,
      recipient: message.recipient,
      timestamp: new Date().toISOString(),
    };

    this.sendToRecipient(message.recipient, payload);
    this.sendToClient(ws, payload);

    await this.db.saveMessage(
      client.email,
      client.name,
      message.recipient,
      message.content,
      "file",
      message.fileName,
      message.fileType
    );
  }

  async handleUserFile(ws, client, message) {
    const payload = {
      type: "user-file",
      content: message.content,
      fileName: message.fileName,
      fileType: message.fileType,
      isImage: message.isImage,
      isVideo: message.isVideo,
      sender: client.name,
      senderEmail: client.email,
      recipient: message.recipient,
      timestamp: new Date().toISOString(),
    };

    this.sendToRecipient(message.recipient, payload);
    this.sendToClient(ws, payload);

    await this.db.saveMessage(
      client.email,
      client.name,
      message.recipient,
      message.content,
      "file",
      message.fileName,
      message.fileType
    );
  }

  async handleHistoryRequest(ws, client, message) {
    const partnerEmail = message.userEmail;
    if (!partnerEmail) {
      this.sendSystemMessage(ws, "Partner email required for history.");
      return;
    }

    const history = await this.db.getChatHistory(client.email, partnerEmail);
    this.sendToClient(ws, {
      type: "chat-history",
      messages: history,
    });
  }

  handleDisconnect(ws) {
    const client = this.clients.get(ws);
    if (!client) return;

    console.log(`Client disconnected: ${client.email || "unknown"}`);

    if (client.type === "admin") {
      this.adminClient = null;
    }

    this.clients.delete(ws);
    this.sendOnlineUsers();
  }

  sendOnlineUsers() {
    const onlineUsers = Array.from(this.clients.values())
      .filter((c) => c.authenticated)
      .map((c) => ({ name: c.name, email: c.email, type: c.type }));

    this.clients.forEach((client, ws) => {
      if (ws.readyState === WebSocket.OPEN && client.authenticated) {
        this.sendToClient(ws, { type: "user-list", users: onlineUsers });
      }
    });
  }

  handleError(ws, err) {
    console.error("WebSocket error:", err);
    try {
      this.sendSystemMessage(ws, "WebSocket error occurred.");
    } finally {
      ws.close();
    }
  }

  sendToRecipient(email, payload) {
    for (const [ws, client] of this.clients) {
      if (client.email === email && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(payload));
        break;
      }
    }
  }

  sendToClient(ws, payload) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(payload));
    }
  }

  sendSystemMessage(ws, content) {
    this.sendToClient(ws, {
      type: "system-message",
      content,
    });
  }

  start() {
    return new Promise((resolve) => {
      this.server.listen(this.port, () => {
        console.log(`✅ Server running on http://localhost:${this.port}`);
        resolve();
      });
    });
  }
}

// Main application
async function main() {
  try {
    const db = new Database(DB_CONFIG);
    await db.initialize();

    const chatServer = new ChatServer(SERVER_PORT, db);
    await chatServer.start();
  } catch (err) {
    console.error("❌ Application failed to start:", err);
    process.exit(1);
  }
}

main();