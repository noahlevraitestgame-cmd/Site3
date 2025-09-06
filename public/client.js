// client.js avec gestion admin
const socket = io({ auth: { token: null } });
let currentRoom = "global";
let token = null;
let me = null;
let role = null;

async function register(username, password) {
  const res = await fetch("/api/register", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return res.json();
}

async function login(username, password) {
  const res = await fetch("/api/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ username, password })
  });
  return res.json();
}

document.getElementById("btnRegister").onclick = async () => {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const res = await register(username, password);
  alert(JSON.stringify(res));
};

document.getElementById("btnLogin").onclick = async () => {
  const username = document.getElementById("username").value;
  const password = document.getElementById("password").value;
  const res = await login(username, password);
  if (res.token) {
    token = res.token;
    socket.auth.token = token;
    me = username;
    document.getElementById("me").innerText = "Connecté en tant que " + username;
    socket.connect();
    const payload = JSON.parse(atob(res.token.split('.')[1]));
    role = payload.role;
    if(role === "admin") document.getElementById("adminPanel").classList.remove("hidden");
  } else {
    alert("Erreur login");
  }
};

document.getElementById("form").onsubmit = (e) => {
  e.preventDefault();
  const text = document.getElementById("msgInput").value;
  if (text.trim()) {
    socket.emit("chatMessage", { room: currentRoom, text });
    document.getElementById("msgInput").value = "";
  }
};

document.querySelectorAll(".room").forEach(btn => {
  btn.onclick = () => {
    currentRoom = btn.dataset.room;
    socket.emit("joinRoom", currentRoom);
    document.getElementById("messagesArea").innerHTML = "";
  };
});

document.getElementById("pmTo").addEventListener("keydown", (e) => {
  if (e.key === "Enter") {
    const to = e.target.value;
    const text = prompt("Message à " + to);
    if (text) socket.emit("privateMessage", { to, text });
  }
});

socket.on("chatMessage", (msg) => {
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `<b>${msg.user}</b>: ${msg.text} <span style='font-size:10px;color:#999'>${new Date(msg.timestamp).toLocaleTimeString()}</span>`;
  div.onclick = () => {
    if(role === "admin" && confirm("Supprimer ce message ?")) socket.emit("deleteMessage", msg.id);
    else {
      const emoji = prompt("Réaction ? 😀 ❤️ 👍");
      if (emoji) socket.emit("reactMessage", { msgId: msg.id, emoji });
    }
  };
  document.getElementById("messagesArea").appendChild(div);
});

socket.on("privateMessage", (msg) => {
  alert(`PM de ${msg.from || me} à ${msg.to || me}: ${msg.text}`);
});

socket.on("deleteMessage", (msgId) => {
  document.querySelectorAll(".msg").forEach(div => {
    if(div.dataset && div.dataset.id === msgId) div.remove();
  });
});

socket.on("system", (text) => {
  const div = document.createElement("div");
  div.className = "msg";
  div.innerHTML = `<i>${text}</i>`;
  document.getElementById("messagesArea").appendChild(div);
});

document.getElementById("btnShowUsers").onclick = () => {
  const usersList = document.getElementById("usersList");
  usersList.innerHTML = "<i>Fonction kick non connectée à la base (demo)</i>";
};
