import { useEffect, useMemo, useState } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  Bookmark,
  Check,
  ChevronDown,
  Clock3,
  FileText,
  Filter,
  Lightbulb,
  LockKeyhole,
  MessageCircle,
  Plus,
  Search,
  Shield,
  Sparkles,
  StickyNote,
  UserRound,
  Video,
  X,
  ZoomIn,
} from "lucide-react";
import type { CaseView, Evidence, Suspect } from "@mystery/shared";
const api = async <T,>(path: string, init?: RequestInit): Promise<T> => {
  const r = await fetch(`/api/v1${path}`, {
    credentials: "include",
    headers: { "Content-Type": "application/json", ...init?.headers },
    ...init,
  });
  const j = await r.json();
  if (!r.ok) throw new Error(j.error?.message || "Something went wrong");
  return j;
};
function useLiveEvidence(initial: Evidence) {
  const [live, setLive] = useState(initial);
  useEffect(() => {
    setLive(initial);
    if (initial.assetStatus !== "pending") return;
    let timer: number | undefined;
    let active = true;
    const poll = async () => {
      try {
        const current = await api<Evidence>(`/cases/${initial.caseId}/evidence/${initial.id}`);
        if (!active) return;
        setLive(current);
        if (current.assetStatus === "pending") timer = window.setTimeout(poll, 1800);
      } catch {
        if (active) timer = window.setTimeout(poll, 3000);
      }
    };
    void poll();
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [initial.id, initial.assetStatus]);
  return live;
}
const icons = {
  chat: MessageCircle,
  image: ZoomIn,
  cctv: Video,
  document: FileText,
  statement: StickyNote,
};
const samples = [
  "A priceless painting disappeared during a rainy evening reception.",
  "A lighthouse keeper vanished the night the beacon went dark.",
  "Someone switched the winning recipe at a small-town bake-off.",
];
export default function App() {
  const loc = useLocation();
  const parts = loc.pathname.split("/").filter(Boolean);
  if (parts[0] === "r" && parts[1]) return <SharePage shareId={parts[1]} />;
  if (parts[0] === "cases" && parts[1] && parts[2] === "timeline")
    return (
      <>
        <LiveProgress caseId={parts[1]} />
        <CaseTimeline id={parts[1]} />
      </>
    );
  if (parts[0] === "cases" && parts[1])
    return (
      <>
        <LiveProgress caseId={parts[1]} />
        <CasePage id={parts[1]} />
        <Link to={`/cases/${parts[1]}/timeline`} className="timeline-access">
          <Clock3 size={14} /> TIMELINE
        </Link>
      </>
    );
  if (parts[0] === "cases") return <CaseHistory />;
  if (parts[0] === "login" || parts[0] === "signup")
    return <AuthPage signup={parts[0] === "signup"} />;
  return (
    <>
      <Home />
      <Link to="/cases" className="home-archive">
        CASE ARCHIVE <ArrowRight size={13} />
      </Link>
    </>
  );
}
function LiveProgress({ caseId }: { caseId: string }) {
  const [progress, setProgress] = useState<any>(null);
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    let alive = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const r = await api<any>(`/cases/${caseId}/progress`);
        if (!alive) return;
        setProgress(r.progress);
        setStatus(r.status);
        if (r.status === "ready" || r.status === "resolved") {
          const key = `case-refresh:${caseId}`;
          if (!sessionStorage.getItem(key)) {
            sessionStorage.setItem(key, "1");
            window.location.reload();
            return;
          }
          sessionStorage.removeItem(key);
          return;
        }
        if (r.status === "failed") {
          const c = await api<any>(`/cases/${caseId}`);
          setError(c.progress?.message || "The case could not be completed.");
          return;
        }
        timer = window.setTimeout(poll, 2000);
      } catch (e) {
        if (alive) {
          setError((e as Error).message);
          setStatus("failed");
        }
      }
    };
    void poll();
    return () => {
      alive = false;
      if (timer) clearTimeout(timer);
    };
  }, [caseId]);
  if (!status || status === "ready" || status === "resolved") return null;
  return (
    <div className="progress-overlay">
      <div className="progress-card" role="status">
        <span className="eyebrow gold">
          {status === "failed" ? "CASE GENERATION STOPPED" : "BUILDING THE CASE FILE"}
        </span>
        <h2>{status === "failed" ? "We hit a snag." : "Following the trail…"}</h2>
        <p>{error || progress?.message || "Preparing the investigation."}</p>
        {status === "failed" ? (
          <button
            className="primary"
            onClick={async () => {
              try {
                await api(`/cases/${caseId}/retry`, { method: "POST" });
                setError("");
                setStatus("generating");
                setTimeout(() => window.location.reload(), 800);
              } catch (e) {
                setError((e as Error).message);
              }
            }}
          >
            RETRY CASE <ArrowRight size={15} />
          </button>
        ) : (
          <>
            <div className="progress-track">
              <span style={{ width: `${progress?.percent || 2}%` }} />
            </div>
            <div className="progress-foot">
              <span>{progress?.stage || "Queue"}</span>
              <b>{progress?.percent || 0}%</b>
            </div>
            <div className="spinner" />
          </>
        )}
      </div>
    </div>
  );
}
function Home() {
  const [scenario, setScenario] = useState("");
  const [difficulty, setDifficulty] = useState<"easy" | "medium" | "hard">("medium");
  const [tone, setTone] = useState<"noir" | "cozy" | "thriller" | "comedic">("noir");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const nav = useNavigate();
  async function open() {
    setErr("");
    if (scenario.trim().length < 10) {
      setErr("Give the case a little more detail (at least 10 characters).");
      return;
    }
    setBusy(true);
    try {
      const r = await api<{ caseId: string }>("/cases", {
        method: "POST",
        body: JSON.stringify({ scenario, difficulty, tone, language: "en" }),
      });
      nav(`/cases/${r.caseId}`);
    } catch (e) {
      setErr((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="home">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Search size={17} />
          </span>
          <span>THE MYSTERY ROOM</span>
        </Link>
        <div className="top-right">
          <span className="secure">
            <LockKeyhole size={13} /> YOUR CASE FILES STAY PRIVATE
          </span>
          <button className="icon-button" aria-label="Profile">
            <UserRound size={18} />
          </button>
        </div>
      </header>
      <section className="hero">
        <div className="hero-art">
          <div className="moon"></div>
          <div className="city city-back"></div>
          <div className="city city-front"></div>
          <div className="rain"></div>
          <div className="lamp"></div>
          <div className="hero-caption">
            <span className="eyebrow">A STORY IS WAITING</span>
            <p>
              Somewhere in the shadows,
              <br />
              one detail doesn’t belong.
            </p>
          </div>
          <div className="hero-index">
            CASE NO. 001 <i /> OPEN
          </div>
        </div>
        <div className="hero-copy">
          <div className="eyebrow gold">YOUR DESK IS READY</div>
          <h1>
            Every clue
            <br />
            has a <em>story.</em>
          </h1>
          <p className="lede">Set the scene. We’ll build the case. You find the truth.</p>
          <div className="stats">
            <div>
              <b>01</b>
              <span>Set your mystery</span>
            </div>
            <div>
              <b>02</b>
              <span>Follow the evidence</span>
            </div>
            <div>
              <b>03</b>
              <span>Make your accusation</span>
            </div>
          </div>
        </div>
      </section>
      <section className="open-panel">
        <div className="section-heading">
          <div>
            <span className="eyebrow">THE CASE STARTS HERE</span>
            <h2>What happened?</h2>
          </div>
          <span className="counter">{scenario.length} / 500</span>
        </div>
        <textarea
          value={scenario}
          maxLength={500}
          onChange={(e) => setScenario(e.target.value)}
          placeholder="A jewelry store was robbed during an office party..."
        />
        <div className="sample-row">
          <span>NEED A SPARK?</span>
          {samples.map((s) => (
            <button key={s} onClick={() => setScenario(s)}>
              {s}
            </button>
          ))}
        </div>
        <div className="form-bottom">
          <div className="selects">
            <label>
              DIFFICULTY
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value as typeof difficulty)}
              >
                <option value="easy">Easy · 3 attempts</option>
                <option value="medium">Medium · 2 attempts</option>
                <option value="hard">Hard · 1 attempt</option>
              </select>
            </label>
            <label>
              ATMOSPHERE
              <select value={tone} onChange={(e) => setTone(e.target.value as typeof tone)}>
                <option value="noir">Noir</option>
                <option value="cozy">Cozy</option>
                <option value="thriller">Thriller</option>
                <option value="comedic">Comedic</option>
              </select>
            </label>
          </div>
          <button className="primary" disabled={busy} onClick={open}>
            {busy ? "OPENING FILE…" : "OPEN CASE"} <ArrowRight size={17} />
          </button>
        </div>
        {err && <p className="error">{err}</p>}
      </section>
      <footer className="footer">
        <span>ALL CASES, CHARACTERS AND EVIDENCE ARE AI-GENERATED FICTION.</span>
        <span>
          BUILT FOR THE CURIOUS <Sparkles size={12} />
        </span>
      </footer>
    </main>
  );
}
function CasePage({ id }: { id: string }) {
  const [caseData, setCaseData] = useState<CaseView | null>(null);
  const [evidence, setEvidence] = useState<Evidence[]>([]);
  const [selected, setSelected] = useState<Evidence | null>(null);
  const [filter, setFilter] = useState("all");
  const [suspectFilter, setSuspectFilter] = useState("all");
  const [query, setQuery] = useState("");
  const [notes, setNotes] = useState("");
  const [pins, setPins] = useState<string[]>([]);
  const [hint, setHint] = useState("");
  const [solution, setSolution] = useState<any>(null);
  const [accuse, setAccuse] = useState(false);
  const [chosen, setChosen] = useState("");
  const [justification, setJustification] = useState("");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState("");
  const nav = useNavigate();
  useEffect(() => {
    api<CaseView>(`/cases/${id}`).then((c) => {
      setCaseData(c);
      setNotes(c.notes || "");
      setPins(c.pinnedEvidenceIds || []);
      if (c.status === "resolved")
        api(`/cases/${id}/solution`)
          .then(setSolution)
          .catch(() => {});
    });
    api<Evidence[]>(`/cases/${id}/evidence`)
      .then(setEvidence)
      .catch((e) => setToast(e.message));
  }, [id]);
  useEffect(() => {
    const t = setTimeout(() => {
      if (caseData)
        api(`/cases/${id}/notes`, {
          method: "PATCH",
          body: JSON.stringify({ notes, pinnedEvidenceIds: pins }),
        }).catch(() => {});
    }, 500);
    return () => clearTimeout(t);
  }, [notes, pins, id, caseData]);
  if (!caseData)
    return (
      <main className="loading">
        <div className="spinner" />
        <p>OPENING THE CASE FILE</p>
      </main>
    );
  const c = caseData;
  const shown = evidence.filter(
    (e) =>
      (filter === "all" || e.type === filter) &&
      (suspectFilter === "all" || e.relatedSuspectIds.includes(suspectFilter)) &&
      `${e.title} ${e.summary} ${e.source}`.toLowerCase().includes(query.toLowerCase()),
  );
  const togglePin = (eid: string) =>
    setPins((p) => (p.includes(eid) ? p.filter((x) => x !== eid) : [...p, eid]));
  async function getHint() {
    try {
      const r = await api<{ hint: string }>("/cases/" + id + "/hint", { method: "POST" });
      setHint(r.hint);
      setToast("Hint added · 150 points");
    } catch (e) {
      setToast((e as Error).message);
    }
  }
  async function submitAccusation() {
    if (!chosen) return;
    setBusy(true);
    try {
      const r = await api<any>(`/cases/${id}/accuse`, {
        method: "POST",
        body: JSON.stringify({ suspectId: chosen, justification }),
      });
      setAccuse(false);
      setToast(r.correct ? "Your deduction was right." : "That accusation is incorrect.");
      if (r.resolved) {
        const fresh = await api<CaseView>(`/cases/${id}`);
        setCaseData(fresh);
        setSolution(await api(`/cases/${id}/solution`));
      } else {
        const fresh = await api<CaseView>(`/cases/${id}`);
        setCaseData(fresh);
      }
    } catch (e) {
      setToast((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  async function giveUp() {
    if (!confirm("Reveal the solution now? Your score will be 0.")) return;
    await api(`/cases/${id}/giveup`, { method: "POST" });
    setCaseData(await api<CaseView>(`/cases/${id}`));
    setSolution(await api(`/cases/${id}/solution`));
  }
  return (
    <main className="case-page">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Search size={17} />
          </span>
          <span>THE MYSTERY ROOM</span>
        </Link>
        <div className="top-right">
          <span className="case-ref">CASE FILE · {c.id.slice(0, 8).toUpperCase()}</span>
          <Link to="/" className="new-case">
            <Plus size={15} /> NEW CASE
          </Link>
        </div>
      </header>
      <div className="case-shell">
        <div className="case-topline">
          <span>
            <span className="live-dot" />{" "}
            {c.status === "resolved" ? "CASE CLOSED" : "ACTIVE INVESTIGATION"}
          </span>
          <span>
            {c.difficulty.toUpperCase()} <i className="dot-sep" /> {c.setting.date}
          </span>
        </div>
        <div className="case-head">
          <div>
            <div className="eyebrow gold">
              {c.setting.place} · {c.setting.timeRange}
            </div>
            <h1>{c.title}</h1>
            <p>{c.briefing}</p>
          </div>
          <div className="attempt-card">
            <span>ACCUSATIONS LEFT</span>
            <b>{c.attemptsLeft.toString().padStart(2, "0")}</b>
            <small>Choose carefully</small>
          </div>
        </div>
        <div className="suspect-strip">
          <div className="strip-label">
            <Shield size={15} /> PERSONS OF INTEREST <span>{c.suspects.length}</span>
          </div>
          {c.suspects.map((s, i) => (
            <div className="suspect" key={s.id}>
              <div className={`avatar avatar-${i}`}>
                <span>
                  {s.name
                    .split(" ")
                    .map((n) => n[0])
                    .join("")}
                </span>
              </div>
              <div>
                <b>{s.name}</b>
                <small>{s.role}</small>
              </div>
            </div>
          ))}
        </div>
        <div className="board-top">
          <div>
            <span className="eyebrow">THE EVIDENCE BOARD</span>
            <h2>
              Collected evidence <span>{evidence.length}</span>
            </h2>
          </div>
          <div className="board-tools">
            <label className="search-box">
              <Search size={15} />
              <input
                placeholder="Search evidence…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </label>
            <select
              className="filter-select"
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            >
              <option value="all">All evidence</option>
              {["chat", "image", "cctv", "document", "statement"].map((x) => (
                <option key={x} value={x}>
                  {x[0].toUpperCase() + x.slice(1)}
                </option>
              ))}
            </select>
            <select className="filter-select" aria-label="Filter evidence by suspect" value={suspectFilter} onChange={(e) => setSuspectFilter(e.target.value)}>
              <option value="all">All suspects</option>
              {c.suspects.map((suspect) => <option key={suspect.id} value={suspect.id}>{suspect.name}</option>)}
            </select>
          </div>
        </div>
        {pins.length > 0 && (
          <div className="pinned-row">
            <span>KEY CLUES</span>
            {pins.map((p) => {
              const e = evidence.find((x) => x.id === p);
              return e ? (
                <button key={p} onClick={() => setSelected(e)}>
                  <Bookmark size={12} fill="currentColor" />
                  {e.title}
                  <X
                    size={12}
                    onClick={(ev) => {
                      ev.stopPropagation();
                      togglePin(p);
                    }}
                  />
                </button>
              ) : null;
            })}
          </div>
        )}
        <div className="evidence-grid">
          {shown.map((e, i) => (
            <EvidenceCard
              key={e.id}
              item={e}
              index={i}
              pinned={pins.includes(e.id)}
              viewed={c.viewedEvidenceIds?.includes(e.id) ?? false}
              onClick={() => {
                setSelected(e);
                if (!c.viewedEvidenceIds?.includes(e.id)) {
                  api(`/cases/${id}/evidence/${e.id}/viewed`, { method: "POST" }).then(() =>
                    setCaseData((current) => current ? { ...current, viewedEvidenceIds: [...(current.viewedEvidenceIds ?? []), e.id] } : current),
                  ).catch(() => {});
                }
              }}
              onPin={() => togglePin(e.id)}
            />
          ))}
        </div>
        <div className="lower-grid">
          <section className="notes-card">
            <div className="card-title">
              <div>
                <StickyNote size={17} />
                <h3>Investigator’s notes</h3>
              </div>
              <span className="autosave">
                <Check size={12} /> AUTOSAVED
              </span>
            </div>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Connect the dots. Your notes are private to this case…"
            />
          </section>
          <section className="hint-card">
            <div className="card-title">
              <div>
                <Lightbulb size={17} />
                <h3>Need a nudge?</h3>
              </div>
              <span className="hint-count">{Math.max(0, 3 - c.hintsUsed)} LEFT</span>
            </div>
            {hint ? (
              <p className="hint-text">“{hint}”</p>
            ) : (
              <p>Hints cost 150 points and get more specific each time.</p>
            )}
            <button
              className="secondary"
              onClick={getHint}
              disabled={c.hintsUsed >= 3 || c.status === "resolved"}
            >
              REVEAL HINT <ArrowRight size={14} />
            </button>
          </section>
        </div>
        {solution ? (
          <Reveal solution={solution} c={c} />
        ) : (
          <div className="accuse-bar">
            <div>
              <span className="eyebrow">HAVE YOU FOUND THE THREAD?</span>
              <p>Weigh the evidence, then make your accusation.</p>
            </div>
            <div>
              <button className="give-up" onClick={giveUp}>
                GIVE UP
              </button>
              <button className="primary" onClick={() => setAccuse(true)}>
                MAKE AN ACCUSATION <ArrowRight size={16} />
              </button>
            </div>
          </div>
        )}
        <footer className="footer">
          <span>ALL CASES, CHARACTERS AND EVIDENCE ARE AI-GENERATED FICTION.</span>
          <span>CASE FILE · {c.id.slice(0, 8).toUpperCase()}</span>
        </footer>
      </div>
      {selected && (
        <EvidenceModal
          item={selected}
          pinned={pins.includes(selected.id)}
          onPin={() => togglePin(selected.id)}
          onClose={() => setSelected(null)}
        />
      )}
      {accuse && (
        <div className="overlay" onClick={() => setAccuse(false)}>
          <div className="dialog" onClick={(e) => e.stopPropagation()}>
            <button className="close" onClick={() => setAccuse(false)}>
              <X />
            </button>
            <span className="eyebrow gold">THE MOMENT OF TRUTH</span>
            <h2>Who did it?</h2>
            <p>Select one suspect. This accusation cannot be undone.</p>
            <div className="choice-list">
              {c.suspects.map((s) => (
                <button
                  className={chosen === s.id ? "chosen" : ""}
                  key={s.id}
                  onClick={() => setChosen(s.id)}
                >
                  <span>{s.name}</span>
                  <small>{s.role}</small>
                  {chosen === s.id && <Check size={16} />}
                </button>
              ))}
            </div>
            <label className="justification">
              YOUR REASONING <span>OPTIONAL · SCORED</span>
              <textarea
                maxLength={600}
                value={justification}
                onChange={(e) => setJustification(e.target.value)}
                placeholder="Which details convinced you?"
              />
            </label>
            <button className="primary full" disabled={!chosen || busy} onClick={submitAccusation}>
              {busy ? "RECORDING…" : "CONFIRM ACCUSATION"} <ArrowRight size={16} />
            </button>
          </div>
        </div>
      )}
      {toast && (
        <div className="toast" onClick={() => setToast("")}>
          {toast}
          <X size={14} />
        </div>
      )}
    </main>
  );
}
function EvidenceCard({
  item: initial,
  index,
  pinned,
  viewed,
  onClick,
  onPin,
}: {
  item: Evidence;
  index: number;
  pinned: boolean;
  viewed: boolean;
  onClick: () => void;
  onPin: () => void;
}) {
  const item = useLiveEvidence(initial);
  const Icon = icons[item.type];
  return (
    <article className={`evidence-card ${item.type} ${viewed ? "viewed" : "unviewed"}`} style={{ animationDelay: `${index * 45}ms` }}>
      <button
        className="pin-btn"
        aria-label="Pin clue"
        onClick={(e) => {
          e.stopPropagation();
          onPin();
        }}
      >
        <Bookmark size={15} fill={pinned ? "currentColor" : "none"} />
      </button>
      <button className="evidence-open" onClick={onClick}>
        <div className="evidence-meta">
          <span className="type-icon">
            <Icon size={15} />
          </span>
          <span>
            {!viewed && <b className="unviewed-label">NEW · </b>}
            {item.type.toUpperCase()} <i /> {item.inWorldTimestamp.slice(11, 16)}
          </span>
          <ArrowDown size={14} />
        </div>
        <div className="evidence-thumb">
          {item.assets?.[0] ? (
            <img className="asset-img" src={item.assets[0].url} alt={item.assets[0].alt} />
          ) : item.type === "chat" ? (
            <div className="fake-chat">
              <span />
              <b>We need to talk after closing.</b>
              <em>8:14 PM</em>
            </div>
          ) : item.type === "cctv" ? (
            <div className="fake-cctv">
              <span className="rec">● REC</span>
              <b>{item.payload.cameraLabel as string}</b>
              <span className="scanlines" />
            </div>
          ) : item.type === "document" ? (
            <div className="fake-doc">
              <i>THE BELLWETHER GALLERY</i>
              <b>{item.title.toUpperCase()}</b>
              <span />
              <span />
              <span />
            </div>
          ) : item.type === "statement" ? (
            <div className="fake-statement">
              “
              {(
                (item.payload.transcript as any[])?.[1]?.text || "I remember the evening clearly."
              ).slice(0, 90)}
              …”
            </div>
          ) : (
            <div className="fake-image">
              <div />
              <span>ARCHIVE · {item.source.toUpperCase()}</span>
            </div>
          )}
        </div>
        <div className="evidence-copy">
          <h3>{item.title}</h3>
          <p>{item.summary}</p>
          <div className="source">
            <span className="source-dot" />
            {item.source}
            <ArrowRight size={13} />
          </div>
        </div>
      </button>
    </article>
  );
}
function EvidenceModal({
  item: initial,
  pinned,
  onPin,
  onClose,
}: {
  item: Evidence;
  pinned: boolean;
  onPin: () => void;
  onClose: () => void;
}) {
  const item = useLiveEvidence(initial);
  const p = item.payload as any;
  return (
    <div className="overlay" onClick={onClose}>
      <div className="evidence-dialog" onClick={(e) => e.stopPropagation()}>
        <button className="close" onClick={onClose}>
          <X />
        </button>
        <div className="evidence-dialog-head">
          <span className="eyebrow gold">
            {item.type.toUpperCase()} · {item.inWorldTimestamp}
          </span>
          <h2>{item.title}</h2>
          <p>{item.summary}</p>
        </div>
        <div className={`evidence-body body-${item.type}`}>
          {item.type === "chat" ? (
            <div className="chat-window">
              <div className="chat-top">
                MESSENGER <span>{p.chatName}</span>
              </div>
              {p.payload?.messages?.map((m: any, i: number) => (
                <div className={`bubble ${i % 2 ? "out" : "in"}`} key={m.id}>
                  {m.text}
                  <small>{m.timestamp}</small>
                </div>
              )) ||
                p.messages?.map((m: any, i: number) => (
                  <div className={`bubble ${i % 2 ? "out" : "in"}`} key={m.id}>
                    {m.text}
                    <small>{m.timestamp}</small>
                  </div>
                ))}
            </div>
          ) : item.type === "statement" ? (
            <div className="transcript">
              {p.transcript?.map((t: any, i: number) => (
                <p key={i}>
                  <b>{t.speaker}</b>
                  {t.text}
                </p>
              ))}
            </div>
          ) : item.type === "document" ? (
            <div className="doc-detail">
              <b>{p.kind?.toUpperCase()}</b>
              {Object.entries(p.fields || {}).map(([k, v]) => (
                <p key={k}>
                  <span>{k}</span>
                  <strong>{String(v)}</strong>
                </p>
              ))}
              <p>{p.bodyText}</p>
            </div>
          ) : (
            <div className="frame-list">
              {p.frames?.map((f: any) => (
                <div className="frame" key={f.ordinal}>
                  {item.assets?.[f.ordinal - 1] && (
                    <img
                      src={item.assets[f.ordinal - 1].url}
                      alt={item.assets[f.ordinal - 1].alt}
                    />
                  )}
                  <span>{f.timestamp}</span>
                  <p>{f.caption}</p>
                </div>
              ))}
            </div>
          )}
        </div>
        <div className="evidence-dialog-foot">
          <span>
            {item.source} · {item.inWorldTimestamp}
          </span>
          <button className="secondary" onClick={onPin}>
            <Bookmark size={14} fill={pinned ? "currentColor" : "none"} />
            {pinned ? "PINNED" : "PIN AS KEY CLUE"}
          </button>
        </div>
      </div>
    </div>
  );
}
function Reveal({ solution, c }: { solution: any; c: CaseView }) {
  const sb = solution.scoreBreakdown;
  return (
    <section className="reveal">
      <div className="reveal-top">
        <div>
          <span className="eyebrow gold">THE CASE IS CLOSED</span>
          <h2>The truth, at last.</h2>
        </div>
        <div className="score">
          <span>YOUR SCORE</span>
          <b>{solution.score}</b>
          <small> / 1200</small>
          {sb && (
            <div className="score-breakdown">
              <span>
                BASE <b>{sb.base}</b>
              </span>
              <span>
                HINTS <b>−{sb.hintPenalty}</b>
              </span>
              <span>
                WRONG ATTEMPTS <b>−{sb.wrongAttemptPenalty}</b>
              </span>
              <span>
                TIME <b>−{sb.timePenalty}</b>
              </span>
              <span>
                REASONING <b>+{sb.justificationBonus}</b>
              </span>
              {sb.comment && <em>{sb.comment}</em>}
            </div>
          )}
        </div>
      </div>
      <div className="culprit-card">
        <div className="culprit-sigil">!</div>
        <div>
          <span className="eyebrow">THE CULPRIT</span>
          <h3>{solution.culprit?.name}</h3>
          <p>{solution.culprit?.role}</p>
        </div>
        <span className="solved-tag">
          <Check size={13} /> REVEALED
        </span>
      </div>
      <div className="solution-grid">
        <div>
          <span className="eyebrow">MOTIVE & METHOD</span>
          <p>{solution.explanation}</p>
        </div>
        <div>
          <span className="eyebrow">KEY EVIDENCE</span>
          {solution.decisiveClues?.map((x: any) => (
            <p className="clue-line" key={x.evidenceRef}>
              <b>{x.evidenceRef.toUpperCase()}</b>
              {x.whatItProves}
            </p>
          ))}
        </div>
      </div>
      <h3 className="timeline-title">
        <Clock3 size={16} /> THE TIMELINE
      </h3>
      <div className="solution-timeline">
        {solution.timeline?.map((t: any) => (
          <div key={t.time}>
            <b>{t.time}</b>
            <span>{t.event}</span>
          </div>
        ))}
      </div>
      <div className="share-row">
        <span>Case solved. The details remain yours.</span>
        {c.shareId && (
          <button
            onClick={() => {
              navigator.clipboard?.writeText(`${location.origin}/r/${c.shareId}`);
            }}
          >
            COPY RESULT LINK <ArrowRight size={14} />
          </button>
        )}
      </div>
    </section>
  );
}

function SharePage({ shareId }: { shareId: string }) {
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    api(`/share/${shareId}`)
      .then(setData)
      .catch((e) => setError((e as Error).message));
  }, [shareId]);
  return (
    <main className="share-page">
      <Link to="/" className="brand">
        <span className="brand-mark">
          <Search size={17} />
        </span>
        <span>THE MYSTERY ROOM</span>
      </Link>
      <section className="share-card">
        <span className="eyebrow gold">CASE RESULT · FILE SEALED</span>
        {error ? (
          <h1>{error}</h1>
        ) : !data ? (
          <h1>Retrieving case record…</h1>
        ) : (
          <>
            <h1>{data.title}</h1>
            <div className="share-stat">
              <span>{data.difficulty.toUpperCase()} INVESTIGATION</span>
              <b>
                {data.score}
                <small> / 1000</small>
              </b>
            </div>
            <p className="share-verdict">
              <Check size={16} />
              {data.verdict}
            </p>
            <Link className="primary" to="/">
              OPEN A NEW CASE <ArrowRight size={15} />
            </Link>
          </>
        )}
        <p className="fiction-note">ALL CASES, CHARACTERS AND EVIDENCE ARE AI-GENERATED FICTION.</p>
      </section>
    </main>
  );
}

function AuthPage({ signup }: { signup: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const nav = useNavigate();
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      await api(signup ? "/auth/signup" : "/auth/login", {
        method: "POST",
        body: JSON.stringify(signup ? { email, password, displayName: name } : { email, password }),
      });
      nav("/");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setBusy(false);
    }
  }
  return (
    <main className="auth-page">
      <Link to="/" className="brand">
        <span className="brand-mark">
          <Search size={17} />
        </span>
        <span>THE MYSTERY ROOM</span>
      </Link>
      <form className="auth-card" onSubmit={submit}>
        <span className="eyebrow gold">YOUR PRIVATE CASE ARCHIVE</span>
        <h1>{signup ? "Create an account" : "Welcome back"}</h1>
        <p>Guest cases can be claimed when you create an account.</p>
        {signup && (
          <label>
            DISPLAY NAME
            <input value={name} onChange={(e) => setName(e.target.value)} required maxLength={60} />
          </label>
        )}
        <label>
          EMAIL ADDRESS
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          PASSWORD
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            minLength={8}
            required
          />
        </label>
        {error && <p className="error">{error}</p>}
        <button className="primary full" disabled={busy}>
          {busy ? "PLEASE WAIT…" : signup ? "CREATE ACCOUNT" : "SIGN IN"} <ArrowRight size={15} />
        </button>
        <Link to={signup ? "/login" : "/signup"} className="auth-switch">
          {signup ? "Already have an account? Sign in" : "New here? Create an account"}
        </Link>
      </form>
      <p className="fiction-note">ALL CASES, CHARACTERS AND EVIDENCE ARE AI-GENERATED FICTION.</p>
    </main>
  );
}
function CaseHistory() {
  const [items, setItems] = useState<any[]>([]);
  const [error, setError] = useState("");
  useEffect(() => {
    api<any[]>("/cases")
      .then(setItems)
      .catch((e) => setError((e as Error).message));
  }, []);
  return (
    <main className="history-page">
      <header className="topbar">
        <Link to="/" className="brand">
          <span className="brand-mark">
            <Search size={17} />
          </span>
          <span>THE MYSTERY ROOM</span>
        </Link>
        <Link to="/" className="new-case">
          <Plus size={15} /> NEW CASE
        </Link>
      </header>
      <section className="history-shell">
        <span className="eyebrow gold">YOUR PRIVATE ARCHIVE</span>
        <h1>Case files</h1>
        <p>Every investigation you have opened, in one place.</p>
        {error && <p className="error">{error}</p>}
        {items.length === 0 && !error ? (
          <div className="empty-history">
            <FileText size={26} />
            <h2>No files yet.</h2>
            <p>Your investigations will appear here.</p>
            <Link className="primary" to="/">
              OPEN YOUR FIRST CASE <ArrowRight size={14} />
            </Link>
          </div>
        ) : (
          <div className="history-list">
            {items.map((c: any) => (
              <Link to={`/cases/${c.id}`} className="history-item" key={c.id}>
                <span className="history-icon">
                  <FileText size={17} />
                </span>
                <span className="history-info">
                  <b>{c.title}</b>
                  <small>
                    {c.difficulty.toUpperCase()} · {new Date(c.createdAt).toLocaleDateString()}
                  </small>
                </span>
                <span className={`history-status ${c.status}`}>{c.status.toUpperCase()}</span>
                {c.score !== undefined && <b className="history-score">{c.score}</b>}
                <ArrowRight size={16} />
              </Link>
            ))}
          </div>
        )}
        <p className="fiction-note">ALL CASES, CHARACTERS AND EVIDENCE ARE AI-GENERATED FICTION.</p>
      </section>
    </main>
  );
}
function CaseTimeline({ id }: { id: string }) {
  const [c, setC] = useState<CaseView | null>(null);
  const [items, setItems] = useState<Evidence[]>([]);
  const [selected, setSelected] = useState<Evidence | null>(null);
  const [pins, setPins] = useState<string[]>([]);
  useEffect(() => {
    api<CaseView>(`/cases/${id}`).then(setC);
    api<Evidence[]>(`/cases/${id}/evidence`).then(setItems);
  }, [id]);
  const ordered = [...items].sort((a, b) => a.inWorldTimestamp.localeCompare(b.inWorldTimestamp));
  return (
    <main className="timeline-page">
      <header className="topbar">
        <Link to={`/cases/${id}`} className="brand">
          <span className="brand-mark">
            <ArrowLeft size={16} />
          </span>
          <span>BACK TO CASE FILE</span>
        </Link>
        <span className="case-ref">CHRONOLOGICAL VIEW</span>
      </header>
      <section className="timeline-shell">
        <span className="eyebrow gold">INVESTIGATION TIMELINE</span>
        <h1>{c?.title || "Case timeline"}</h1>
        <p>Evidence, arranged by the time it entered the story.</p>
        <div className="timeline-list">
          {ordered.map((e, i) => (
            <button className="timeline-item" key={e.id} onClick={() => setSelected(e)}>
              <span className="timeline-node">{i + 1}</span>
              <span className="timeline-time">
                {new Date(e.inWorldTimestamp).toLocaleString([], {
                  dateStyle: "medium",
                  timeStyle: "short",
                })}
              </span>
              <span className="timeline-content">
                <b>{e.title}</b>
                <small>
                  {e.type.toUpperCase()} · {e.source}
                </small>
                <em>{e.summary}</em>
              </span>
              <ArrowRight size={15} />
            </button>
          ))}
        </div>
      </section>
      {selected && (
        <EvidenceModal
          item={selected}
          pinned={pins.includes(selected.id)}
          onPin={() =>
            setPins((p) =>
              p.includes(selected.id) ? p.filter((x) => x !== selected.id) : [...p, selected.id],
            )
          }
          onClose={() => setSelected(null)}
        />
      )}
    </main>
  );
}
