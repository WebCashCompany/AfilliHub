// src/components/auth/DevToolsGuard.tsx
import { useState, useEffect, useRef, useCallback, ReactNode } from "react";

// ============================================================
// CONFIGURAÇÃO
// ============================================================
const DEV_PASSWORD = "promoforia@2026";
const STORAGE_KEY  = "__dtg_auth__";
// ============================================================

// ── Raiz do problema identificada e resolvida ────────────────
//
// FALSO POSITIVO: sobrescrever console.* dispara porque o próprio
// React, Vite e libs internas usam console durante o boot.
// SOLUÇÃO: não sobrescrever console. Detectar só por ação humana.
//
// BOTÃO VOLTAR NÃO FUNCIONAVA: o listener de contextmenu com
// capture:true bloqueava cliques do mouse antes do React processar.
// SOLUÇÃO: os listeners só rodam quando o overlay está FECHADO.
// Quando o overlay está aberto, tudo é liberado normalmente.
//
// ────────────────────────────────────────────────────────────

type GuardState = "idle" | "detected" | "denied" | "granted";

function isAuthenticated(): boolean {
  try { return localStorage.getItem(STORAGE_KEY) === "1"; } catch { return false; }
}
function saveAuth() {
  try { localStorage.setItem(STORAGE_KEY, "1"); } catch { /* noop */ }
}

const FUNNY = [
  { title: "Ei, curioso! 👀",        body: "Este sistema foi feito para usar, não para dissecar. Fecha esse painel e vai trabalhar!" },
  { title: "Opa, engenheiro! 🔧",    body: "Aqui não tem nada de interessante… ou tem? Feche o DevTools e continue usando normalmente." },
  { title: "Achei você! 🕵️",         body: "O sistema te viu tentando inspecionar. Não precisa saber como a salsicha é feita, só aproveite ela." },
  { title: "Sério mesmo? 🤨",        body: "Você tentou abrir o inspecionador. Respeito o espírito hacker, mas aqui não rola. Fecha isso!" },
  { title: "Eita, investigador! 🔍", body: "Curioso assim deveria trabalhar aqui. Por enquanto, usa o sistema como Deus manda." },
];

// ── Ícones ─────────────────────────────────────────────────────
function ShieldIcon() {
  return (
    <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.2">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
    </svg>
  );
}
function LockIcon() {
  return (
    <svg width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <rect x="3" y="11" width="18" height="11" rx="2" />
      <path d="M7 11V7a5 5 0 0 1 10 0v4" />
    </svg>
  );
}
function EyeIcon({ open }: { open: boolean }) {
  return open ? (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  ) : (
    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94" />
      <path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19" />
      <line x1="1" y1="1" x2="23" y2="23" />
    </svg>
  );
}
function CloseIcon() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

// ── Componente ─────────────────────────────────────────────────
export function DevToolsGuard({ children }: { children: ReactNode }) {
  const [state,    setState]    = useState<GuardState>(() =>
    isAuthenticated() ? "granted" : "idle"
  );
  const [password, setPassword] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [attempts, setAttempts] = useState(0);
  const [shake,    setShake]    = useState(false);
  const [glitch,   setGlitch]   = useState(false);
  const [showDev,  setShowDev]  = useState(false);
  const [funny,    setFunny]    = useState(FUNNY[0]);

  // Ref para saber se o overlay está visível — usado dentro dos listeners
  const overlayOpenRef = useRef(false);
  const inputRef       = useRef<HTMLInputElement>(null);

  // Mantém ref sincronizado com state
  useEffect(() => {
    overlayOpenRef.current = (state === "detected" || state === "denied");
  }, [state]);

  // ── Dispara bloqueio ────────────────────────────────────────
  const triggerBlock = useCallback(() => {
    if (isAuthenticated())        return;
    if (overlayOpenRef.current)   return; // overlay já aberto, não reabre
    setFunny(FUNNY[Math.floor(Math.random() * FUNNY.length)]);
    setGlitch(true);
    setTimeout(() => setGlitch(false), 500);
    setState("detected");
  }, []);

  // ── Listeners de teclado e clique direito ───────────────────
  // IMPORTANTE: só bloqueiam quando o overlay está FECHADO.
  // Quando aberto, deixamos o React processar os cliques normalmente.
  useEffect(() => {
    if (isAuthenticated()) return;

    const onKeyDown = (e: KeyboardEvent) => {
      // Se overlay aberto, não interfere (deixa Escape/Enter do React funcionar)
      if (overlayOpenRef.current) return;
      if (isAuthenticated())      return;

      const hit =
        e.key === "F12" ||
        (e.ctrlKey && e.shiftKey && ["I","J","C","i","j","c"].includes(e.key)) ||
        (e.ctrlKey && ["u","U"].includes(e.key));

      if (hit) {
        e.preventDefault();
        e.stopImmediatePropagation();
        triggerBlock();
      }
    };

    const onContext = (e: MouseEvent) => {
      // Se overlay aberto, não interfere
      if (overlayOpenRef.current) return;
      if (isAuthenticated())      return;
      e.preventDefault();
      e.stopImmediatePropagation();
      triggerBlock();
    };

    document.addEventListener("keydown",     onKeyDown, true);
    document.addEventListener("contextmenu", onContext,  true);

    return () => {
      document.removeEventListener("keydown",     onKeyDown, true);
      document.removeEventListener("contextmenu", onContext,  true);
    };
  }, [triggerBlock]);

  // Foca input quando campo de senha aparece
  useEffect(() => {
    if (showDev) setTimeout(() => inputRef.current?.focus(), 100);
  }, [showDev]);

  // ── Dismiss: fecha overlay e volta ao sistema ───────────────
  const handleDismiss = useCallback(() => {
    setPassword("");
    setShowDev(false);
    setShake(false);
    setState("idle");
    // Garante que o ref seja atualizado imediatamente
    overlayOpenRef.current = false;
  }, []);

  // ── Submit de senha ─────────────────────────────────────────
  const handleSubmit = useCallback(() => {
    if (!password) return;
    if (password === DEV_PASSWORD) {
      saveAuth();
      setState("granted");
      setPassword("");
      setAttempts(0);
      setShowDev(false);
      overlayOpenRef.current = false;
    } else {
      setAttempts(n => n + 1);
      setState("denied");
      setShake(true);
      setPassword("");
      setTimeout(() => {
        setShake(false);
        setState("detected");
        setTimeout(() => inputRef.current?.focus(), 60);
      }, 900);
    }
  }, [password]);

  const onInputKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter")  handleSubmit();
    if (e.key === "Escape") handleDismiss();
  };

  // ── Sem overlay ─────────────────────────────────────────────
  if (state === "idle" || state === "granted") return <>{children}</>;

  const denied = state === "denied";

  // ── Overlay ─────────────────────────────────────────────────
  return (
    <>
      <div style={{ filter:"blur(8px)", pointerEvents:"none", userSelect:"none", overflow:"hidden" }}>
        {children}
      </div>

      <div style={{
        position:"fixed", inset:0, zIndex:99999,
        display:"flex", alignItems:"center", justifyContent:"center",
        background:"rgba(0,0,0,0.78)",
        backdropFilter:"blur(12px)", WebkitBackdropFilter:"blur(12px)",
        fontFamily:"'Courier New',monospace",
      }}>
        {/* scanlines */}
        <div style={{
          position:"absolute", inset:0, pointerEvents:"none",
          backgroundImage:"repeating-linear-gradient(0deg,transparent,transparent 2px,rgba(0,0,0,0.06) 2px,rgba(0,0,0,0.06) 4px)",
        }}/>

        {/* card */}
        <div style={{
          position:"relative", width:"100%", maxWidth:440, margin:"0 16px",
          background:"rgba(8,8,14,0.97)",
          border:`1px solid ${denied ? "rgba(255,59,59,0.45)" : "rgba(255,255,255,0.08)"}`,
          borderRadius:6, overflow:"hidden",
          boxShadow: denied
            ? "0 0 48px rgba(255,59,59,0.2),0 0 100px rgba(255,59,59,0.06)"
            : "0 0 48px rgba(0,200,255,0.1),0 0 100px rgba(0,200,255,0.04)",
          animation: shake ? "dtg-shake .5s ease" : glitch ? "dtg-glitch .35s ease" : "dtg-in .3s ease",
        }}>
          {/* barra topo */}
          <div style={{
            height:2,
            background: denied
              ? "linear-gradient(90deg,transparent,#ff3b3b,transparent)"
              : "linear-gradient(90deg,transparent,#00c8ff,transparent)",
            animation:"dtg-pulse 2s ease-in-out infinite",
          }}/>

          {/* botão X fechar */}
          <button
            onClick={handleDismiss}
            style={{
              position:"absolute", top:14, right:14,
              background:"rgba(255,255,255,0.06)", border:"1px solid rgba(255,255,255,0.1)",
              borderRadius:4, padding:"5px 10px", cursor:"pointer",
              color:"rgba(255,255,255,0.5)", display:"flex", alignItems:"center", gap:6,
              fontSize:10, letterSpacing:"0.1em", transition:"all .2s",
            }}
            onMouseEnter={e => { e.currentTarget.style.background = "rgba(255,255,255,0.12)"; e.currentTarget.style.color = "#fff"; }}
            onMouseLeave={e => { e.currentTarget.style.background = "rgba(255,255,255,0.06)"; e.currentTarget.style.color = "rgba(255,255,255,0.5)"; }}
          >
            <CloseIcon/> FECHAR
          </button>

          <div style={{ padding:"38px 34px 32px" }}>
            {/* ícone */}
            <div style={{
              display:"flex", justifyContent:"center", marginBottom:20,
              color: denied ? "#ff3b3b" : "#00c8ff",
              filter: denied ? "drop-shadow(0 0 10px rgba(255,59,59,.8))" : "drop-shadow(0 0 10px rgba(0,200,255,.8))",
              animation:"dtg-float 3s ease-in-out infinite",
            }}>
              <ShieldIcon/>
            </div>

            {/* Mensagem engraçada (estado inicial) */}
            {!showDev && !denied && (
              <div style={{ textAlign:"center", marginBottom:28 }}>
                <div style={{ fontSize:10, letterSpacing:"0.3em", textTransform:"uppercase", color:"#00c8ff", marginBottom:10 }}>
                  ◈ ei, ei, ei...
                </div>
                <div style={{ fontSize:20, fontWeight:700, color:"#fff", letterSpacing:"0.02em", marginBottom:12 }}>
                  {funny.title}
                </div>
                <div style={{ fontSize:13, color:"rgba(255,255,255,.45)", lineHeight:1.7, padding:"0 8px" }}>
                  {funny.body}
                </div>

                <div style={{ display:"flex", gap:10, marginTop:24 }}>
                  {/* Botão principal — volta ao sistema */}
                  <button
                    onClick={handleDismiss}
                    style={{
                      flex:1, padding:"12px", borderRadius:4, border:"none",
                      background:"linear-gradient(135deg,#00c8ff 0%,#0070f3 100%)",
                      color:"#000", fontSize:11, fontFamily:"'Courier New',monospace",
                      fontWeight:700, letterSpacing:"0.18em", textTransform:"uppercase",
                      cursor:"pointer", transition:"all .2s",
                      boxShadow:"0 4px 20px rgba(0,200,255,.25)",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    ← Voltar ao sistema
                  </button>

                  {/* Botão discreto — sou dev */}
                  <button
                    onClick={() => setShowDev(true)}
                    style={{
                      padding:"12px 16px", borderRadius:4,
                      border:"1px solid rgba(255,255,255,0.1)",
                      background:"rgba(255,255,255,0.04)",
                      color:"rgba(255,255,255,0.35)", fontSize:10,
                      fontFamily:"'Courier New',monospace", letterSpacing:"0.12em",
                      textTransform:"uppercase", cursor:"pointer", transition:"all .2s",
                      whiteSpace:"nowrap",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.25)"; e.currentTarget.style.color = "rgba(255,255,255,0.7)"; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = "rgba(255,255,255,0.1)";  e.currentTarget.style.color = "rgba(255,255,255,0.35)"; }}
                  >
                    Sou dev 🔐
                  </button>
                </div>
              </div>
            )}

            {/* Campo de senha (dev ou erro) */}
            {(showDev || denied) && (
              <div>
                <div style={{ textAlign:"center", marginBottom:24 }}>
                  <div style={{
                    fontSize:10, letterSpacing:"0.3em", textTransform:"uppercase",
                    color: denied ? "#ff3b3b" : "#00c8ff", marginBottom:8,
                  }}>
                    {denied ? "⚠ acesso negado" : "◈ acesso desenvolvedor"}
                  </div>
                  <div style={{ fontSize:17, fontWeight:700, color:"#fff" }}>
                    {denied ? "Credencial inválida" : "Insira sua credencial"}
                  </div>
                  {denied && (
                    <div style={{ fontSize:12, color:"rgba(255,255,255,.32)", marginTop:6 }}>
                      Tentativa {attempts} registrada.
                    </div>
                  )}
                </div>

                <div style={{ position:"relative", marginBottom:12 }}>
                  <div style={{
                    position:"absolute", left:13, top:"50%", transform:"translateY(-50%)",
                    color:"rgba(255,255,255,.2)", pointerEvents:"none", display:"flex",
                  }}>
                    <LockIcon/>
                  </div>
                  <input
                    ref={inputRef}
                    type={showPass ? "text" : "password"}
                    value={password}
                    onChange={e => setPassword(e.target.value)}
                    onKeyDown={onInputKeyDown}
                    placeholder="Credencial de acesso..."
                    autoComplete="off"
                    spellCheck={false}
                    style={{
                      width:"100%", boxSizing:"border-box",
                      padding:"12px 44px 12px 42px",
                      background:"rgba(255,255,255,.03)",
                      border:`1px solid ${denied ? "rgba(255,59,59,.35)" : "rgba(255,255,255,.09)"}`,
                      borderRadius:3, color:"#fff", fontSize:14,
                      fontFamily:"'Courier New',monospace", letterSpacing:"0.08em",
                      outline:"none", transition:"border-color .2s,box-shadow .2s",
                    }}
                    onFocus={e => { e.target.style.borderColor = "#00c8ff"; e.target.style.boxShadow = "0 0 0 2px rgba(0,200,255,.1)"; }}
                    onBlur={e  => { e.target.style.borderColor = denied ? "rgba(255,59,59,.35)" : "rgba(255,255,255,.09)"; e.target.style.boxShadow = "none"; }}
                  />
                  <button
                    onClick={() => setShowPass(v => !v)}
                    style={{
                      position:"absolute", right:11, top:"50%", transform:"translateY(-50%)",
                      background:"none", border:"none", cursor:"pointer", padding:4,
                      color:"rgba(255,255,255,.25)", display:"flex", alignItems:"center", transition:"color .2s",
                    }}
                    onMouseEnter={e => (e.currentTarget.style.color = "rgba(255,255,255,.7)")}
                    onMouseLeave={e => (e.currentTarget.style.color = "rgba(255,255,255,.25)")}
                  >
                    <EyeIcon open={showPass}/>
                  </button>
                </div>

                <div style={{ display:"flex", gap:10 }}>
                  <button
                    onClick={handleDismiss}
                    style={{
                      padding:"12px 16px", borderRadius:3,
                      border:"1px solid rgba(255,255,255,0.08)",
                      background:"rgba(255,255,255,0.03)",
                      color:"rgba(255,255,255,0.35)", fontSize:10,
                      fontFamily:"'Courier New',monospace", letterSpacing:"0.12em",
                      textTransform:"uppercase", cursor:"pointer", transition:"all .2s",
                    }}
                    onMouseEnter={e => { e.currentTarget.style.color = "rgba(255,255,255,0.7)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.2)"; }}
                    onMouseLeave={e => { e.currentTarget.style.color = "rgba(255,255,255,0.35)"; e.currentTarget.style.borderColor = "rgba(255,255,255,0.08)"; }}
                  >
                    ← Voltar
                  </button>
                  <button
                    onClick={handleSubmit}
                    disabled={!password}
                    style={{
                      flex:1, padding:"12px", borderRadius:3, border:"none",
                      background: password ? "linear-gradient(135deg,#00c8ff 0%,#0070f3 100%)" : "rgba(255,255,255,.04)",
                      color: password ? "#000" : "rgba(255,255,255,.18)",
                      fontSize:11, fontFamily:"'Courier New',monospace",
                      fontWeight:700, letterSpacing:"0.2em", textTransform:"uppercase",
                      cursor: password ? "pointer" : "not-allowed",
                      transition:"all .2s",
                      boxShadow: password ? "0 4px 20px rgba(0,200,255,.25)" : "none",
                    }}
                    onMouseEnter={e => { if (password) e.currentTarget.style.transform = "translateY(-1px)"; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = "translateY(0)"; }}
                  >
                    Verificar acesso
                  </button>
                </div>
              </div>
            )}

            <div style={{
              marginTop:20, paddingTop:16,
              borderTop:"1px solid rgba(255,255,255,.05)",
              textAlign:"center", fontSize:9,
              color:"rgba(255,255,255,.1)", letterSpacing:"0.18em",
            }}>
              SISTEMA PROTEGIDO · ACESSO MONITORADO
            </div>
          </div>

          <div style={{ height:1, background:"linear-gradient(90deg,transparent,rgba(255,255,255,.04),transparent)" }}/>
        </div>

        <style>{`
          @keyframes dtg-in    { from{opacity:0;transform:translateY(-10px) scale(.97)} to{opacity:1;transform:translateY(0) scale(1)} }
          @keyframes dtg-shake { 0%,100%{transform:translateX(0)} 20%{transform:translateX(-10px)} 40%{transform:translateX(10px)} 60%{transform:translateX(-6px)} 80%{transform:translateX(6px)} }
          @keyframes dtg-glitch{ 0%{transform:translateX(0) skewX(0)} 25%{transform:translateX(-4px) skewX(-1deg)} 50%{transform:translateX(4px) skewX(1deg)} 75%{transform:translateX(-2px)} 100%{transform:translateX(0)} }
          @keyframes dtg-pulse { 0%,100%{opacity:.35} 50%{opacity:1} }
          @keyframes dtg-float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-5px)} }
        `}</style>
      </div>
    </>
  );
}