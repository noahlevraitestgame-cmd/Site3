const express = require("express");
const http = require("http");
const { Server } = require("socket.io");
const fs = require("fs");
const path = require("path");
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const { v4: uuidv4 } = require("uuid");

const SECRET = "supersecretkey";
const app = express();
const server = http.createServer(app);
const io = new Server(server);
const PORT = 3000;

app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

const usersFile = path.join(__dirname, "users.json");
const messagesFile = path.join(__dirname, "messages.json");

function readJSON(file) {
  if (!fs.existsSync(file)) return { users: [] , messages: []};
  return JSON.parse(fs.readFileSync(file, "utf8"));
}
function writeJSON(file, data) {
  fs.writeFileSync(file, JSON.stringify(data, null, 2));
}

// API Register
app.post("/api/register", (req, res) => {
  const { username, password } = req.body;
  if (!username || !password) return res.status(400).json({ error: "Données invalides" });

  let data = readJSON(usersFile);
  if (data.users.find(u => u.username === username)) {
    return res.status(400).json({ error: "Utilisateur déjà existant" });
  }
  const hash = bcrypt.hashSync(password, 8);
  const user = { id: uuidv4(), username, password: hash, role: "user" };
  data.users.push(user);
  writeJSON(usersFile, data);
  res.json({ success: true });
});

// API Login
app.post("/api/login", (req, res) => {
  const { username, password } = req.body;
  let data = readJSON(usersFile);
  const user = data.users.find(u => u.username === username);
  if (!user || !bcrypt.compareSync(password, user.password)) {
    return res.status(400).json({ error: "Identifiants invalides" });
  }
  const token = jwt.sign({ id: user.id, username: user.username, role: user.role }, SECRET, { expiresIn: "2h" });
  res.json({ token });
});

// Middleware Auth
function authMiddleware(socket, next) {
  const token = socket.handshake.auth.token;
  if (!token) return next(new Error("Pas de token"));
  try {
    const decoded = jwt.verify(token, SECRET);
    socket.user = decoded;
    next();
  } catch (e) {
    next(new Error("Token invalide"));
  }
}

io.use(authMiddleware);

io.on("connection", (socket) => {
  console.log("Utilisateur connecté:", socket.user.username);

  // Joindre salon global par défaut
  socket.join("global");

  // Message normal
  socket.on("chatMessage", ({ room, text }) => {
    const msg = {
      id: uuidv4(),
      user: socket.user.username,
      room: room || "global",
      text,
      reactions: {},
      timestamp: Date.now()
    };
    let data = readJSON(messagesFile);
    data.messages.push(msg);
    writeJSON(messagesFile, data);
    io.to(msg.room).emit("chatMessage", msg);
  });

  // Changer de salon
  socket.on("joinRoom", (room) => {
    socket.join(room);
    socket.emit("system", `Tu as rejoint #${room}`);
  });

  // Message privé
  socket.on("privateMessage", ({ to, text }) => {
    let data = readJSON(usersFile);
    const target = data.users.find(u => u.username === to);
    if (!target) return socket.emit("system", "Utilisateur introuvable");

    const msg = {
      id: uuidv4(),
      from: socket.user.username,
      to,
      text,
      timestamp: Date.now()
    };
    io.sockets.sockets.forEach(s => {
      if (s.user && s.user.username === to) {
        s.emit("privateMessage", msg);
      }
    });
    socket.emit("privateMessage", msg);
  });

  // Réactions
  socket.on("reactMessage", ({ msgId, emoji }) => {
    let data = readJSON(messagesFile);
    const msg = data.messages.find(m => m.id === msgId);
    if (msg) {
      msg.reactions[emoji] = (msg.reactions[emoji] || 0) + 1;
      writeJSON(messagesFile, data);
      io.to(msg.room).emit("updateMessage", msg);
    }
  });

  // Modération: suppression (si admin)
  socket.on("deleteMessage", (msgId) => {
    if (socket.user.role !== "admin") return;
    let data = readJSON(messagesFile);
    data.messages = data.messages.filter(m => m.id !== msgId);
    writeJSON(messagesFile, data);
    io.emit("deleteMessage", msgId);
  });

  // Kick utilisateur (si admin)
  socket.on("kickUser", (username) => {
    if (socket.user.role !== "admin") return;
    for (let [id, s] of io.of("/").sockets) {
      if (s.user.username === username) {
        s.disconnect(true);
      }
    }
  });

  socket.on("disconnect", () => {
    console.log("Déconnecté:", socket.user.username);
  });
});

server.listen(PORT, () => console.log("Serveur sur http://localhost:" + PORT));
