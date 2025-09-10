import React, { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "framer-motion";
import { io } from "socket.io-client";

// ---------- Tron styles ----------
const TronGlobal = () => (
  <style>{`
    :root{ --tron-cyan:#00f6ff; --tron-purple:#a855f7; --tron-bg:#05080c; }
    body { background:
      radial-gradient(1200px 700px at 50% -10%, rgba(168,85,247,.25), transparent 40%),
      radial-gradient(900px 600px at 110% 10%, rgba(0,246,255,.18), transparent 35%),
      var(--tron-bg) !important; color: #cffafe; }
    .tron-scanlines::after{ content:""; position:fixed; inset:0; pointer-events:none; mix-blend-mode:screen;
      background: repeating-linear-gradient(to bottom, rgba(0,246,255,.04), rgba(0,246,255,.04) 1px, transparent 2px, transparent 3px); }
    .neon-card{ background: linear-gradient(180deg, rgba(3,8,15,.9), rgba(7,12,18,.9));
      border:1px solid rgba(103,255,246,.22); box-shadow: 0 0 24px rgba(0,246,255,.08), inset 0 0 24px rgba(103,255,246,.06); border-radius: 16px; }
    .neon-button{ border:1px solid rgba(0,246,255,.5); box-shadow: 0 0 12px rgba(0,246,255,.35); border-radius: 10px; }
    .neon-button:hover{ box-shadow: 0 0 24px rgba(0,246,255,.5); }
    .animate-neon-flicker { animation: tronFlicker 2.2s infinite alternate; }
    @keyframes tronFlicker { 0%,19%,21%,23%,25%,54%,56%,100% { opacity:1 } 20%,24%,55% { opacity:.3 } }
    .tron-grid{
      background-image: linear-gradient(to right, rgba(0,246,255,0.12) 1px, transparent 1px),
                        linear-gradient(to bottom, rgba(0,246,255,0.12) 1px, transparent 1px);
      background-size: 44px 44px; border-radius: 16px;
    }
    .light-trail{ position:relative; }
    .light-trail::after{ content:""; position:absolute; top:50%; transform:translateY(-50%); left:-48px; width:48px; height:6px;
      background: linear-gradient(to right, transparent, var(--tron-cyan)); filter: blur(4px); opacity:.85; }
  `}</style>
);

// ---------- Types ----------
type Player = { id: string; name: string; color: string; avatar: string; progress: number; score: number; streak: number; };
type MCQ = { id: string; q: string; choices: string[]; answerIndex: number };
type Wire = { started: boolean; timeLeft: number; question: MCQ | null; players: Player[]; finished: string[] };

// ---------- Helpers ----------
const COLORS = ["#00f6ff", "#67fff6", "#22d3ee", "#38bdf8", "#a855f7", "#06b6d4"];
const clamp = (n:number,min=0,max=100)=>Math.max(min,Math.min(max,n));

// ---------- Socket URL ----------
const SOCKET_URL =
  (import.meta as any)?.env?.VITE_SOCKET_URL ||
  (typeof window !== "undefined" && (window as any).__SOCKET_URL__) ||
  "http://localhost:4000";

// ---------- App ----------
export default function GameApp(){
  return (
    <div className="min-h-screen tron-scanlines selection:bg-cyan-400/20">
      <TronGlobal />
      <main className="max-w-6xl mx-auto p-6">
        <GameInner />
      </main>
    </div>
  );
}

function GameInner(){
  const socketRef = useRef<ReturnType<typeof io> | null>(null);

  const [me, setMe] = useState<Player | null>(null);
  const [players, setPlayers] = useState<Player[]>([]);
  const [started, setStarted] = useState(false);
  const [finished, setFinished] = useState<string[]>([]);
  const [timeLeft, setTimeLeft] = useState(20);
  const [question, setQuestion] = useState<MCQ | null>(null);
  const [lock, setLock] = useState(false);

  useEffect(() => {
    const s = io(SOCKET_URL, { transports: ["websocket"], autoConnect: true });
    socketRef.current = s;

    s.on("room:joined", (payload:any) => setMe(payload.player));
    s.on("state:update", (w:Wire) => {
      setPlayers(w.players || []);
      setStarted(!!w.started);
      setQuestion(w.question || null);
      setTimeLeft(w.timeLeft ?? 0);
      setFinished(w.finished || []);
      setLock(false);
    });

    return () => { s.disconnect(); };
  }, []);

  function join(name: string, color: string){
    socketRef.current?.emit("room:join", { name, color });
  }
  function start(){ socketRef.current?.emit("race:start", {}); setLock(false); }
  function next(){ socketRef.current?.emit("race:next", {}); }
  function reset(){ socketRef.current?.emit("race:reset", {}); }

  function answer(choiceIndex: number){
    if (!me || !started || lock) return;
    setLock(true);
    socketRef.current?.emit("answer:submit", { playerId: me.id, choiceIndex });
  }

  const leaderboard = useMemo(() => [...players].sort((a,b)=> b.progress - a.progress || b.score - a.score), [players]);

  return (
    <div className="grid gap-6">
      <header className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-7 w-7 rounded-full bg-cyan-400/20 border border-cyan-300/40" />
          <h1 className="text-2xl font-semibold tracking-wider animate-neon-flicker">Neon Speedway · AI Racing</h1>
        </div>
        <div className="text-xs text-cyan-200/80">Fair Play · Honest answers only</div>
      </header>

      {!me ? <Lobby onJoin={join} /> : (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 grid gap-6">
            <Track players={players} finished={finished} />

            <div className="neon-card p-5 grid gap-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2 text-cyan-200">
                  <div className="h-2 w-2 rounded-full bg-cyan-300" />
                  <span className="font-medium">Time left:</span>
                  <span className="tabular-nums">{timeLeft}s</span>
                </div>
                <div className="flex items-center gap-3">
                  {!started ? (
                    <button onClick={start} className="neon-button bg-cyan-500/10 text-cyan-100 px-3 py-1.5 text-sm">Start Race</button>
                  ) : (
                    <button onClick={next} className="neon-button bg-cyan-500/10 text-cyan-100 px-3 py-1.5 text-sm">Next</button>
                  )}
                  <button onClick={reset} className="text-cyan-200 px-2 py-1.5 text-sm">Reset</button>
                </div>
              </div>

              <div className="grid gap-2">
                <h3 className="text-lg font-semibold text-cyan-100">
                  {question ? `Q: ${question.q}` : "Waiting for next question…"}
                </h3>
                <div className="grid sm:grid-cols-2 gap-3">
                  {(question?.choices || []).map((c, i) => (
                    <motion.button key={i} whileTap={{ scale: 0.98 }} onClick={() => answer(i)}
                      disabled={!started || lock}
                      className={`text-left rounded-2xl border p-3 transition neon-button ${!started ? "opacity-40 cursor-not-allowed" : "hover:bg-cyan-500/10"} ${lock ? "opacity-70" : ""}`}>
                      <div className="font-medium text-cyan-100">{c}</div>
                    </motion.button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          <aside className="grid gap-6">
            <div className="neon-card p-5">
              <div className="mb-4 text-cyan-200 font-semibold">Racers</div>
              <div className="grid gap-3">
                {players.map((p) => (
                  <div key={p.id} className="flex items-center gap-3">
                    <div className="h-6 w-6 rounded-full" style={{ background: p.color }} />
                    <div className="w-full">
                      <div className="flex items-center justify-between text-sm text-cyan-200/90">
                        <span className="font-medium">{p.name}</span>
                        <span>{p.score} pts</span>
                      </div>
                      <div className="h-2 bg-cyan-400/10 rounded mt-1 overflow-hidden">
                        <div className="h-full bg-cyan-400" style={{ width: `${clamp(p.progress)}%` }} />
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="neon-card p-5">
              <div className="mb-3 text-cyan-200 font-semibold">Podium</div>
              <ol className="list-decimal ml-5 space-y-1 text-cyan-100">
                {finished.length === 0 && <div className="text-sm text-cyan-300/70">Be the first to cross the finish line!</div>}
                {finished.slice(0,3).map((id, idx) => {
                  const p = players.find(x => x.id === id); if (!p) return null;
                  return <li key={id} className="text-sm animate-neon-flicker">{p.name} · {idx===0?"🥇":idx===1?"🥈":"🥉"}</li>;
                })}
              </ol>
            </div>
          </aside>
        </div>
      )}

      <div className="text-[11px] text-center text-cyan-300/70 mt-2">Realtime · Server-authoritative · Neon grid engaged 🏁</div>
    </div>
  );
}

function Lobby({ onJoin }: { onJoin: (name:string, color:string) => void }){
  const [name, setName] = useState("");
  const [color, setColor] = useState(COLORS[0]);
  return (
    <div className="neon-card p-6 grid gap-5">
      <div className="grid md:grid-cols-2 gap-6 items-center">
        <div className="grid gap-2">
          <h2 className="text-xl font-semibold text-cyan-100">Join the Race</h2>
          <p className="text-sm text-cyan-300/80">Pick a racer name and color. The server assigns your official racer.</p>
          <div className="grid gap-3 max-w-sm mt-2">
            <label className="text-sm font-medium text-cyan-200">Racer name</label>
            <input value={name} onChange={e=>setName(e.target.value)} placeholder="e.g., Quorra"
                   className="bg-black/30 border border-cyan-300/30 text-cyan-100 rounded px-3 py-2 placeholder:text-cyan-300/50"/>
            <label className="text-sm font-medium mt-3 text-cyan-200">Car color</label>
            <div className="flex gap-2 flex-wrap">
              {COLORS.map(c=>(
                <button key={c} onClick={()=>setColor(c)}
                  className={`h-8 w-8 rounded-xl border neon-button ${color===c?"ring-2 ring-cyan-300 ring-offset-2 ring-offset-cyan-300/10":""}`}
                  style={{ background: c }} aria-label={`Choose ${c}`} />
              ))}
            </div>
            <button onClick={()=>onJoin(name, color)} className="mt-2 w-fit neon-button bg-cyan-500/10 text-cyan-100 px-3 py-2 text-sm">Enter Grid</button>
          </div>
        </div>
        <div className="relative">
          <div className="rounded-3xl border border-cyan-300/30 bg-black/30 p-5 tron-grid">
            <div className="text-sm font-semibold mb-2 text-cyan-100">Demo Preview</div>
            <div className="grid gap-3">
              {[50,70,30].map((w,i)=>(
                <div key={i} className="h-10 rounded-xl bg-black/40 border border-cyan-300/20 flex items-center px-3 gap-2">
                  <div className="h-2 bg-cyan-400/10 rounded w-full overflow-hidden">
                    <div className="h-full bg-cyan-400" style={{ width: `${w}%` }} />
                  </div>
                </div>
              ))}
            </div>
            <div className="text-xs text-cyan-300/70 mt-3">Server asks questions & verifies answers. First three across the line win.</div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Track({ players, finished }: { players: Player[]; finished: string[] }){
  return (
    <div className="neon-card p-5">
      <div className="grid gap-2">
        <h3 className="font-semibold text-cyan-100">Digital Speedway</h3>
        <div className="tron-grid p-4 border border-cyan-300/20 bg-black/20">
          <div className="grid gap-3">
            {players.map((p)=> <Lane key={p.id} player={p} rank={finished.indexOf(p.id)+1} />)}
            {players.length===0 && <div className="text-sm text-cyan-300/70">No racers yet. Join from the lobby!</div>}
          </div>
        </div>
      </div>
    </div>
  );
}

function Lane({ player, rank }: { player: Player; rank: number }){
  const pct = clamp(player.progress, 0, 100);
  return (
    <div className="relative h-16 rounded-xl overflow-hidden bg-black/40 border border-cyan-300/20">
      <div className="absolute inset-y-0 left-0 right-0 grid grid-cols-12">
        {[...Array(12)].map((_,i)=><div key={i} className="border-r border-dashed border-cyan-300/20" />)}
      </div>
      <div className="absolute inset-y-0 right-[2%] w-1 bg-cyan-400 shadow-[0_0_12px_rgba(0,246,255,0.8)]" />
      <motion.div className="absolute top-1/2 -translate-y-1/2 light-trail"
        animate={{ left: `${pct}%` }} transition={{ type: "spring", stiffness: 100, damping: 18 }}>
        <div className="flex items-center gap-2">
          <div className="h-6 w-6 rounded-full" style={{ background: player.color }} />
          <div className="px-3 py-1 rounded-full text-xs font-medium" style={{ background: player.color, color: "#001216" }}>
            {player.name}
          </div>
        </div>
      </motion.div>
      <div className="absolute left-3 top-2 text-[11px] text-cyan-300/80">{player.score} pts</div>
      {rank > 0 && rank <= 3 && <div className="absolute right-3 top-2 text-lg">{rank===1?"🥇":rank===2?"🥈":"🥉"}</div>}
    </div>
  );
}
