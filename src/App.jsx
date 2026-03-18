import { useState, useEffect, useCallback } from "react";

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const DAYS_SHORT = ["일", "월", "화", "수", "목", "금", "토"];
const MEMBERS = ["시은", "지수"];
const M = {
  시은: { accent: "#FF4D8D", bg: "#FFD6E7", text: "#8B1A4A", dim: "rgba(255,77,141,0.12)" },
  지수: { accent: "#9B59F5", bg: "#E8D5FF", text: "#3D1A6B", dim: "rgba(155,89,245,0.12)" },
};
const WEEK_GOAL = 2;
const STORAGE_KEY = "adminnite-v2";

// ── date helpers ──────────────────────────────────────────────
function getWeekKey(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split("T")[0];
}
function getWeekDates(wk) {
  const mon = new Date(wk);
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return d.toISOString().split("T")[0]; });
}
function fmt(ds) { const d=new Date(ds); return `${d.getMonth()+1}/${d.getDate()}`; }
function fmtFull(ds) { const d=new Date(ds); return `${d.getMonth()+1}월 ${d.getDate()}일`; }
function getMonthDates(year, month) {
  // returns array of {dateStr, isCurrentMonth}
  const first = new Date(year, month, 1);
  const last  = new Date(year, month+1, 0);
  const startDow = first.getDay(); // 0=Sun
  const rows = [];
  // pad before
  for (let i=0; i<startDow; i++) {
    const d = new Date(year, month, 1-startDow+i);
    rows.push({ dateStr: d.toISOString().split("T")[0], cur: false });
  }
  for (let i=1; i<=last.getDate(); i++) {
    const d = new Date(year, month, i);
    rows.push({ dateStr: d.toISOString().split("T")[0], cur: true });
  }
  while (rows.length % 7 !== 0) {
    const d = new Date(year, month+1, rows.length - last.getDate() - startDow + 1);
    rows.push({ dateStr: d.toISOString().split("T")[0], cur: false });
  }
  return rows;
}

// ── storage ──────────────────────────────────────────────────
async function loadData() {
  try {
    const r = await window.storage.get(STORAGE_KEY, true);
    return r?.value ? JSON.parse(r.value) : {};
  } catch { return {}; }
}
async function persistData(d) {
  try { await window.storage.set(STORAGE_KEY, JSON.stringify(d), true); return true; }
  catch { return false; }
}

// ── main component ────────────────────────────────────────────
export default function App() {
  const todayStr = new Date().toISOString().split("T")[0];
  const [tab, setTab]           = useState("week");   // week | month | todos
  const [data, setDataRaw]      = useState({});
  const [weekKey, setWeekKey]   = useState(getWeekKey(new Date()));
  const [monthIdx, setMonthIdx] = useState({ y: new Date().getFullYear(), m: new Date().getMonth() });
  const [todoInput, setTodoInput] = useState({ 시은:"", 지수:"" });
  const [confetti, setConfetti] = useState(false);
  const [sync, setSync]         = useState("idle"); // idle|saving|saved|error
  const [lastSync, setLastSync] = useState(null);
  const [goalInput, setGoalInput] = useState({ 시은:"", 지수:"" });

  // load on mount
  useEffect(() => { loadData().then(d => { setDataRaw(d); setLastSync(new Date()); }); }, []);

  // poll every 20s
  useEffect(() => {
    const t = setInterval(() => loadData().then(d => { setDataRaw(d); setLastSync(new Date()); }), 20000);
    return () => clearInterval(t);
  }, []);

  const save = useCallback(async (next) => {
    setSync("saving");
    const ok = await persistData(next);
    setSync(ok ? "saved" : "error");
    setLastSync(new Date());
    setTimeout(() => setSync("idle"), 1600);
  }, []);

  function setData(fn) {
    setDataRaw(prev => { const next = fn(prev); save(next); return next; });
  }

  // ── week helpers ──
  const weekDates = getWeekDates(weekKey);
  const wd = data[weekKey] || {};
  const votes   = (ds) => wd.votes?.[ds] || [];
  const bothOk  = (ds) => MEMBERS.every(m => votes(ds).includes(m));
  const done    = (ds) => (wd.completed||[]).includes(ds);
  const doneCount = (wd.completed||[]).length;
  const progress = Math.min(doneCount/WEEK_GOAL, 1);

  function toggleVote(ds, member) {
    setData(prev => {
      const w = prev[weekKey]||{};
      const v = w.votes||{};
      const dv = v[ds]||[];
      const nv = dv.includes(member) ? dv.filter(x=>x!==member) : [...dv,member];
      return {...prev, [weekKey]: {...w, votes:{...v,[ds]:nv}}};
    });
  }
  function toggleDone(ds) {
    setData(prev => {
      const w = prev[weekKey]||{};
      const c = w.completed||[];
      const adding = !c.includes(ds);
      const nc = adding ? [...c,ds] : c.filter(x=>x!==ds);
      if (adding) { setConfetti(true); setTimeout(()=>setConfetti(false),2200); }
      return {...prev, [weekKey]: {...w, completed:nc}};
    });
  }

  // ── month helpers ──
  const monthDates = getMonthDates(monthIdx.y, monthIdx.m);
  function allCompleted() {
    // gather all completed dates across all weeks
    return Object.values(data).flatMap(w => w.completed||[]);
  }
  function getDateVotes(ds) {
    // find which week this date belongs to
    const wk = getWeekKey(ds);
    return data[wk]?.votes?.[ds] || [];
  }
  function isDateDone(ds) {
    const wk = getWeekKey(ds);
    return (data[wk]?.completed||[]).includes(ds);
  }
  function prevMonth() { setMonthIdx(p => p.m===0 ? {y:p.y-1,m:11} : {y:p.y,m:p.m-1}); }
  function nextMonth() { setMonthIdx(p => p.m===11 ? {y:p.y+1,m:0} : {y:p.y,m:p.m+1}); }

  // ── todos ──
  function addTodo(member) {
    const text = todoInput[member].trim(); if (!text) return;
    setData(prev => {
      const w = prev[weekKey]||{};
      const t = w.todos||{};
      return {...prev, [weekKey]: {...w, todos:{...t,[member]:[...(t[member]||[]),{id:Date.now(),text,done:false}]}}};
    });
    setTodoInput(p=>({...p,[member]:""}));
  }
  function toggleTodo(member,id) {
    setData(prev => {
      const w=prev[weekKey]||{}; const t=w.todos||{};
      return {...prev,[weekKey]:{...w,todos:{...t,[member]:(t[member]||[]).map(x=>x.id===id?{...x,done:!x.done}:x)}}};
    });
  }
  function delTodo(member,id) {
    setData(prev => {
      const w=prev[weekKey]||{}; const t=w.todos||{};
      return {...prev,[weekKey]:{...w,todos:{...t,[member]:(t[member]||[]).filter(x=>x.id!==id)}}};
    });
  }

  // ── goals ──
  function addGoal(member) {
    const text = goalInput[member].trim(); if(!text) return;
    setData(prev => {
      const goals = prev._goals||{};
      return {...prev, _goals:{...goals,[member]:[...(goals[member]||[]),{id:Date.now(),text}]}};
    });
    setGoalInput(p=>({...p,[member]:""}));
  }
  function delGoal(member,id) {
    setData(prev => {
      const goals = prev._goals||{};
      return {...prev, _goals:{...goals,[member]:(goals[member]||[]).filter(x=>x.id!==id)}};
    });
  }

  // ── stats ──
  const allWks = Object.keys(data).filter(k=>k!=='_goals');
  const totalSessions = allWks.reduce((a,wk)=>a+(data[wk]?.completed||[]).length,0);
  const goalMet = allWks.filter(wk=>(data[wk]?.completed||[]).length>=WEEK_GOAL).length;

  const syncColor = sync==="saved"?"#FFD84D":sync==="saving"?"rgba(255,216,77,0.5)":sync==="error"?"#F87171":"#3A3A4A";
  const syncLabel = sync==="saved"?"✓ 저장됨":sync==="saving"?"동기화 중...":sync==="error"?"오류":lastSync?`${lastSync.getHours()}:${String(lastSync.getMinutes()).padStart(2,"0")} 동기화`:"대기중";

  const MONTH_NAMES = ["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>
      {/* confetti */}
      {confetti && (
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:9999,overflow:"hidden"}}>
          {Array.from({length:40}).map((_,i)=>(
            <div key={i} style={{position:"absolute",left:`${Math.random()*100}%`,top:"-10px",width:7,height:7,borderRadius:Math.random()>.5?"50%":"2px",background:["#FFD84D","#FF4D8D","#9B59F5","#4ADE80","#fff"][i%5],animation:`cffall ${.7+Math.random()*.9}s ${Math.random()*.5}s linear forwards`}}/>
          ))}
        </div>
      )}

      {/* ── HEADER ── */}
      <header style={{background:"var(--surface)",borderBottom:"1px solid var(--border)",padding:"20px 20px 16px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:500,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <span style={{fontSize:24}}>🌙</span>
            <div>
              <div style={{fontSize:18,fontWeight:900,letterSpacing:"-0.5px"}}>어드민나잇</div>
              <div style={{fontSize:10,color:"var(--text-muted)",letterSpacing:"1px"}}>ADMIN NIGHT</div>
            </div>
            <div style={{marginLeft:"auto",textAlign:"right"}}>
              <div style={{fontSize:10,color:syncColor,marginBottom:3}}>{syncLabel}</div>
              <div style={{fontSize:20,fontWeight:900,color:"var(--yellow)"}}>{totalSessions}<span style={{fontSize:10,color:"var(--text-muted)",marginLeft:3,fontWeight:400}}>총 완료</span></div>
            </div>
          </div>

          {/* stats row */}
          <div style={{display:"flex",gap:8,marginBottom:14}}>
            {[
              {label:"이번주",value:`${doneCount}/${WEEK_GOAL}`,color:doneCount>=WEEK_GOAL?"var(--green)":"var(--yellow)"},
              {label:"목표달성",value:`${goalMet}주`,color:"var(--yellow)"},
              {label:"총세션",value:`${totalSessions}회`,color:"var(--yellow)"},
            ].map(s=>(
              <div key={s.label} style={{flex:1,background:"var(--surface2)",borderRadius:10,padding:"8px 10px",textAlign:"center"}}>
                <div style={{fontSize:16,fontWeight:900,color:s.color}}>{s.value}</div>
                <div style={{fontSize:10,color:"var(--text-faint)",marginTop:1}}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* tabs */}
          <div style={{display:"flex",gap:3,background:"var(--surface2)",borderRadius:12,padding:3}}>
            {[["week","📅 주간"],["month","🗓 월간"],["todos","📝 할 일"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)} style={{flex:1,border:"none",borderRadius:9,padding:"8px 0",cursor:"pointer",fontSize:12,fontWeight:700,transition:"all .2s",background:tab===id?"var(--yellow)":"transparent",color:tab===id?"#0E0E16":"var(--text-faint)"}}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main style={{maxWidth:500,margin:"0 auto",padding:"16px 16px 40px"}}>

        {/* ════ WEEK TAB ════ */}
        {tab==="week" && (
          <>
            {/* week nav */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <button onClick={()=>{const d=new Date(weekKey);d.setDate(d.getDate()-7);setWeekKey(getWeekKey(d));}} style={{background:"var(--surface2)",border:"none",color:"var(--text)",borderRadius:9,padding:"7px 13px",cursor:"pointer",fontSize:15}}>‹</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:14,fontWeight:700}}>{fmt(weekDates[0])} – {fmt(weekDates[6])}</div>
                {weekKey===getWeekKey(new Date())&&<div style={{fontSize:10,color:"var(--yellow)",marginTop:1}}>이번 주</div>}
              </div>
              <button onClick={()=>{const d=new Date(weekKey);d.setDate(d.getDate()+7);setWeekKey(getWeekKey(d));}} style={{background:"var(--surface2)",border:"none",color:"var(--text)",borderRadius:9,padding:"7px 13px",cursor:"pointer",fontSize:15}}>›</button>
            </div>

            {/* progress */}
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:11,color:"var(--text-muted)"}}>이번 주 진행도</span>
                <span style={{fontSize:11,fontWeight:700,color:doneCount>=WEEK_GOAL?"var(--green)":"var(--yellow)"}}>{doneCount>=WEEK_GOAL?"🎉 목표 달성!":`${doneCount}/${WEEK_GOAL}회`}</span>
              </div>
              <div style={{height:6,background:"var(--surface2)",borderRadius:999}}>
                <div style={{height:"100%",borderRadius:999,transition:"width .5s ease",width:`${progress*100}%`,background:doneCount>=WEEK_GOAL?"var(--green)":"var(--yellow)"}}/>
              </div>
            </div>

            {/* days */}
            <div style={{display:"flex",flexDirection:"column",gap:7}}>
              {weekDates.map((ds,i)=>{
                const v=votes(ds); const ok=bothOk(ds); const d=done(ds); const isToday=ds===todayStr;
                return (
                  <div key={ds} style={{background:d?"var(--green-dim)":ok?"var(--yellow-dim)":"var(--surface2)",border:`1px solid ${d?"var(--green-border)":ok?"var(--yellow-border)":"var(--border)"}`,borderRadius:14,padding:"11px 13px",position:"relative"}}>
                    {isToday&&<div style={{position:"absolute",top:9,right:12,fontSize:9,color:"var(--yellow)",fontWeight:700,letterSpacing:"1px"}}>TODAY</div>}
                    <div style={{display:"flex",alignItems:"center",gap:9}}>
                      <div style={{minWidth:42,textAlign:"center"}}>
                        <div style={{fontSize:10,color:i>=5?"#FF6B6B":"var(--text-faint)"}}>{DAYS[i]}</div>
                        <div style={{fontSize:16,fontWeight:900,color:isToday?"var(--yellow)":"var(--text)"}}>{fmt(ds)}</div>
                      </div>
                      <div style={{display:"flex",gap:5,flex:1}}>
                        {MEMBERS.map(mb=>{
                          const voted=v.includes(mb); const c=M[mb];
                          return <button key={mb} onClick={()=>toggleVote(ds,mb)} style={{flex:1,border:`1.5px solid ${voted?c.accent:"rgba(255,255,255,0.08)"}`,borderRadius:9,padding:"5px 7px",cursor:"pointer",fontSize:11,fontWeight:700,transition:"all .18s",background:voted?c.bg:"transparent",color:voted?c.text:"var(--text-faint)"}}>
                            {voted?"✓":"○"} {mb}
                          </button>;
                        })}
                      </div>
                      {ok&&<button onClick={()=>toggleDone(ds)} style={{border:"none",borderRadius:9,padding:"7px 11px",cursor:"pointer",fontSize:15,background:d?"var(--green-dim)":"var(--surface)",color:d?"var(--green)":"var(--text-faint)"}}>
                        {d?"✅":"🔲"}
                      </button>}
                    </div>
                    {(ok||d)&&<div style={{marginTop:7,paddingLeft:51}}>
                      <span style={{fontSize:10,fontWeight:700,padding:"2px 9px",borderRadius:999,background:d?"var(--green-dim)":"var(--yellow-dim)",color:d?"var(--green)":"var(--yellow)"}}>
                        {d?"✓ 완료!":"🌙 어드민나잇 가능!"}
                      </span>
                    </div>}
                  </div>
                );
              })}
            </div>

            {/* confirmed summary */}
            {weekDates.filter(bothOk).length>0&&(
              <div style={{marginTop:12,background:"var(--yellow-dim)",border:"1px solid var(--yellow-border)",borderRadius:12,padding:13}}>
                <div style={{fontSize:11,fontWeight:700,color:"var(--yellow)",marginBottom:5}}>🤝 둘 다 가능한 날</div>
                <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                  {weekDates.filter(bothOk).map(d=>(
                    <span key={d} style={{fontSize:11,padding:"3px 9px",background:"rgba(255,216,77,0.1)",borderRadius:999,color:"var(--text)"}}>
                      {DAYS[weekDates.indexOf(d)]} {fmt(d)} {done(d)?"✅":""}
                    </span>
                  ))}
                </div>
              </div>
            )}
          </>
        )}

        {/* ════ MONTH TAB ════ */}
        {tab==="month" && (
          <>
            {/* month nav */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <button onClick={prevMonth} style={{background:"var(--surface2)",border:"none",color:"var(--text)",borderRadius:9,padding:"7px 13px",cursor:"pointer",fontSize:15}}>‹</button>
              <div style={{fontSize:15,fontWeight:900}}>{monthIdx.y}년 {MONTH_NAMES[monthIdx.m]}</div>
              <button onClick={nextMonth} style={{background:"var(--surface2)",border:"none",color:"var(--text)",borderRadius:9,padding:"7px 13px",cursor:"pointer",fontSize:15}}>›</button>
            </div>

            {/* goals section */}
            <div style={{display:"flex",gap:8,marginBottom:16}}>
              {MEMBERS.map(mb=>{
                const c=M[mb];
                const goals=(data._goals||{})[mb]||[];
                return (
                  <div key={mb} style={{flex:1,background:"var(--surface2)",borderRadius:12,padding:12,border:`1px solid ${c.accent}22`}}>
                    <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:8}}>
                      <div style={{width:7,height:7,borderRadius:"50%",background:c.accent}}/>
                      <span style={{fontSize:12,fontWeight:700}}>{mb}의 목표</span>
                    </div>
                    <div style={{display:"flex",gap:5,marginBottom:8}}>
                      <input value={goalInput[mb]} onChange={e=>setGoalInput(p=>({...p,[mb]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addGoal(mb)} placeholder="목표 추가" style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${c.accent}30`,borderRadius:7,padding:"6px 9px",color:"var(--text)",fontSize:11,outline:"none"}}/>
                      <button onClick={()=>addGoal(mb)} style={{background:c.accent,border:"none",borderRadius:7,padding:"6px 10px",cursor:"pointer",color:"#fff",fontSize:13,fontWeight:700}}>+</button>
                    </div>
                    {goals.length===0
                      ?<div style={{fontSize:11,color:"var(--text-faint)",textAlign:"center",padding:"6px 0"}}>목표를 추가해봐!</div>
                      :<div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {goals.map(g=>(
                          <div key={g.id} style={{display:"flex",alignItems:"center",gap:6,padding:"5px 7px",background:"rgba(255,255,255,0.03)",borderRadius:7}}>
                            <span style={{fontSize:10,color:c.accent}}>✦</span>
                            <span style={{flex:1,fontSize:11,color:"var(--text)"}}>{g.text}</span>
                            <button onClick={()=>delGoal(mb,g.id)} style={{background:"none",border:"none",color:"var(--text-faint)",cursor:"pointer",fontSize:13}}>×</button>
                          </div>
                        ))}
                      </div>
                    }
                  </div>
                );
              })}
            </div>

            {/* calendar grid */}
            <div style={{background:"var(--surface2)",borderRadius:14,padding:12,border:"1px solid var(--border)"}}>
              {/* dow headers */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:6}}>
                {DAYS_SHORT.map((d,i)=>(
                  <div key={d} style={{textAlign:"center",fontSize:10,fontWeight:700,color:i===0?"#FF6B6B":i===6?"#6B8BFF":"var(--text-faint)",padding:"4px 0"}}>{d}</div>
                ))}
              </div>
              {/* date cells */}
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
                {monthDates.map(({dateStr,cur})=>{
                  const isDone = isDateDone(dateStr);
                  const v = getDateVotes(dateStr);
                  const sieon = v.includes("시은");
                  const jisu  = v.includes("지수");
                  const isToday = dateStr===todayStr;
                  const dow = new Date(dateStr).getDay();
                  return (
                    <div key={dateStr} style={{aspectRatio:"1",borderRadius:9,display:"flex",flexDirection:"column",alignItems:"center",justifyContent:"center",gap:2,background:isDone?"var(--green-dim)":isToday?"var(--yellow-dim)":"transparent",border:`1px solid ${isDone?"var(--green-border)":isToday?"var(--yellow-border)":"transparent"}`,opacity:cur?1:0.3,position:"relative"}}>
                      <span style={{fontSize:11,fontWeight:isToday?900:500,color:isDone?"var(--green)":isToday?"var(--yellow)":dow===0?"#FF6B6B":dow===6?"#6B8BFF":cur?"var(--text)":"var(--text-faint)"}}>
                        {new Date(dateStr).getDate()}
                      </span>
                      {/* dots for votes */}
                      {(sieon||jisu)&&<div style={{display:"flex",gap:2}}>
                        {sieon&&<div style={{width:4,height:4,borderRadius:"50%",background:"#FF4D8D"}}/>}
                        {jisu&&<div style={{width:4,height:4,borderRadius:"50%",background:"#9B59F5"}}/>}
                      </div>}
                      {isDone&&<div style={{fontSize:8}}>✅</div>}
                    </div>
                  );
                })}
              </div>

              {/* legend */}
              <div style={{display:"flex",gap:12,marginTop:12,flexWrap:"wrap",justifyContent:"center"}}>
                {[
                  {color:"var(--green)",label:"완료한 날"},
                  {color:"var(--yellow)",label:"오늘"},
                  {color:"#FF4D8D",label:"시은 가능"},
                  {color:"#9B59F5",label:"지수 가능"},
                ].map(l=>(
                  <div key={l.label} style={{display:"flex",alignItems:"center",gap:5}}>
                    <div style={{width:8,height:8,borderRadius:"50%",background:l.color}}/>
                    <span style={{fontSize:10,color:"var(--text-muted)"}}>{l.label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* completed list for this month */}
            {(()=>{
              const completedThisMonth = monthDates
                .filter(({cur,dateStr})=>cur&&isDateDone(dateStr))
                .map(({dateStr})=>dateStr);
              if(!completedThisMonth.length) return null;
              return (
                <div style={{marginTop:12,background:"var(--green-dim)",border:"1px solid var(--green-border)",borderRadius:12,padding:13}}>
                  <div style={{fontSize:11,fontWeight:700,color:"var(--green)",marginBottom:8}}>{MONTH_NAMES[monthIdx.m]} 완료한 어드민나잇 🌙</div>
                  <div style={{display:"flex",flexDirection:"column",gap:5}}>
                    {completedThisMonth.map(ds=>(
                      <div key={ds} style={{display:"flex",alignItems:"center",gap:8,fontSize:12}}>
                        <span style={{color:"var(--green)"}}>✅</span>
                        <span>{fmtFull(ds)} ({DAYS[new Date(ds).getDay()===0?6:new Date(ds).getDay()-1]})</span>
                      </div>
                    ))}
                  </div>
                </div>
              );
            })()}
          </>
        )}

        {/* ════ TODOS TAB ════ */}
        {tab==="todos" && (
          <>
            {/* week nav for todos */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <button onClick={()=>{const d=new Date(weekKey);d.setDate(d.getDate()-7);setWeekKey(getWeekKey(d));}} style={{background:"var(--surface2)",border:"none",color:"var(--text)",borderRadius:9,padding:"7px 13px",cursor:"pointer",fontSize:15}}>‹</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:13,fontWeight:700}}>{fmt(weekDates[0])} – {fmt(weekDates[6])}</div>
                {weekKey===getWeekKey(new Date())&&<div style={{fontSize:10,color:"var(--yellow)",marginTop:1}}>이번 주</div>}
              </div>
              <button onClick={()=>{const d=new Date(weekKey);d.setDate(d.getDate()+7);setWeekKey(getWeekKey(d));}} style={{background:"var(--surface2)",border:"none",color:"var(--text)",borderRadius:9,padding:"7px 13px",cursor:"pointer",fontSize:15}}>›</button>
            </div>

            <div style={{display:"flex",flexDirection:"column",gap:14}}>
              {MEMBERS.map(mb=>{
                const c=M[mb];
                const todos=(wd.todos||{})[mb]||[];
                const doneCnt=todos.filter(t=>t.done).length;
                return (
                  <div key={mb} style={{background:"var(--surface2)",border:`1px solid ${c.accent}22`,borderRadius:14,padding:15}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:11}}>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <div style={{width:8,height:8,borderRadius:"50%",background:c.accent}}/>
                        <span style={{fontWeight:900,fontSize:14}}>{mb}의 할 일</span>
                      </div>
                      {todos.length>0&&<span style={{fontSize:10,color:"var(--text-faint)"}}>{doneCnt}/{todos.length}</span>}
                    </div>
                    <div style={{display:"flex",gap:7,marginBottom:9}}>
                      <input value={todoInput[mb]} onChange={e=>setTodoInput(p=>({...p,[mb]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addTodo(mb)} placeholder="할 일 추가..." style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${c.accent}30`,borderRadius:9,padding:"8px 11px",color:"var(--text)",fontSize:12,outline:"none"}}/>
                      <button onClick={()=>addTodo(mb)} style={{background:c.accent,border:"none",borderRadius:9,padding:"8px 13px",cursor:"pointer",color:"#fff",fontSize:15,fontWeight:700}}>+</button>
                    </div>
                    {todos.length===0
                      ?<div style={{textAlign:"center",color:"var(--text-faint)",fontSize:11,padding:"10px 0"}}>아직 할 일이 없어요!</div>
                      :<div style={{display:"flex",flexDirection:"column",gap:5}}>
                        {todos.map(t=>(
                          <div key={t.id} style={{display:"flex",alignItems:"center",gap:9,padding:"7px 9px",background:"rgba(255,255,255,0.03)",borderRadius:9}}>
                            <button onClick={()=>toggleTodo(mb,t.id)} style={{width:18,height:18,borderRadius:5,border:`2px solid ${t.done?c.accent:"rgba(255,255,255,0.15)"}`,background:t.done?c.accent:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                              {t.done&&<span style={{color:"#fff",fontSize:10}}>✓</span>}
                            </button>
                            <span style={{flex:1,fontSize:12,color:t.done?"var(--text-faint)":"var(--text)",textDecoration:t.done?"line-through":"none"}}>{t.text}</span>
                            <button onClick={()=>delTodo(mb,t.id)} style={{background:"none",border:"none",color:"var(--text-faint)",cursor:"pointer",fontSize:14}}>×</button>
                          </div>
                        ))}
                      </div>
                    }
                  </div>
                );
              })}
            </div>
          </>
        )}
      </main>
    </div>
  );
}
