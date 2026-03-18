import { useState, useEffect, useCallback, useRef } from "react";

const DAYS = ["월", "화", "수", "목", "금", "토", "일"];
const DAYS_SHORT = ["일", "월", "화", "수", "목", "금", "토"];
const MEMBERS = ["시은", "지수"];
const M = {
  시은: { accent: "#FF4D8D", bg: "#FFD6E7", text: "#8B1A4A" },
  지수: { accent: "#9B59F5", bg: "#E8D5FF", text: "#3D1A6B" },
};
const WEEK_GOAL = 2;
const STORAGE_KEY = "adminnite-v4";

function getWeekKey(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  return new Date(d.setDate(diff)).toISOString().split("T")[0];
}
function getWeekDates(wk) {
  const mon = new Date(wk);
  return Array.from({length:7}, (_,i) => {
    const d = new Date(mon); d.setDate(mon.getDate()+i);
    return d.toISOString().split("T")[0];
  });
}
function fmt(ds) { const d = new Date(ds); return `${d.getMonth()+1}/${d.getDate()}`; }
function fmtFull(ds) { const d = new Date(ds); return `${d.getMonth()+1}월 ${d.getDate()}일`; }
function getDayLabel(ds) { return DAYS[new Date(ds).getDay() === 0 ? 6 : new Date(ds).getDay()-1]; }
function getMonthDates(y, m) {
  const first = new Date(y, m, 1);
  const last  = new Date(y, m+1, 0);
  const rows  = [];
  for (let i = 0; i < first.getDay(); i++) {
    const d = new Date(y, m, 1 - first.getDay() + i);
    rows.push({ dateStr: d.toISOString().split("T")[0], cur: false });
  }
  for (let i = 1; i <= last.getDate(); i++) {
    const d = new Date(y, m, i);
    rows.push({ dateStr: d.toISOString().split("T")[0], cur: true });
  }
  while (rows.length % 7 !== 0) {
    const d = new Date(y, m+1, rows.length - last.getDate() - first.getDay() + 1);
    rows.push({ dateStr: d.toISOString().split("T")[0], cur: false });
  }
  return rows;
}

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

export default function App() {
  const todayStr = new Date().toISOString().split("T")[0];
  const [tab, setTab]             = useState("week");
  const [data, setDataRaw]        = useState({});
  const [weekKey, setWeekKey]     = useState(getWeekKey(new Date()));
  const [monthIdx, setMonthIdx]   = useState({ y: new Date().getFullYear(), m: new Date().getMonth() });
  // 투표 로컬 상태 (저장 전 편집용)
  const [localVotes, setLocalVotes] = useState(null); // null = 서버 데이터 사용
  const [voteEditing, setVoteEditing] = useState(false);
  // 완료 날 기록 팝업
  const [completeDayModal, setCompleteDayModal] = useState(null); // dateStr
  const [completeTodoInput, setCompleteTodoInput] = useState({ 시은:"", 지수:"" });
  // 월간 날짜 상세 팝업
  const [monthDetailDay, setMonthDetailDay] = useState(null);
  const [todoInput, setTodoInput] = useState({ 시은:"", 지수:"" });
  const [goalInput, setGoalInput] = useState({ 시은:"", 지수:"" });
  const [confetti, setConfetti]   = useState(false);
  const [sync, setSync]           = useState("idle");
  const [lastSync, setLastSync]   = useState(null);
  const isSaving   = useRef(false);
  const lastSaveTs = useRef(0);

  useEffect(() => {
    loadData().then(d => { setDataRaw(d); setLastSync(new Date()); });
  }, []);

  useEffect(() => {
    const t = setInterval(() => {
      if (isSaving.current || Date.now() - lastSaveTs.current < 6000) return;
      loadData().then(d => { setDataRaw(d); setLastSync(new Date()); });
    }, 20000);
    return () => clearInterval(t);
  }, []);

  const save = useCallback(async (next) => {
    isSaving.current = true;
    setSync("saving");
    const ok = await persistData(next);
    lastSaveTs.current = Date.now();
    isSaving.current = false;
    setSync(ok ? "saved" : "error");
    setLastSync(new Date());
    setTimeout(() => setSync("idle"), 1800);
  }, []);

  function setData(fn) {
    setDataRaw(prev => { const next = fn(prev); save(next); return next; });
  }

  // ── week 데이터 ──
  const weekDates = getWeekDates(weekKey);
  const wd = data[weekKey] || {};

  // 투표: localVotes 있으면 그거, 없으면 서버 데이터
  const savedVotes  = wd.votes || {};
  const activeVotes = localVotes || savedVotes;
  const getVotes    = (ds) => activeVotes[ds] || [];
  const getSavedVotes = (ds) => savedVotes[ds] || [];
  const bothVotedSaved = (ds) => MEMBERS.every(m => getSavedVotes(ds).includes(m));
  const confirmed   = wd.confirmed || [];
  const isConfirmed = (ds) => confirmed.includes(ds);
  const getCompleted = (ds) => { const wk = getWeekKey(ds); return (data[wk]?.completed||[]).includes(ds); };
  const weekCompleted = wd.completed || [];
  const doneCount   = weekCompleted.length;
  const progress    = Math.min(doneCount / WEEK_GOAL, 1);
  // 완료 날 기록된 할일
  const getDayRecord = (ds) => { const wk = getWeekKey(ds); return data[wk]?.dayRecords?.[ds] || {}; };

  // 투표 편집 시작
  function startVoteEdit() {
    setLocalVotes(JSON.parse(JSON.stringify(savedVotes)));
    setVoteEditing(true);
  }
  function cancelVoteEdit() {
    setLocalVotes(null);
    setVoteEditing(false);
  }
  function toggleLocalVote(ds, member) {
    if (!voteEditing) return;
    setLocalVotes(prev => {
      const cur = (prev[ds] || []);
      const nv  = cur.includes(member) ? cur.filter(x=>x!==member) : [...cur, member];
      return { ...prev, [ds]: nv };
    });
  }
  function saveVotes() {
    setData(prev => {
      const w = prev[weekKey] || {};
      return { ...prev, [weekKey]: { ...w, votes: localVotes } };
    });
    setLocalVotes(null);
    setVoteEditing(false);
  }

  function toggleConfirm(ds) {
    setData(prev => {
      const w  = prev[weekKey] || {};
      const c  = w.confirmed || [];
      const nc = c.includes(ds) ? c.filter(x=>x!==ds) : [...c, ds];
      return { ...prev, [weekKey]: { ...w, confirmed: nc } };
    });
  }

  function toggleComplete(ds) {
    const wk = getWeekKey(ds);
    const isComp = getCompleted(ds);
    if (!isComp) {
      // 완료 처리 + 기록 모달 열기
      setData(prev => {
        const w  = prev[wk] || {};
        const c  = w.completed || [];
        return { ...prev, [wk]: { ...w, completed: [...c, ds] } };
      });
      setCompleteDayModal(ds);
      setCompleteTodoInput({ 시은:"", 지수:"" });
      setConfetti(true); setTimeout(() => setConfetti(false), 2400);
    } else {
      setData(prev => {
        const w  = prev[wk] || {};
        const c  = w.completed || [];
        return { ...prev, [wk]: { ...w, completed: c.filter(x=>x!==ds) } };
      });
    }
  }

  // 완료 날 할일 추가
  function addDayRecord(ds, member) {
    const text = completeTodoInput[member].trim(); if(!text) return;
    const wk = getWeekKey(ds);
    setData(prev => {
      const w  = prev[wk] || {};
      const dr = w.dayRecords || {};
      const dayRec = dr[ds] || {};
      const memberRec = dayRec[member] || [];
      return { ...prev, [wk]: { ...w, dayRecords: { ...dr, [ds]: { ...dayRec, [member]: [...memberRec, { id: Date.now(), text }] } } } };
    });
    setCompleteTodoInput(p => ({ ...p, [member]: "" }));
  }
  function delDayRecord(ds, member, id) {
    const wk = getWeekKey(ds);
    setData(prev => {
      const w  = prev[wk] || {};
      const dr = w.dayRecords || {};
      const dayRec = dr[ds] || {};
      return { ...prev, [wk]: { ...w, dayRecords: { ...dr, [ds]: { ...dayRec, [member]: (dayRec[member]||[]).filter(x=>x.id!==id) } } } };
    });
  }

  // ── month ──
  const monthDates = getMonthDates(monthIdx.y, monthIdx.m);
  function isDateConfirmed(ds) { return (data[getWeekKey(ds)]?.confirmed||[]).includes(ds); }
  function getDateVotes(ds)    { return data[getWeekKey(ds)]?.votes?.[ds] || []; }
  function prevMonth() { setMonthIdx(p => p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1}); }
  function nextMonth() { setMonthIdx(p => p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1}); }

  // ── todos ──
  function addTodo(member) {
    const text = todoInput[member].trim(); if(!text) return;
    setData(prev => {
      const w = prev[weekKey]||{}; const t = w.todos||{};
      return {...prev,[weekKey]:{...w,todos:{...t,[member]:[...(t[member]||[]),{id:Date.now(),text,done:false}]}}};
    });
    setTodoInput(p=>({...p,[member]:""}));
  }
  function toggleTodo(member,id) {
    setData(prev=>{
      const w=prev[weekKey]||{};const t=w.todos||{};
      return{...prev,[weekKey]:{...w,todos:{...t,[member]:(t[member]||[]).map(x=>x.id===id?{...x,done:!x.done}:x)}}};
    });
  }
  function delTodo(member,id) {
    setData(prev=>{
      const w=prev[weekKey]||{};const t=w.todos||{};
      return{...prev,[weekKey]:{...w,todos:{...t,[member]:(t[member]||[]).filter(x=>x.id!==id)}}};
    });
  }
  function addGoal(member) {
    const text=goalInput[member].trim();if(!text)return;
    setData(prev=>{const g=prev._goals||{};return{...prev,_goals:{...g,[member]:[...(g[member]||[]),{id:Date.now(),text}]}};});
    setGoalInput(p=>({...p,[member]:""}));
  }
  function delGoal(member,id) {
    setData(prev=>{const g=prev._goals||{};return{...prev,_goals:{...g,[member]:(g[member]||[]).filter(x=>x.id!==id)}};});
  }

  const allWks     = Object.keys(data).filter(k=>k!=="_goals");
  const totalDone  = allWks.reduce((a,wk)=>a+(data[wk]?.completed||[]).length,0);
  const goalMetWks = allWks.filter(wk=>(data[wk]?.completed||[]).length>=WEEK_GOAL).length;
  const MONTH_NAMES=["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
  const syncColor = sync==="saved"?"#FFD84D":sync==="saving"?"rgba(255,216,77,0.5)":sync==="error"?"#F87171":"#444";
  const syncLabel = sync==="saved"?"✓ 저장됨":sync==="saving"?"저장 중...":sync==="error"?"오류":lastSync?`${lastSync.getHours()}:${String(lastSync.getMinutes()).padStart(2,"0")} 동기화`:"대기중";

  function prevWeek(){const d=new Date(weekKey);d.setDate(d.getDate()-7);setWeekKey(getWeekKey(d));}
  function nextWeek(){const d=new Date(weekKey);d.setDate(d.getDate()+7);setWeekKey(getWeekKey(d));}

  return (
    <div style={{minHeight:"100vh",background:"var(--bg)",color:"var(--text)"}}>

      {/* confetti */}
      {confetti&&(
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:9999,overflow:"hidden"}}>
          {Array.from({length:40}).map((_,i)=>(
            <div key={i} style={{position:"absolute",left:`${Math.random()*100}%`,top:"-10px",width:7,height:7,borderRadius:Math.random()>.5?"50%":"2px",background:["#FFD84D","#FF4D8D","#9B59F5","#4ADE80","#fff"][i%5],animation:`cffall ${.7+Math.random()*.9}s ${Math.random()*.5}s linear forwards`}}/>
          ))}
        </div>
      )}

      {/* ── 완료 기록 모달 ── */}
      {completeDayModal && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"var(--surface)",borderRadius:18,padding:20,width:"100%",maxWidth:420,border:"1px solid var(--border)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div>
                <div style={{fontSize:15,fontWeight:900}}>🌙 어드민나잇 완료!</div>
                <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>{fmtFull(completeDayModal)} ({getDayLabel(completeDayModal)}) — 오늘 한 일을 기록해봐</div>
              </div>
              <button onClick={()=>setCompleteDayModal(null)} style={{background:"none",border:"none",color:"var(--text-faint)",fontSize:20,cursor:"pointer"}}>×</button>
            </div>
            {MEMBERS.map(mb=>{
              const c=M[mb];
              const records=getDayRecord(completeDayModal)[mb]||[];
              return(
                <div key={mb} style={{marginBottom:12}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:c.accent}}/>
                    <span style={{fontSize:12,fontWeight:700,color:c.accent}}>{mb}의 오늘 한 일</span>
                  </div>
                  <div style={{display:"flex",gap:6,marginBottom:6}}>
                    <input value={completeTodoInput[mb]} onChange={e=>setCompleteTodoInput(p=>({...p,[mb]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addDayRecord(completeDayModal,mb)} placeholder="오늘 한 일 추가..." style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${c.accent}35`,borderRadius:9,padding:"8px 11px",color:"var(--text)",fontSize:12,outline:"none"}}/>
                    <button onClick={()=>addDayRecord(completeDayModal,mb)} style={{background:c.accent,border:"none",borderRadius:9,padding:"8px 13px",cursor:"pointer",color:"#fff",fontSize:15,fontWeight:700}}>+</button>
                  </div>
                  {records.map(r=>(
                    <div key={r.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 8px",background:"rgba(255,255,255,0.03)",borderRadius:7,marginBottom:4}}>
                      <span style={{fontSize:10,color:c.accent}}>✦</span>
                      <span style={{flex:1,fontSize:11}}>{r.text}</span>
                      <button onClick={()=>delDayRecord(completeDayModal,mb,r.id)} style={{background:"none",border:"none",color:"var(--text-faint)",cursor:"pointer",fontSize:13}}>×</button>
                    </div>
                  ))}
                </div>
              );
            })}
            <button onClick={()=>setCompleteDayModal(null)} style={{width:"100%",background:"var(--yellow)",border:"none",borderRadius:11,padding:"11px 0",fontSize:13,fontWeight:900,color:"#0E0E16",cursor:"pointer",marginTop:4}}>저장하고 닫기</button>
          </div>
        </div>
      )}

      {/* ── 월간 날짜 상세 모달 ── */}
      {monthDetailDay && (
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.7)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"var(--surface)",borderRadius:18,padding:20,width:"100%",maxWidth:420,border:"1px solid var(--border)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <div>
                <div style={{fontSize:15,fontWeight:900}}>{getCompleted(monthDetailDay)?"✅":"📌"} {fmtFull(monthDetailDay)}</div>
                <div style={{fontSize:11,color:"var(--text-muted)",marginTop:2}}>{getDayLabel(monthDetailDay)}요일</div>
              </div>
              <button onClick={()=>setMonthDetailDay(null)} style={{background:"none",border:"none",color:"var(--text-faint)",fontSize:20,cursor:"pointer"}}>×</button>
            </div>
            {getCompleted(monthDetailDay) ? (
              <>
                <div style={{fontSize:11,fontWeight:700,color:"var(--green)",marginBottom:10}}>🌙 이날 어드민나잇에서 한 일</div>
                {MEMBERS.map(mb=>{
                  const c=M[mb];
                  const records=getDayRecord(monthDetailDay)[mb]||[];
                  return(
                    <div key={mb} style={{marginBottom:12}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:5}}>
                        <div style={{width:7,height:7,borderRadius:"50%",background:c.accent}}/>
                        <span style={{fontSize:12,fontWeight:700,color:c.accent}}>{mb}</span>
                      </div>
                      {records.length===0
                        ?<div style={{fontSize:10,color:"var(--text-faint)",paddingLeft:13}}>기록 없음</div>
                        :records.map(r=>(
                          <div key={r.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 8px",background:`rgba(${mb==="시은"?"255,77,141":"155,89,245"},0.06)`,borderRadius:7,marginBottom:4}}>
                            <span style={{fontSize:10,color:c.accent}}>✦</span>
                            <span style={{flex:1,fontSize:11}}>{r.text}</span>
                            <button onClick={()=>delDayRecord(monthDetailDay,mb,r.id)} style={{background:"none",border:"none",color:"var(--text-faint)",cursor:"pointer",fontSize:13}}>×</button>
                          </div>
                        ))
                      }
                      {/* 추가도 가능 */}
                      <div style={{display:"flex",gap:5,marginTop:4}}>
                        <input value={completeTodoInput[mb]} onChange={e=>setCompleteTodoInput(p=>({...p,[mb]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addDayRecord(monthDetailDay,mb)} placeholder="추가하기..." style={{flex:1,background:"rgba(255,255,255,0.04)",border:`1px solid ${c.accent}28`,borderRadius:7,padding:"5px 8px",color:"var(--text)",fontSize:10,outline:"none"}}/>
                        <button onClick={()=>addDayRecord(monthDetailDay,mb)} style={{background:c.accent,border:"none",borderRadius:7,padding:"5px 9px",cursor:"pointer",color:"#fff",fontSize:11,fontWeight:700}}>+</button>
                      </div>
                    </div>
                  );
                })}
              </>
            ) : (
              <div style={{fontSize:11,color:"var(--text-muted)",textAlign:"center",padding:"20px 0"}}>
                {isDateConfirmed(monthDetailDay)?"📌 약속 확정된 날이야!":"아직 완료되지 않은 날이야"}
              </div>
            )}
            <button onClick={()=>{setMonthDetailDay(null);setCompleteTodoInput({시은:"",지수:""}); }} style={{width:"100%",background:"var(--surface2)",border:"none",borderRadius:11,padding:"10px 0",fontSize:12,fontWeight:700,color:"var(--text)",cursor:"pointer",marginTop:4}}>닫기</button>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <header style={{background:"var(--surface)",borderBottom:"1px solid var(--border)",padding:"18px 16px 14px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:500,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:12}}>
            <span style={{fontSize:22}}>🌙</span>
            <div>
              <div style={{fontSize:17,fontWeight:900,letterSpacing:"-0.5px"}}>어드민나잇</div>
              <div style={{fontSize:9,color:"var(--text-muted)",letterSpacing:"1px"}}>ADMIN NIGHT</div>
            </div>
            <div style={{marginLeft:"auto",textAlign:"right"}}>
              <div style={{fontSize:9,color:syncColor,marginBottom:2}}>{syncLabel}</div>
              <div style={{fontSize:18,fontWeight:900,color:"var(--yellow)"}}>{totalDone}<span style={{fontSize:10,color:"var(--text-muted)",marginLeft:3,fontWeight:400}}>총 완료</span></div>
            </div>
          </div>
          <div style={{display:"flex",gap:7,marginBottom:12}}>
            {[
              {label:"이번주",value:`${doneCount}/${WEEK_GOAL}`,color:doneCount>=WEEK_GOAL?"var(--green)":"var(--yellow)"},
              {label:"목표달성",value:`${goalMetWks}주`,color:"var(--yellow)"},
              {label:"총세션",value:`${totalDone}회`,color:"var(--yellow)"},
            ].map(s=>(
              <div key={s.label} style={{flex:1,background:"var(--surface2)",borderRadius:9,padding:"7px 8px",textAlign:"center"}}>
                <div style={{fontSize:15,fontWeight:900,color:s.color}}>{s.value}</div>
                <div style={{fontSize:9,color:"var(--text-faint)",marginTop:1}}>{s.label}</div>
              </div>
            ))}
          </div>
          <div style={{display:"flex",gap:3,background:"var(--surface2)",borderRadius:11,padding:3}}>
            {[["week","📅 주간"],["month","🗓 월간"],["todos","📝 할 일"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)} style={{flex:1,border:"none",borderRadius:8,padding:"7px 0",cursor:"pointer",fontSize:11,fontWeight:700,transition:"all .2s",background:tab===id?"var(--yellow)":"transparent",color:tab===id?"#0E0E16":"var(--text-faint)"}}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main style={{maxWidth:500,margin:"0 auto",padding:"14px 14px 48px"}}>

        {/* ════ WEEK ════ */}
        {tab==="week" && (
          <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <button onClick={prevWeek} style={{background:"var(--surface2)",border:"none",color:"var(--text)",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:14}}>‹</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:13,fontWeight:700}}>{fmt(weekDates[0])} – {fmt(weekDates[6])}</div>
                {weekKey===getWeekKey(new Date())&&<div style={{fontSize:9,color:"var(--yellow)",marginTop:1}}>이번 주</div>}
              </div>
              <button onClick={nextWeek} style={{background:"var(--surface2)",border:"none",color:"var(--text)",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:14}}>›</button>
            </div>

            {/* progress */}
            <div style={{marginBottom:12}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:4}}>
                <span style={{fontSize:10,color:"var(--text-muted)"}}>이번 주 진행도</span>
                <span style={{fontSize:10,fontWeight:700,color:doneCount>=WEEK_GOAL?"var(--green)":"var(--yellow)"}}>{doneCount>=WEEK_GOAL?"🎉 목표 달성!":`${doneCount}/${WEEK_GOAL}회`}</span>
              </div>
              <div style={{height:5,background:"var(--surface2)",borderRadius:999}}>
                <div style={{height:"100%",borderRadius:999,transition:"width .5s",width:`${progress*100}%`,background:doneCount>=WEEK_GOAL?"var(--green)":"var(--yellow)"}}/>
              </div>
            </div>

            {/* 흐름 안내 */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"center",gap:6,marginBottom:12,padding:"7px 12px",background:"var(--surface2)",borderRadius:10}}>
              {[["1","투표 후 저장","var(--yellow)"],["→"],["2","약속확정 📌","#FF4D8D"],["→"],["3","완료+기록 ✅","var(--green)"]].map((item,i)=>(
                item[0]==="→"
                  ?<span key={i} style={{fontSize:10,color:"var(--text-faint)"}}>→</span>
                  :<div key={item[0]} style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:15,height:15,borderRadius:"50%",background:item[2],display:"flex",alignItems:"center",justifyContent:"center",fontSize:8,fontWeight:900,color:"#0E0E16"}}>{item[0]}</div>
                    <span style={{fontSize:9,color:"var(--text-muted)",whiteSpace:"nowrap"}}>{item[1]}</span>
                  </div>
              ))}
            </div>

            {/* 투표 섹션 */}
            <div style={{background:"var(--surface2)",borderRadius:13,padding:12,marginBottom:10,border:`1px solid ${voteEditing?"var(--yellow-border)":"var(--border)"}`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                <span style={{fontSize:12,fontWeight:700,color:voteEditing?"var(--yellow)":"var(--text-muted)"}}>
                  {voteEditing?"✏️ 가능한 날 선택 중...":"📋 가능한 날 투표"}
                </span>
                {!voteEditing
                  ?<button onClick={startVoteEdit} style={{background:"var(--yellow-dim)",border:"1px solid var(--yellow-border)",borderRadius:8,padding:"5px 12px",cursor:"pointer",color:"var(--yellow)",fontSize:11,fontWeight:700}}>수정하기</button>
                  :<div style={{display:"flex",gap:6}}>
                    <button onClick={cancelVoteEdit} style={{background:"rgba(255,255,255,0.05)",border:"1px solid var(--border)",borderRadius:8,padding:"5px 10px",cursor:"pointer",color:"var(--text-muted)",fontSize:11}}>취소</button>
                    <button onClick={saveVotes} style={{background:"var(--yellow)",border:"none",borderRadius:8,padding:"5px 12px",cursor:"pointer",color:"#0E0E16",fontSize:11,fontWeight:900}}>저장</button>
                  </div>
                }
              </div>
              <div style={{display:"flex",flexDirection:"column",gap:5}}>
                {weekDates.map((ds,i)=>{
                  const v=getVotes(ds);
                  const savedV=getSavedVotes(ds);
                  const isToday=ds===todayStr;
                  return(
                    <div key={ds} style={{display:"flex",alignItems:"center",gap:8}}>
                      <div style={{minWidth:52,display:"flex",alignItems:"center",gap:4}}>
                        <span style={{fontSize:10,color:i>=5?"#FF6B6B":"var(--text-faint)",width:14}}>{DAYS[i]}</span>
                        <span style={{fontSize:13,fontWeight:700,color:isToday?"var(--yellow)":"var(--text)"}}>{fmt(ds)}</span>
                      </div>
                      <div style={{display:"flex",gap:5,flex:1}}>
                        {MEMBERS.map(mb=>{
                          const c=M[mb];
                          const voted=v.includes(mb);
                          const savedVoted=savedV.includes(mb);
                          const changed=voted!==savedVoted&&voteEditing;
                          return(
                            <button key={mb}
                              onClick={()=>voteEditing&&toggleLocalVote(ds,mb)}
                              style={{flex:1,border:`1.5px solid ${voted?c.accent:changed?"rgba(255,216,77,0.3)":"rgba(255,255,255,0.07)"}`,borderRadius:8,padding:"5px 6px",cursor:voteEditing?"pointer":"default",fontSize:10,fontWeight:700,transition:"all .15s",background:voted?c.bg:"transparent",color:voted?c.text:"var(--text-faint)",opacity:voteEditing||voted?1:0.7}}>
                              {voted?"✓":"○"} {mb}
                            </button>
                          );
                        })}
                      </div>
                      {/* 확정/완료 버튼 (저장된 투표 기준) */}
                      {!voteEditing&&(
                        <div style={{display:"flex",gap:4}}>
                          {bothVotedSaved(ds)&&(
                            <button onClick={()=>toggleConfirm(ds)} title="약속 확정" style={{border:`1.5px solid ${isConfirmed(ds)?"rgba(255,255,255,0.15)":"#FF4D8D"}`,borderRadius:7,padding:"4px 8px",cursor:"pointer",fontSize:11,background:isConfirmed(ds)?"rgba(255,255,255,0.06)":"rgba(255,77,141,0.18)",color:isConfirmed(ds)?"var(--text-faint)":"#FF4D8D",fontWeight:700,transition:"all .18s"}}>
                              {isConfirmed(ds)?"확정됨":"📌 확정"}
                            </button>
                          )}
                          {isConfirmed(ds)&&(
                            <button onClick={()=>toggleComplete(ds)} title="완료!" style={{border:`1.5px solid ${getCompleted(ds)?"var(--green)":"rgba(74,222,128,0.3)"}`,borderRadius:7,padding:"4px 8px",cursor:"pointer",fontSize:12,background:getCompleted(ds)?"var(--green-dim)":"transparent",color:getCompleted(ds)?"var(--green)":"rgba(74,222,128,0.4)"}}>
                              {getCompleted(ds)?"✅":"🔲"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* 이번 주 요약 */}
            {(confirmed.length>0||weekCompleted.length>0)&&!voteEditing&&(
              <div style={{display:"flex",flexDirection:"column",gap:7}}>
                {confirmed.length>0&&(
                  <div style={{background:"rgba(255,77,141,0.07)",border:"1px solid rgba(255,77,141,0.2)",borderRadius:11,padding:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#FF4D8D",marginBottom:5}}>📌 이번 주 확정된 약속</div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {confirmed.map(d=>(
                        <span key={d} style={{fontSize:10,padding:"3px 8px",background:"rgba(255,77,141,0.1)",borderRadius:999,color:"var(--text)"}}>
                          {DAYS[weekDates.indexOf(d)]} {fmt(d)} {getCompleted(d)?"✅":""}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {weekCompleted.length>0&&(
                  <div style={{background:"var(--green-dim)",border:"1px solid var(--green-border)",borderRadius:11,padding:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:"var(--green)",marginBottom:6}}>✅ 이번 주 완료한 어드민나잇</div>
                    {weekCompleted.map(d=>{
                      const rec=getDayRecord(d);
                      return(
                        <div key={d} style={{marginBottom:8}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between"}}>
                            <span style={{fontSize:11,fontWeight:700}}>{getDayLabel(d)} {fmt(d)} 🌙</span>
                            <button onClick={()=>{setCompleteDayModal(d);setCompleteTodoInput({시은:"",지수:""}); }} style={{background:"rgba(74,222,128,0.12)",border:"1px solid var(--green-border)",borderRadius:7,padding:"3px 8px",cursor:"pointer",color:"var(--green)",fontSize:9,fontWeight:700}}>+ 기록추가</button>
                          </div>
                          {MEMBERS.map(mb=>{
                            const c=M[mb];
                            const items=rec[mb]||[];
                            if(!items.length) return null;
                            return(
                              <div key={mb} style={{marginTop:4,paddingLeft:8}}>
                                <span style={{fontSize:9,color:c.accent,fontWeight:700}}>{mb}: </span>
                                {items.map(r=><span key={r.id} style={{fontSize:9,color:"var(--text-muted)",marginRight:6}}>✦{r.text}</span>)}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}

        {/* ════ MONTH ════ */}
        {tab==="month"&&(
          <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <button onClick={prevMonth} style={{background:"var(--surface2)",border:"none",color:"var(--text)",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:14}}>‹</button>
              <div style={{fontSize:14,fontWeight:900}}>{monthIdx.y}년 {MONTH_NAMES[monthIdx.m]}</div>
              <button onClick={nextMonth} style={{background:"var(--surface2)",border:"none",color:"var(--text)",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:14}}>›</button>
            </div>

            {/* 목표 */}
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {MEMBERS.map(mb=>{
                const c=M[mb];const goals=(data._goals||{})[mb]||[];
                return(
                  <div key={mb} style={{flex:1,background:"var(--surface2)",borderRadius:12,padding:12,border:`1px solid ${c.accent}20`}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}>
                      <div style={{width:7,height:7,borderRadius:"50%",background:c.accent}}/>
                      <span style={{fontSize:11,fontWeight:700}}>{mb}의 목표</span>
                    </div>
                    <div style={{display:"flex",gap:5,marginBottom:7}}>
                      <input value={goalInput[mb]} onChange={e=>setGoalInput(p=>({...p,[mb]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addGoal(mb)} placeholder="목표 추가" style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${c.accent}28`,borderRadius:7,padding:"5px 8px",color:"var(--text)",fontSize:10,outline:"none"}}/>
                      <button onClick={()=>addGoal(mb)} style={{background:c.accent,border:"none",borderRadius:7,padding:"5px 9px",cursor:"pointer",color:"#fff",fontSize:12,fontWeight:700}}>+</button>
                    </div>
                    {goals.length===0
                      ?<div style={{fontSize:10,color:"var(--text-faint)",textAlign:"center",padding:"4px 0"}}>목표를 추가해봐!</div>
                      :<div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {goals.map(g=>(
                          <div key={g.id} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 6px",background:"rgba(255,255,255,0.03)",borderRadius:6}}>
                            <span style={{fontSize:9,color:c.accent}}>✦</span>
                            <span style={{flex:1,fontSize:10,color:"var(--text)"}}>{g.text}</span>
                            <button onClick={()=>delGoal(mb,g.id)} style={{background:"none",border:"none",color:"var(--text-faint)",cursor:"pointer",fontSize:12}}>×</button>
                          </div>
                        ))}
                      </div>
                    }
                  </div>
                );
              })}
            </div>

            {/* 캘린더 그리드 */}
            <div style={{background:"var(--surface2)",borderRadius:13,padding:11,border:"1px solid var(--border)"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:5}}>
                {DAYS_SHORT.map((d,i)=>(
                  <div key={d} style={{textAlign:"center",fontSize:9,fontWeight:700,color:i===0?"#FF6B6B":i===6?"#6B8BFF":"var(--text-faint)",padding:"3px 0"}}>{d}</div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
                {monthDates.map(({dateStr,cur})=>{
                  const comp=getCompleted(dateStr);
                  const conf=isDateConfirmed(dateStr);
                  const v=getDateVotes(dateStr);
                  const isToday=dateStr===todayStr;
                  const dow=new Date(dateStr).getDay();
                  const rec=getDayRecord(dateStr);
                  const sieonItems=rec["시은"]||[];
                  const jisuItems=rec["지수"]||[];
                  const hasRecords=sieonItems.length>0||jisuItems.length>0;
                  return(
                    <div key={dateStr}
                      onClick={()=>cur&&(comp||conf)&&setMonthDetailDay(dateStr)}
                      style={{minHeight:44,borderRadius:8,display:"flex",flexDirection:"column",alignItems:"center",padding:"4px 2px 5px",background:comp?"var(--green-dim)":conf?"rgba(255,77,141,0.13)":isToday?"var(--yellow-dim)":"transparent",border:`1px solid ${comp?"var(--green-border)":conf?"rgba(255,77,141,0.35)":isToday?"var(--yellow-border)":"transparent"}`,opacity:cur?1:0.25,cursor:cur&&(comp||conf)?"pointer":"default",transition:"all .15s"}}>
                      {/* 날짜 숫자 */}
                      <span style={{fontSize:10,fontWeight:isToday?900:500,color:comp?"var(--green)":conf?"#FF4D8D":isToday?"var(--yellow)":dow===0?"#FF6B6B":dow===6?"#6B8BFF":"var(--text)",lineHeight:1.2,marginBottom:2}}>
                        {new Date(dateStr).getDate()}
                      </span>
                      {/* 완료 기록 태그들 */}
                      {comp&&hasRecords&&(
                        <div style={{display:"flex",flexDirection:"column",gap:1,width:"100%",alignItems:"stretch"}}>
                          {sieonItems.slice(0,2).map(r=>(
                            <div key={r.id} style={{background:"rgba(255,77,141,0.18)",borderRadius:3,padding:"1px 3px",fontSize:7,color:"#FF4D8D",fontWeight:700,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>
                              {r.text}
                            </div>
                          ))}
                          {jisuItems.slice(0,2).map(r=>(
                            <div key={r.id} style={{background:"rgba(155,89,245,0.18)",borderRadius:3,padding:"1px 3px",fontSize:7,color:"#9B59F5",fontWeight:700,lineHeight:1.3,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap",maxWidth:"100%"}}>
                              {r.text}
                            </div>
                          ))}
                          {(sieonItems.length+jisuItems.length)>4&&(
                            <div style={{fontSize:6,color:"var(--text-faint)",textAlign:"center"}}>+{sieonItems.length+jisuItems.length-4}개</div>
                          )}
                        </div>
                      )}
                      {/* 투표 점 (기록 없을 때) */}
                      {!comp&&(v.includes("시은")||v.includes("지수"))&&(
                        <div style={{display:"flex",gap:1,marginTop:1}}>
                          {v.includes("시은")&&<div style={{width:3,height:3,borderRadius:"50%",background:"#FF4D8D"}}/>}
                          {v.includes("지수")&&<div style={{width:3,height:3,borderRadius:"50%",background:"#9B59F5"}}/>}
                        </div>
                      )}
                      {/* 확정 아이콘 */}
                      {conf&&!comp&&<span style={{fontSize:7,marginTop:1}}>📌</span>}
                    </div>
                  );
                })}
              </div>

              <div style={{display:"flex",gap:10,marginTop:10,flexWrap:"wrap",justifyContent:"center"}}>
                {[["var(--green)","완료"],["#FF4D8D","약속확정"],["var(--yellow)","오늘"],["#FF4D8D","시은",true],["#9B59F5","지수",true]].map(([color,label,dot])=>(
                  <div key={label} style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:dot?5:8,height:dot?5:8,borderRadius:"50%",background:color}}/>
                    <span style={{fontSize:9,color:"var(--text-muted)"}}>{label}{dot?" 기록":""}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 이달 완료 목록 */}
            {(()=>{
              const done=monthDates.filter(({cur,dateStr})=>cur&&getCompleted(dateStr)).map(({dateStr})=>dateStr);
              if(!done.length) return null;
              return(
                <div style={{marginTop:11,background:"var(--green-dim)",border:"1px solid var(--green-border)",borderRadius:11,padding:12}}>
                  <div style={{fontSize:10,fontWeight:700,color:"var(--green)",marginBottom:8}}>{MONTH_NAMES[monthIdx.m]} 완료한 어드민나잇 🌙</div>
                  {done.map(ds=>{
                    const rec=getDayRecord(ds);
                    return(
                      <div key={ds} style={{marginBottom:10,paddingBottom:8,borderBottom:"1px solid rgba(74,222,128,0.1)"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                          <span style={{fontSize:11,fontWeight:700}}>✅ {fmtFull(ds)} ({getDayLabel(ds)})</span>
                          <button onClick={()=>{setMonthDetailDay(ds);setCompleteTodoInput({시은:"",지수:""}); }} style={{background:"rgba(74,222,128,0.1)",border:"1px solid var(--green-border)",borderRadius:6,padding:"2px 7px",cursor:"pointer",color:"var(--green)",fontSize:9,fontWeight:700}}>상세</button>
                        </div>
                        {MEMBERS.map(mb=>{
                          const c=M[mb];const items=rec[mb]||[];
                          if(!items.length)return null;
                          return(
                            <div key={mb} style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:4,paddingLeft:6,marginBottom:2}}>
                              <span style={{fontSize:9,fontWeight:700,color:c.accent}}>{mb}</span>
                              {items.map(r=><span key={r.id} style={{fontSize:9,padding:"1px 6px",background:`rgba(${mb==="시은"?"255,77,141":"155,89,245"},0.1)`,borderRadius:999,color:c.accent}}>✦ {r.text}</span>)}
                            </div>
                          );
                        })}
                      </div>
                    );
                  })}
                </div>
              );
            })()}
          </>
        )}

        {/* ════ TODOS ════ */}
        {tab==="todos"&&(
          <>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
              <button onClick={prevWeek} style={{background:"var(--surface2)",border:"none",color:"var(--text)",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:14}}>‹</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:12,fontWeight:700}}>{fmt(weekDates[0])} – {fmt(weekDates[6])}</div>
                {weekKey===getWeekKey(new Date())&&<div style={{fontSize:9,color:"var(--yellow)",marginTop:1}}>이번 주</div>}
              </div>
              <button onClick={nextWeek} style={{background:"var(--surface2)",border:"none",color:"var(--text)",borderRadius:8,padding:"6px 12px",cursor:"pointer",fontSize:14}}>›</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {MEMBERS.map(mb=>{
                const c=M[mb];const todos=(wd.todos||{})[mb]||[];const doneCnt=todos.filter(t=>t.done).length;
                return(
                  <div key={mb} style={{background:"var(--surface2)",border:`1px solid ${c.accent}20`,borderRadius:13,padding:14}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                      <div style={{display:"flex",alignItems:"center",gap:6}}>
                        <div style={{width:7,height:7,borderRadius:"50%",background:c.accent}}/>
                        <span style={{fontWeight:900,fontSize:13}}>{mb}의 할 일</span>
                      </div>
                      {todos.length>0&&<span style={{fontSize:10,color:"var(--text-faint)"}}>{doneCnt}/{todos.length}</span>}
                    </div>
                    <div style={{display:"flex",gap:6,marginBottom:8}}>
                      <input value={todoInput[mb]} onChange={e=>setTodoInput(p=>({...p,[mb]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addTodo(mb)} placeholder="할 일 추가..." style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${c.accent}28`,borderRadius:8,padding:"7px 10px",color:"var(--text)",fontSize:11,outline:"none"}}/>
                      <button onClick={()=>addTodo(mb)} style={{background:c.accent,border:"none",borderRadius:8,padding:"7px 12px",cursor:"pointer",color:"#fff",fontSize:14,fontWeight:700}}>+</button>
                    </div>
                    {todos.length===0
                      ?<div style={{textAlign:"center",color:"var(--text-faint)",fontSize:10,padding:"8px 0"}}>아직 할 일이 없어요!</div>
                      :<div style={{display:"flex",flexDirection:"column",gap:5}}>
                        {todos.map(t=>(
                          <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"6px 8px",background:"rgba(255,255,255,0.03)",borderRadius:8}}>
                            <button onClick={()=>toggleTodo(mb,t.id)} style={{width:17,height:17,borderRadius:5,border:`2px solid ${t.done?c.accent:"rgba(255,255,255,0.15)"}`,background:t.done?c.accent:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                              {t.done&&<span style={{color:"#fff",fontSize:9}}>✓</span>}
                            </button>
                            <span style={{flex:1,fontSize:11,color:t.done?"var(--text-faint)":"var(--text)",textDecoration:t.done?"line-through":"none"}}>{t.text}</span>
                            <button onClick={()=>delTodo(mb,t.id)} style={{background:"none",border:"none",color:"var(--text-faint)",cursor:"pointer",fontSize:13}}>×</button>
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
