"use client";

import { FormEvent, PointerEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";

type User = { id: string; name: string; email: string; color: string };
type Member = { userId: string; name: string; color: string; role: "owner" | "editor" | "viewer"; joinedAt: string };
type Room = {
  id: string; code: string; title: string; ownerId: string; members: Member[];
  memberCount: number; viewOnly: boolean; strokeSeq: number; thumbnail: string | null;
  role: Member["role"];
};
type Stroke = {
  _id?: string; id?: string; strokeId: string; part: number; userId: string;
  tool: "pen" | "highlighter" | "line" | "rect" | "ellipse";
  color: string; width: number; points: number[]; seq: number;
};
type ChatMessage = { id?: string; _id?: string; userId: string; userName: string; text: string; createdAt: string };
type ApiResult<T> = T & { error?: string; details?: unknown };

const colors = ["#20243A", "#4F46E5", "#DB2777", "#0891B2", "#16A34A", "#EA580C"];
const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "";

async function api<T>(path: string, token: string, init?: RequestInit): Promise<ApiResult<T>> {
  const response = await fetch(`${API_BASE}/api${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
      ...init?.headers,
    },
  });
  const data = await response.json().catch(() => ({})) as ApiResult<T>;
  if (!response.ok) throw new Error(data.error ?? `Request failed (${response.status}).`);
  return data;
}

function displayError(error: unknown) {
  return error instanceof Error ? error.message : "Something went wrong.";
}

export default function Home() {
  const [token, setToken] = useState("");
  const [user, setUser] = useState<User | null>(null);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [activeRoom, setActiveRoom] = useState<Room | null>(null);
  const [strokes, setStrokes] = useState<Stroke[]>([]);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [formBusy, setFormBusy] = useState(false);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [newTitle, setNewTitle] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [chatText, setChatText] = useState("");
  const [tool, setTool] = useState<Stroke["tool"]>("pen");
  const [color, setColor] = useState(colors[0]);
  const [width, setWidth] = useState(0.004);
  const [draftTitle, setDraftTitle] = useState("");
  const [busy, setBusy] = useState(false);
  const draft = useRef<number[]>([]);
  const drawing = useRef(false);
  const svgRef = useRef<SVGSVGElement>(null);
  const chatEndRef = useRef<HTMLDivElement>(null);
  const maxSeq = useMemo(() => Math.max(0, ...strokes.map((stroke) => stroke.seq ?? 0)), [strokes]);
  const canDraw = activeRoom?.role !== "viewer" && (!activeRoom?.viewOnly || activeRoom.role === "owner");
  const isOwner = activeRoom?.role === "owner";

  const loadRooms = useCallback(async (authToken: string) => {
    const data = await api<{ rooms: Room[] }>("/rooms", authToken);
    setRooms(data.rooms);
  }, []);

  const loadRoom = useCallback(async (roomCode: string, authToken: string) => {
    const [roomData, strokeData, messageData] = await Promise.all([
      api<{ room: Room }>(`/rooms/${roomCode}`, authToken),
      api<{ strokes: Stroke[] }>(`/rooms/${roomCode}/strokes`, authToken),
      api<{ messages: ChatMessage[] }>(`/rooms/${roomCode}/messages`, authToken),
    ]);
    setActiveRoom(roomData.room);
    setDraftTitle(roomData.room.title);
    setStrokes(strokeData.strokes);
    setMessages(messageData.messages);
  }, []);

  useEffect(() => {
    const savedToken = window.localStorage.getItem("sketchroom-token");
    if (!savedToken) return;
    setToken(savedToken);
    void (async () => {
      try {
        const data = await api<{ user: User }>("/auth/me", savedToken);
        setUser(data.user);
        await loadRooms(savedToken);
      } catch {
        window.localStorage.removeItem("sketchroom-token");
        setToken("");
      }
    })();
  }, [loadRooms]);

  useEffect(() => {
    if (!token || !activeRoom) return;
    const timer = window.setInterval(() => {
      void (async () => {
        try {
          const [strokeData, messageData, roomData] = await Promise.all([
            api<{ strokes: Stroke[] }>(`/rooms/${activeRoom.code}/strokes?afterSeq=${maxSeq}`, token),
            api<{ messages: ChatMessage[] }>(`/rooms/${activeRoom.code}/messages`, token),
            api<{ room: Room }>(`/rooms/${activeRoom.code}`, token),
          ]);
          if (strokeData.strokes.length) {
            setStrokes((current) => [...current, ...strokeData.strokes.filter((next) =>
              !current.some((existing) => existing.strokeId === next.strokeId && existing.part === next.part))]);
          }
          setMessages(messageData.messages);
          setActiveRoom(roomData.room);
        } catch {
          // A transient poll failure should not interrupt drawing or chat.
        }
      })();
    }, 2500);
    return () => window.clearInterval(timer);
  }, [activeRoom, maxSeq, token]);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function submitAuth(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setFormBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      const path = mode === "register" ? "/auth/register" : "/auth/login";
      const data = await api<{ token: string; user: User }>(path, "", {
        method: "POST",
        body: JSON.stringify({
          ...(mode === "register" ? { name: form.get("name") } : {}),
          email: form.get("email"),
          password: form.get("password"),
        }),
      });
      window.localStorage.setItem("sketchroom-token", data.token);
      setToken(data.token);
      setUser(data.user);
      await loadRooms(data.token);
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setFormBusy(false);
    }
  }

  function signOut() {
    window.localStorage.removeItem("sketchroom-token");
    setToken("");
    setUser(null);
    setRooms([]);
    setActiveRoom(null);
    setError("");
  }

  async function createRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newTitle.trim()) return;
    await runAction(async () => {
      const data = await api<{ room: Room }>("/rooms", token, {
        method: "POST",
        body: JSON.stringify({ title: newTitle }),
      });
      setNewTitle("");
      await loadRooms(token);
      await loadRoom(data.room.code, token);
      setNotice("Board created. Share its six-character code to invite a teammate.");
    });
  }

  async function joinRoom(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    await runAction(async () => {
      const data = await api<{ room: Room }>("/rooms/join", token, {
        method: "POST",
        body: JSON.stringify({ code: joinCode.toUpperCase() }),
      });
      setJoinCode("");
      await loadRooms(token);
      await loadRoom(data.room.code, token);
      setNotice(`Joined ${data.room.title}.`);
    });
  }

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setError("");
    setNotice("");
    try {
      await action();
    } catch (reason) {
      setError(displayError(reason));
    } finally {
      setBusy(false);
    }
  }

  function pointFromEvent(event: PointerEvent<SVGSVGElement>) {
    const bounds = event.currentTarget.getBoundingClientRect();
    return [
      Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
      Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height)),
    ];
  }

  function startStroke(event: PointerEvent<SVGSVGElement>) {
    if (!canDraw || !activeRoom) return;
    event.currentTarget.setPointerCapture(event.pointerId);
    drawing.current = true;
    draft.current = pointFromEvent(event);
    setStrokes((current) => [...current]);
  }

  function moveStroke(event: PointerEvent<SVGSVGElement>) {
    if (!drawing.current) return;
    draft.current.push(...pointFromEvent(event));
    setStrokes((current) => [...current]);
  }

  async function endStroke() {
    if (!drawing.current || !activeRoom || !token) return;
    drawing.current = false;
    const points = draft.current;
    draft.current = [];
    if (points.length < 4) return;
    const strokeId = crypto.randomUUID();
    const pending: Stroke = {
      strokeId, part: 0, userId: user?.id ?? "", tool, color, width, points, seq: 0,
    };
    setStrokes((current) => [...current, pending]);
    try {
      const data = await api<{ stroke: Stroke }>(`/rooms/${activeRoom.code}/strokes`, token, {
        method: "POST",
        body: JSON.stringify({ strokeId, part: 0, tool, color, width, points }),
      });
      setStrokes((current) => current.map((stroke) =>
        stroke.strokeId === strokeId && stroke.part === 0 ? data.stroke : stroke));
    } catch (reason) {
      setStrokes((current) => current.filter((stroke) => stroke.strokeId !== strokeId));
      setError(displayError(reason));
    }
  }

  async function deleteStroke(strokeId: string) {
    if (!activeRoom) return;
    await runAction(async () => {
      await api(`/rooms/${activeRoom.code}/strokes/${encodeURIComponent(strokeId)}`, token, { method: "DELETE" });
      setStrokes((current) => current.filter((stroke) => stroke.strokeId !== strokeId));
    });
  }

  async function sendMessage(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeRoom || !chatText.trim()) return;
    const text = chatText;
    setChatText("");
    await runAction(async () => {
      const data = await api<{ message: ChatMessage }>(`/rooms/${activeRoom.code}/messages`, token, {
        method: "POST", body: JSON.stringify({ text }),
      });
      setMessages((current) => current.some((message) => message.id === data.message.id)
        ? current : [...current, data.message]);
    });
  }

  async function changeMemberRole(member: Member, role: "editor" | "viewer") {
    if (!activeRoom) return;
    await runAction(async () => {
      await api(`/rooms/${activeRoom.code}/members/${member.userId}`, token, {
        method: "PATCH", body: JSON.stringify({ role }),
      });
      await loadRoom(activeRoom.code, token);
    });
  }

  async function kickMember(member: Member) {
    if (!activeRoom || !window.confirm(`Remove ${member.name} from this room?`)) return;
    await runAction(async () => {
      await api(`/rooms/${activeRoom.code}/members/${member.userId}`, token, { method: "DELETE" });
      await loadRoom(activeRoom.code, token);
    });
  }

  async function copyRoomCode() {
    if (!activeRoom) return;
    try {
      await navigator.clipboard.writeText(activeRoom.code);
      setNotice("Room code copied.");
    } catch {
      setNotice(`Room code: ${activeRoom.code}`);
    }
  }

  const uniqueStrokes = useMemo(() => {
    const map = new Map<string, Stroke>();
    for (const stroke of strokes) map.set(stroke.strokeId, stroke);
    return [...map.values()].sort((a, b) => a.seq === 0 ? 1 : b.seq === 0 ? -1 : a.seq - b.seq);
  }, [strokes]);

  if (!user || !token) {
    return (
      <main className="auth-page">
        <section className="auth-card">
          <div className="brand-mark">S</div>
          <p className="eyebrow">SKETCHROOM · COLLABORATIVE CANVAS</p>
          <h1>{mode === "login" ? "Make space for ideas." : "Create your workspace."}</h1>
          <p className="muted">A shared whiteboard for thinking out loud, together.</p>
          <form onSubmit={submitAuth} className="auth-form">
            {mode === "register" && <label>Your name<input name="name" minLength={2} maxLength={60} required placeholder="Alex Morgan" /></label>}
            <label>Email address<input name="email" type="email" required autoComplete="email" placeholder="you@college.edu" /></label>
            <label>Password<input name="password" type="password" minLength={mode === "register" ? 8 : 1} maxLength={128} required autoComplete={mode === "login" ? "current-password" : "new-password"} placeholder="At least 8 characters" /></label>
            {error && <p className="error-message">{error}</p>}
            <button className="primary-button wide-button" disabled={formBusy}>{formBusy ? "One moment..." : mode === "login" ? "Sign in" : "Create account"}</button>
          </form>
          <p className="switch-auth">
            {mode === "login" ? "New to SketchRoom?" : "Already have an account?"}{" "}
            <button onClick={() => { setMode(mode === "login" ? "register" : "login"); setError(""); }}>
              {mode === "login" ? "Create an account" : "Sign in"}
            </button>
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand-row"><span className="brand-mark small">S</span><strong>SketchRoom</strong></div>
        <div className="workspace-label">YOUR WORKSPACE <span>{rooms.length}</span></div>
        <div className="room-list">
          {rooms.map((room) => (
            <button key={room.code} className={`room-link ${activeRoom?.code === room.code ? "selected" : ""}`}
              onClick={() => void runAction(() => loadRoom(room.code, token))}>
              <span className="room-icon">▱</span><span className="room-link-copy"><strong>{room.title}</strong><small>{room.memberCount} members · {room.code}</small></span>
            </button>
          ))}
          {rooms.length === 0 && <p className="empty-sidebar">Your boards will show up here.</p>}
        </div>
        <div className="sidebar-bottom">
          <div className="profile"><span className="avatar" style={{ background: user.color }}>{user.name.slice(0, 1).toUpperCase()}</span><span><strong>{user.name}</strong><small>{user.email}</small></span></div>
          <button className="text-button signout" onClick={signOut}>Sign out</button>
        </div>
      </aside>

      <section className="main-panel">
        <header className="topbar">
          <div><p className="eyebrow">YOUR CREATIVE SPACE</p><h1>{activeRoom?.title ?? "Good ideas start here."}</h1></div>
          <div className="topbar-actions"><span className="secure-pill"><i /> API connected</span><button className="avatar mini-avatar" title={user.name} style={{ background: user.color }}>{user.name.slice(0, 1).toUpperCase()}</button></div>
        </header>

        {(error || notice) && <div className={error ? "toast error-toast" : "toast success-toast"}>{error || notice}<button onClick={() => { setError(""); setNotice(""); }}>×</button></div>}

        {!activeRoom ? (
          <div className="home-content">
            <div className="welcome-block"><div><p className="eyebrow">A LITTLE ROOM TO THINK</p><h2>Bring your ideas<br />to the same page.</h2><p>Start a board for a project or join a teammate with their room code.</p></div><div className="welcome-art" aria-hidden="true"><span>✳</span><i /><b /></div></div>
            <div className="action-grid">
              <form className="action-card" onSubmit={createRoom}><div className="action-icon purple">＋</div><h3>Create a new board</h3><p>Start with a blank canvas and invite collaborators.</p><div className="inline-form"><input value={newTitle} onChange={(event) => setNewTitle(event.target.value)} maxLength={80} required placeholder="Give your board a name" /><button className="primary-button" disabled={busy}>Create</button></div></form>
              <form className="action-card" onSubmit={joinRoom}><div className="action-icon mint">↗</div><h3>Join a board</h3><p>Have a room code? Enter it to jump in.</p><div className="inline-form"><input className="code-input" value={joinCode} onChange={(event) => setJoinCode(event.target.value.toUpperCase())} maxLength={6} required placeholder="6-digit code" /><button className="secondary-button" disabled={busy}>Join</button></div></form>
            </div>
            <div className="section-heading"><h3>Your recent boards</h3><span>{rooms.length} total</span></div>
            {rooms.length ? <div className="board-grid">{rooms.map((room) => <button key={room.code} className="board-card" onClick={() => void runAction(() => loadRoom(room.code, token))}><div className="board-preview">{room.thumbnail ? <img src={room.thumbnail} alt="" /> : <div className="preview-lines"><span /><span /><span /></div>}<span className="board-member-count">{room.memberCount} people</span></div><span className="board-card-title">{room.title}</span><small>{room.code} · {room.role}</small></button>)}</div> : <div className="empty-state"><span>⌘</span><strong>No boards just yet</strong><p>Create your first board above, or ask a teammate for an invite code.</p></div>}
          </div>
        ) : (
          <div className="board-page">
            <div className="board-toolbar">
              <button className="text-button back-button" onClick={() => { setActiveRoom(null); void loadRooms(token); }}>← All boards</button>
              <div className="room-meta"><button className="room-code" onClick={() => void copyRoomCode()} title="Copy invite code">{activeRoom.code} <span>⧉</span></button><span className="member-count">{activeRoom.memberCount} members</span></div>
              <div className="room-actions">
                {isOwner && <><button className="text-button" onClick={() => void runAction(async () => { const data = await api<{ room: Room }>(`/rooms/${activeRoom.code}`, token, { method: "PATCH", body: JSON.stringify({ title: draftTitle }) }); setActiveRoom(data.room); setNotice("Board title saved."); })}>Save title</button><button className="text-button danger-text" onClick={() => void runAction(async () => { if (!window.confirm("Clear every stroke on this board?")) return; await api(`/rooms/${activeRoom.code}/clear`, token, { method: "POST", body: "{}" }); setStrokes([]); setNotice("Board cleared."); })}>Clear</button></>}
                <button className="text-button danger-text" onClick={() => void runAction(async () => { if (isOwner) { if (!window.confirm("Delete this board and its history?")) return; await api(`/rooms/${activeRoom.code}`, token, { method: "DELETE" }); } else { await api(`/rooms/${activeRoom.code}/leave`, token, { method: "POST", body: "{}" }); } setActiveRoom(null); await loadRooms(token); setNotice(isOwner ? "Board deleted." : "You left the board."); })}>{isOwner ? "Delete board" : "Leave board"}</button>
              </div>
            </div>

            {isOwner && <div className="room-settings"><label>Board title<input value={draftTitle} onChange={(event) => setDraftTitle(event.target.value)} maxLength={80} /></label><label className="toggle-label"><input type="checkbox" checked={activeRoom.viewOnly} onChange={(event) => void runAction(async () => { const data = await api<{ room: Room }>(`/rooms/${activeRoom.code}`, token, { method: "PATCH", body: JSON.stringify({ viewOnly: event.target.checked }) }); setActiveRoom(data.room); })} /> View-only mode</label></div>}

            <div className="canvas-layout">
              <div className="canvas-column">
                <div className="drawing-tools">
                  <div className="tool-buttons">{(["pen", "highlighter", "line", "rect", "ellipse"] as const).map((value) => <button key={value} disabled={!canDraw} className={tool === value ? "tool active-tool" : "tool"} onClick={() => setTool(value)} title={value}>{value === "pen" ? "✎" : value === "highlighter" ? "▰" : value === "line" ? "／" : value === "rect" ? "▱" : "◯"}</button>)}</div>
                  <div className="color-buttons">{colors.map((value) => <button key={value} className={color === value ? "color-swatch selected-swatch" : "color-swatch"} style={{ background: value }} onClick={() => setColor(value)} aria-label={`Select ${value}`} />)}</div>
                  <label className="width-picker" title="Stroke width"><span>Width</span><input type="range" min="0.001" max="0.018" step="0.001" value={width} onChange={(event) => setWidth(Number(event.target.value))} /></label>
                  {!canDraw && <span className="view-only-hint">Drawing is disabled for this room.</span>}
                </div>
                <div className={`canvas-frame ${canDraw ? "can-draw" : ""}`}>
                  <svg ref={svgRef} viewBox="0 0 1000 625" preserveAspectRatio="none"
                    onPointerDown={startStroke} onPointerMove={moveStroke}
                    onPointerUp={() => void endStroke()} onPointerCancel={() => void endStroke()}>
                    {strokes.map((stroke, index) => {
                      const allPoints = drawing.current && index === strokes.length - 1 ? draft.current : stroke.points;
                      const pairs = Array.from({ length: Math.floor(allPoints.length / 2) }, (_, i) => [allPoints[i * 2] * 1000, allPoints[i * 2 + 1] * 625]);
                      const path = pairs.map(([x, y], i) => `${i === 0 ? "M" : "L"} ${x} ${y}`).join(" ");
                      return <path key={`${stroke.strokeId}-${stroke.part}`} d={path} fill="none" stroke={stroke.color} strokeWidth={stroke.width * 1000} strokeLinecap="round" strokeLinejoin="round" opacity={stroke.tool === "highlighter" ? 0.35 : 1} />;
                    })}
                    {drawing.current && draft.current.length >= 2 && <path d={Array.from({ length: Math.floor(draft.current.length / 2) }, (_, i) => `${i ? "L" : "M"} ${draft.current[i * 2] * 1000} ${draft.current[i * 2 + 1] * 625}`).join(" ")} fill="none" stroke={color} strokeWidth={width * 1000} strokeLinecap="round" strokeLinejoin="round" opacity={tool === "highlighter" ? 0.35 : 1} />}
                  </svg>
                  {!strokes.length && !drawing.current && <div className="canvas-empty"><span>✳</span><p>Your next idea goes here.</p><small>Pick a tool and draw on the board.</small></div>}
                </div>
                <div className="canvas-footer"><span>{strokes.length} stroke parts · autosaves to the API</span><span className="save-status"><i /> Saved</span></div>
                {uniqueStrokes.length > 0 && <details className="stroke-history"><summary>Stroke history ({uniqueStrokes.length})</summary><div>{uniqueStrokes.slice(-20).reverse().map((stroke) => <div key={stroke.strokeId}><span><i style={{ background: stroke.color }} />{stroke.tool} · {stroke.userId === user.id ? "you" : "collaborator"} · #{stroke.seq || "pending"}</span><button className="text-button danger-text" onClick={() => void deleteStroke(stroke.strokeId)}>Remove</button></div>)}</div></details>}
              </div>

              <aside className="right-panel">
                <section className="people-card"><div className="panel-title"><h3>People</h3><span>{activeRoom.members.length}</span></div><p className="panel-description">Everyone in this room</p>
                  <div className="people-list">{activeRoom.members.map((member) => <div className="person-row" key={member.userId}><span className="avatar" style={{ background: member.color }}>{member.name.slice(0, 1).toUpperCase()}</span><span className="person-details"><strong>{member.name}{member.userId === user.id ? " (you)" : ""}</strong><small>{member.role}</small></span>{isOwner && member.userId !== user.id ? <div className="member-controls"><select aria-label={`Role for ${member.name}`} value={member.role === "owner" ? "editor" : member.role} onChange={(event) => void changeMemberRole(member, event.target.value as "editor" | "viewer")}><option value="editor">Editor</option><option value="viewer">Viewer</option></select><button title={`Remove ${member.name}`} onClick={() => void kickMember(member)}>×</button></div> : <span className="role-badge">{member.role}</span>}</div>)}</div>
                  <div className="invite-note"><span>✦</span><p>Share the room code <strong>{activeRoom.code}</strong> to invite more people.</p></div>
                </section>
                <section className="chat-card"><div className="panel-title"><h3>Room chat</h3><span className="chat-live">Live</span></div><p className="panel-description">Talk through what you’re making.</p><div className="chat-messages">{messages.map((message, index) => <div className={`chat-message ${message.userId === user.id ? "own-message" : ""}`} key={message.id ?? message._id ?? index}><strong>{message.userName}</strong><p>{message.text}</p><small>{new Date(message.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}</small></div>)}{messages.length === 0 && <div className="chat-empty">Say hello to your team 👋</div>}<div ref={chatEndRef} /></div><form className="chat-form" onSubmit={sendMessage}><input value={chatText} onChange={(event) => setChatText(event.target.value)} maxLength={500} placeholder="Write a message..." /><button disabled={!chatText.trim() || busy} aria-label="Send message">↑</button></form></section>
              </aside>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
