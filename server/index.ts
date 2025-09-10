import http from "http";
import express from "express";
import cors from "cors";
import { Server } from "socket.io";

// ----------------------------
// Types
// ----------------------------
type Player = {
  id: string;
  name: string;
  color: string;
  avatar: string;
  progress: number;
  score: number;
  streak: number;
  socketId?: string;
};

type MCQ = { id: string; q: string; choices: string[]; answerIndex: number };

type GameStateWire = {
  started: boolean;
  timeLeft: number;
  question: MCQ | null;
  players: Player[];
  finished: string[]; // player ids (top 3)
};

// ----------------------------
// Static content (demo)
// ----------------------------
const QUESTIONS: MCQ[] = [
  { id: "q1", q: "What does the server do in this game?", choices: ["Draws cars only", "Keeps time, tallies scores, referees the race", "Picks random", "Streams music"], answerIndex: 1 },
  { id: "q2", q: "A correct answer does what?", choices: ["Brakes", "Teleports back", "Moves forward", "Changes color"], answerIndex: 2 },
  { id: "q3", q: "How many winners are crowned?", choices: ["1", "2", "3", "Unlimited"], answerIndex: 2 },
  { id: "q4", q: "Fair play means…", choices: ["Share answers", "Honest answers only", "Turn off timer", "Use two browsers"], answerIndex: 1 },
  { id: "q5", q: "Speed bonus triggers when…", choices: ["Answer quickly", "Refresh page", "Skip", "Change avatar"], answerIndex: 0 },
];

const AVATARS = ["🚗", "🏎️", "🚙", "🚕", "🚓", "🛻", "🚐", "🚘"];

const TRACK_LEN = 100;
const BASE_PUSH = 18;
const clamp = (n: number, min = 0, max = 100) => Math.max(min, Math.min(max, n));
const uid = () => Math.random().toString(36).slice(2, 9);

// ----------------------------
// Room model
// ----------------------------
class GameRoom {
  id: string;
  started = false;
  currentIndex = 0;
  timeLeft = 20;
  players: Map<string, Player> = new Map();
  finishedOrder: string[] = [];
  interval?: ReturnType<typeof setInterval>;
  answered: Set<string> = new Set(); // one answer per player per question

  constructor(id: string, private io: Server) { this.id = id; }

  join(socketId: string, name: string, color: string): Player {
    const player: Player = {
      id: uid(),
      name: name || `Racer-${Math.floor(Math.random() * 99)}`,
      color,
      avatar: AVATARS[Math.floor(Math.random() * AVATARS.length)],
      progress: 0,
      score: 0,
      streak: 0,
      socketId,
    };
    this.players.set(player.id, player);
    this.emitState();
    return player;
  }

  start() {
    if (this.started) return;
    this.started = true;
    this.currentIndex = 0;
    this.timeLeft = 20;
    this.finishedOrder = [];
    this.answered.clear();
    this.interval = setInterval(() => this.tick(), 1000);
    this.emitState();
  }

  reset() {
    this.started = false;
    this.currentIndex = 0;
    this.timeLeft = 20;
    this.finishedOrder = [];
    this.answered.clear();
    this.players.forEach((p) => { p.progress = 0; p.score = 0; p.streak = 0; });
    if (this.interval) clearInterval(this.interval);
    this.emitState();
  }

  next() {
    if (this.currentIndex < QUESTIONS.length - 1) {
      this.currentIndex += 1;
      this.timeLeft = 20;
      this.answered.clear();
    } else {
      this.started = false;
      if (this.interval) clearInterval(this.interval);
    }
    this.emitState();
  }

  answer(playerId: string, choiceIndex: number) {
    if (!this.started) return;
    const q = QUESTIONS[this.currentIndex];
    if (!q) return;
    if (this.answered.has(playerId)) return;
    const p = this.players.get(playerId);
    if (!p) return;

    this.answered.add(playerId);
    const isCorrect = choiceIndex === q.answerIndex;
    if (!isCorrect) { p.streak = 0; this.emitState(); return; }

    const speedBonus = Math.max(0, this.timeLeft - 5) * 0.8;
    const push = BASE_PUSH + speedBonus + p.streak * 4;
    p.progress = clamp(p.progress + push, 0, TRACK_LEN);
    p.score += Math.round(100 + speedBonus * 5 + p.streak * 10);
    p.streak += 1;

    if (p.progress >= 100 && !this.finishedOrder.includes(p.id) && this.finishedOrder.length < 3) {
      this.finishedOrder.push(p.id);
    }
    this.emitState();
  }

  tick() {
    if (!this.started) return;
    this.timeLeft = Math.max(0, this.timeLeft - 1);
    this.emitState();
    if (this.timeLeft === 0) setTimeout(() => this.next(), 400);
  }

  wire(): GameStateWire {
    return {
      started: this.started,
      timeLeft: this.timeLeft,
      question: QUESTIONS[this.currentIndex] ?? null,
      players: Array.from(this.players.values()),
      finished: this.finishedOrder.slice(0, 3),
    };
  }

  emitState() {
    this.io.to(this.id).emit("state:update", this.wire());
  }
}

// ----------------------------
// Server bootstrap
// ----------------------------
// ----------------------------
// Server bootstrap
// ----------------------------
const app = express();

// (optional but useful) quick health check
app.get("/healthz", (_req, res) => res.status(200).send("ok"));

const ALLOWED = ["https://ai-racing-realtime-skn1.vercel.app"];

app.use(cors({
  origin: (origin, cb) => cb(null, !origin || ALLOWED.includes(origin)),
  methods: ["GET", "POST"],
  credentials: false
}));

const httpServer = http.createServer(app);

const io = new Server(httpServer, {
  cors: { origin: ALLOWED, methods: ["GET","POST"] },
  transports: ["websocket", "polling"] // keep polling until WS is confirmed working
});

const httpServer = http.createServer(app);
const io = new Server(httpServer, {
  cors: { origin: "*", methods: ["GET", "POST"] },
  transports: ["websocket"], // WS only for low-latency
});

const rooms = new Map<string, GameRoom>();
const getRoom = (id: string) => rooms.get(id) || (() => { const r = new GameRoom(id, io); rooms.set(id, r); return r; })();

io.on("connection", (socket) => {
  socket.on("room:join", (payload: Partial<Player> & { roomId?: string }) => {
    const room = getRoom(payload.roomId || "main");
    socket.join(room.id);
    const player = room.join(socket.id, payload.name || "", payload.color || "#00f6ff");
    socket.emit("room:joined", { player });
  });

  socket.on("race:start", ({ roomId }: { roomId?: string } = {}) => getRoom(roomId || "main").start());
  socket.on("race:next",  ({ roomId }: { roomId?: string } = {}) => getRoom(roomId || "main").next());
  socket.on("race:reset", ({ roomId }: { roomId?: string } = {}) => getRoom(roomId || "main").reset());

  socket.on("answer:submit", ({ roomId, playerId, choiceIndex }: { roomId?: string; playerId: string; choiceIndex: number }) => {
    getRoom(roomId || "main").answer(playerId, choiceIndex);
  });
});

const PORT = Number(process.env.PORT || 4000);
httpServer.listen(PORT, () => console.log(`🏁 Realtime server listening on :${PORT}`));
