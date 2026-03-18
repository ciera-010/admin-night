import { useState, useEffect, useCallback, useRef } from "react";

const DAYS = ["월","화","수","목","금","토","일"];
const DAYS_SHORT = ["일","월","화","수","목","금","토"];
const MEMBERS = ["시은","지수"];
const M = {
  시은: { accent:"#FF4D8D", bg:"rgba(255,77,141,0.15)", text:"#FF4D8D" },
  지수: { accent:"#9B59F5", bg:"rgba(155,89,245,0.15)", text:"#9B59F5" },
};
const WEEK_GOAL = 2;
const STORAGE_KEY = "adminnite-v5";

function getWeekKey(date) {
  const d = new Date(date); d.setHours(0,0,0,0);
  const day = d.getDay();
  return new Date(d.setDate(d.getDate()-day+(day===0?-6:1))).toISOString().split("T")[0];
}
function getWeekDates(wk) {
  const mon = new Date(wk);
  return Array.from({length:7},(_,i)=>{ const d=new Date(mon); d.setDate(mon.getDate()+i); return d.toISOString().split("T")[0]; });
}
function fmt(ds) { const d=new Date(ds); return `${d.getMonth()+1}/${d.getDate()}`; }
function fmtFull(ds) { const d=new Date(ds); return `${d.getMonth()+1}월 ${d.getDate()}일`; }
function getDayLabel(ds) { return DAYS[new Date(ds).getDay()===0?6:new Date(ds).getDay()-1]; }
function getMonthDates(y,m) {
  const first=new Date(y,m,1), last=new Date(y,m+1,0), rows=[];
  for(let i=0;i<first.getDay();i++){const d=new Date(y,m,1-first.getDay()+i);rows.push({dateStr:d.toISOString().split("T")[0],cur:false});}
  for(let i=1;i<=last.getDate();i++){const d=new Date(y,m,i);rows.push({dateStr:d.toISOString().split("T")[0],cur:true});}
  while(rows.length%7!==0){const d=new Date(y,m+1,rows.length-last.getDate()-first.getDay()+1);rows.push({dateStr:d.toISOString().split("T")[0],cur:false});}
  return rows;
}

async function loadData() {
  try { const r=await window.storage.get(STORAGE_KEY,true); return r?.value?JSON.parse(r.value):{}; }
  catch { return {}; }
}
async function persistData(d) {
  try { await window.storage.set(STORAGE_KEY,JSON.stringify({...d,_savedAt:Date.now()}),true); return true; }
  catch { return false; }
}
function mergeData(local,remote) {
  if(!remote) return local; if(!local) return remote;
  return (remote._savedAt||0)>(local._savedAt||0)?remote:local;
}

export default function App() {
  const todayStr = new Date().toISOString().split("T")[0];
  const [tab,setTab]                   = useState("week");
  const [data,setDataRaw]              = useState({});
  const [weekKey,setWeekKey]           = useState(getWeekKey(new Date()));
  const [monthIdx,setMonthIdx]         = useState({y:new Date().getFullYear(),m:new Date().getMonth()});
  const [localVotes,setLocalVotes]     = useState(null);
  const [voteEditing,setVoteEditing]   = useState(false);
  const [completeDayModal,setCompleteDayModal] = useState(null);
  const [completeTodoInput,setCompleteTodoInput] = useState({시은:"",지수:""});
  const [monthDetailDay,setMonthDetailDay] = useState(null);
  const [todoInput,setTodoInput]       = useState({시은:"",지수:""});
  const [goalInput,setGoalInput]       = useState({시은:"",지수:""});
  const [confetti,setConfetti]         = useState(false);
  const [sync,setSync]                 = useState("idle");
  const [lastSync,setLastSync]         = useState(null);
  const isSaving = useRef(false);

  useEffect(()=>{ loadData().then(d=>{setDataRaw(d);setLastSync(new Date());}); },[]);
  useEffect(()=>{
    const t=setInterval(async()=>{
      if(isSaving.current) return;
      const remote=await loadData();
      setDataRaw(prev=>{
        if((remote._savedAt||0)>(prev._savedAt||0)){setLastSync(new Date());return remote;}
        return prev;
      });
    },15000);
    return()=>clearInterval(t);
  },[]);

  const save=useCallback(async(next)=>{
    isSaving.current=true; setSync("saving");
    const ok=await persistData(next);
    isSaving.current=false;
    setSync(ok?"saved":"error"); setLastSync(new Date());
    setTimeout(()=>setSync("idle"),1800);
  },[]);

  function setData(fn){
    setDataRaw(prev=>{
      const next=fn(prev);
      const withTs={...next,_savedAt:Date.now()};
      save(withTs); return withTs;
    });
  }

  // ── week helpers ──
  const weekDates=getWeekDates(weekKey);
  const wd=data[weekKey]||{};
  const savedVotes=wd.votes||{};
  const activeVotes=localVotes||savedVotes;
  const getVotes=(ds)=>activeVotes[ds]||[];
  const getSavedVotes=(ds)=>savedVotes[ds]||[];
  const bothSaved=(ds)=>MEMBERS.every(m=>getSavedVotes(ds).includes(m));
  const confirmed=wd.confirmed||[];
  const isConfirmed=(ds)=>confirmed.includes(ds);
  const getCompleted=(ds)=>{const wk=getWeekKey(ds);return(data[wk]?.completed||[]).includes(ds);};
  const weekCompleted=wd.completed||[];
  const doneCount=weekCompleted.length;
  const getDayRecord=(ds)=>{const wk=getWeekKey(ds);return data[wk]?.dayRecords?.[ds]||{};};

  function startVoteEdit(){setLocalVotes(JSON.parse(JSON.stringify(savedVotes)));setVoteEditing(true);}
  function cancelVoteEdit(){setLocalVotes(null);setVoteEditing(false);}
  function toggleLocalVote(ds,member){
    if(!voteEditing)return;
    setLocalVotes(prev=>{const cur=(prev[ds]||[]);return{...prev,[ds]:cur.includes(member)?cur.filter(x=>x!==member):[...cur,member]};});
  }
  function saveVotes(){
    setData(prev=>{const w=prev[weekKey]||{};return{...prev,[weekKey]:{...w,votes:localVotes}};});
    setLocalVotes(null);setVoteEditing(false);
  }
  function toggleConfirm(ds){
    setData(prev=>{const w=prev[weekKey]||{};const c=w.confirmed||[];const nc=c.includes(ds)?c.filter(x=>x!==ds):[...c,ds];return{...prev,[weekKey]:{...w,confirmed:nc}};});
  }
  function toggleComplete(ds){
    const wk=getWeekKey(ds);const isComp=getCompleted(ds);
    if(!isComp){
      setData(prev=>{const w=prev[wk]||{};return{...prev,[wk]:{...w,completed:[...(w.completed||[]),ds]}};});
      setCompleteDayModal(ds);setCompleteTodoInput({시은:"",지수:""});
      setConfetti(true);setTimeout(()=>setConfetti(false),2400);
    } else {
      setData(prev=>{const w=prev[wk]||{};return{...prev,[wk]:{...w,completed:(w.completed||[]).filter(x=>x!==ds)}};});
    }
  }
  function addDayRecord(ds,member){
    const text=completeTodoInput[member].trim();if(!text)return;
    const wk=getWeekKey(ds);
    setData(prev=>{
      const w=prev[wk]||{};const dr=w.dayRecords||{};const dayRec=dr[ds]||{};
      return{...prev,[wk]:{...w,dayRecords:{...dr,[ds]:{...dayRec,[member]:[...(dayRec[member]||[]),{id:Date.now(),text}]}}}};
    });
    setCompleteTodoInput(p=>({...p,[member]:""}));
  }
  function delDayRecord(ds,member,id){
    const wk=getWeekKey(ds);
    setData(prev=>{const w=prev[wk]||{};const dr=w.dayRecords||{};const dayRec=dr[ds]||{};return{...prev,[wk]:{...w,dayRecords:{...dr,[ds]:{...dayRec,[member]:(dayRec[member]||[]).filter(x=>x.id!==id)}}}};});
  }

  // month
  const monthDates=getMonthDates(monthIdx.y,monthIdx.m);
  function isDateConfirmed(ds){return(data[getWeekKey(ds)]?.confirmed||[]).includes(ds);}
  function getDateVotes(ds){return data[getWeekKey(ds)]?.votes?.[ds]||[];}
  function prevMonth(){setMonthIdx(p=>p.m===0?{y:p.y-1,m:11}:{y:p.y,m:p.m-1});}
  function nextMonth(){setMonthIdx(p=>p.m===11?{y:p.y+1,m:0}:{y:p.y,m:p.m+1});}

  // todos
  function addTodo(mb){const text=todoInput[mb].trim();if(!text)return;setData(prev=>{const w=prev[weekKey]||{};const t=w.todos||{};return{...prev,[weekKey]:{...w,todos:{...t,[mb]:[...(t[mb]||[]),{id:Date.now(),text,done:false}]}}};});setTodoInput(p=>({...p,[mb]:""}));}  function toggleTodo(mb,id){setData(prev=>{const w=prev[weekKey]||{};const t=w.todos||{};return{...prev,[weekKey]:{...w,todos:{...t,[mb]:(t[mb]||[]).map(x=>x.id===id?{...x,done:!x.done}:x)}}};});}
  function delTodo(mb,id){setData(prev=>{const w=prev[weekKey]||{};const t=w.todos||{};return{...prev,[weekKey]:{...w,todos:{...t,[mb]:(t[mb]||[]).filter(x=>x.id!==id)}}};});}
  function addGoal(mb){const text=goalInput[mb].trim();if(!text)return;setData(prev=>{const g=prev._goals||{};return{...prev,_goals:{...g,[mb]:[...(g[mb]||[]),{id:Date.now(),text}]}};});setGoalInput(p=>({...p,[mb]:""}));}
  function delGoal(mb,id){setData(prev=>{const g=prev._goals||{};return{...prev,_goals:{...g,[mb]:(g[mb]||[]).filter(x=>x.id!==id)}};});}

  const allWks=Object.keys(data).filter(k=>k!=="_goals"&&k!=="_savedAt");
  const totalDone=allWks.reduce((a,wk)=>a+(data[wk]?.completed||[]).length,0);
  const goalMetWks=allWks.filter(wk=>(data[wk]?.completed||[]).length>=WEEK_GOAL).length;
  const MONTH_NAMES=["1월","2월","3월","4월","5월","6월","7월","8월","9월","10월","11월","12월"];
  const syncDot=sync==="saved"?"#FFD84D":sync==="saving"?"rgba(255,216,77,0.5)":sync==="error"?"#F87171":"#333";
  const syncLabel=sync==="saved"?"저장됨":sync==="saving"?"저장 중...":sync==="error"?"오류":lastSync?`${lastSync.getHours()}:${String(lastSync.getMinutes()).padStart(2,"0")}`:"";

  function prevWeek(){const d=new Date(weekKey);d.setDate(d.getDate()-7);setWeekKey(getWeekKey(d));}
  function nextWeek(){const d=new Date(weekKey);d.setDate(d.getDate()+7);setWeekKey(getWeekKey(d));}

  // ── 컬러 헬퍼 ──
  // 상태별 노랑 계층
  const rowBg=(comp,conf,both)=>conf&&!comp?"rgba(255,216,77,0.06)":both&&!conf&&!comp?"rgba(255,255,255,0.03)":"transparent";
  const rowBorder=(comp,conf,both)=>conf&&!comp?"rgba(255,216,77,0.15)":both&&!conf&&!comp?"rgba(255,255,255,0.06)":"rgba(255,255,255,0.04)";

  return (
    <div style={{minHeight:"100vh",background:"#0E0E16",color:"#F0EFE8",fontFamily:"'Apple SD Gothic Neo','Noto Sans KR',sans-serif"}}>

      {/* confetti */}
      {confetti&&(
        <div style={{position:"fixed",inset:0,pointerEvents:"none",zIndex:9999,overflow:"hidden"}}>
          {Array.from({length:36}).map((_,i)=>(
            <div key={i} style={{position:"absolute",left:`${Math.random()*100}%`,top:"-8px",width:6,height:6,borderRadius:Math.random()>.5?"50%":"2px",background:["#FFD84D","#FF4D8D","#9B59F5","#fff"][i%4],animation:`cffall ${.6+Math.random()*.8}s ${Math.random()*.4}s linear forwards`}}/>
          ))}
          <style>{`@keyframes cffall{to{top:110vh;transform:rotate(540deg);opacity:0}}`}</style>
        </div>
      )}

      {/* ── 완료 기록 모달 ── */}
      {completeDayModal&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#16161F",borderRadius:20,padding:20,width:"100%",maxWidth:420,border:"1px solid rgba(255,216,77,0.2)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div>
                <div style={{fontSize:16,fontWeight:900,color:"#FFD84D"}}>🌙 어드민나잇 완료!</div>
                <div style={{fontSize:11,color:"rgba(255,255,255,0.4)",marginTop:3}}>{fmtFull(completeDayModal)} ({getDayLabel(completeDayModal)}) — 오늘 한 일 기록</div>
              </div>
              <button onClick={()=>setCompleteDayModal(null)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.3)",fontSize:22,cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            {MEMBERS.map(mb=>{
              const c=M[mb];const records=getDayRecord(completeDayModal)[mb]||[];
              return(
                <div key={mb} style={{marginBottom:14}}>
                  <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:7}}>
                    <div style={{width:6,height:6,borderRadius:"50%",background:c.accent}}/>
                    <span style={{fontSize:12,fontWeight:700,color:c.accent}}>{mb}</span>
                  </div>
                  <div style={{display:"flex",gap:6,marginBottom:6}}>
                    <input value={completeTodoInput[mb]} onChange={e=>setCompleteTodoInput(p=>({...p,[mb]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addDayRecord(completeDayModal,mb)} placeholder="오늘 한 일..." style={{flex:1,background:"rgba(255,255,255,0.05)",border:`1px solid ${c.accent}30`,borderRadius:9,padding:"8px 11px",color:"#F0EFE8",fontSize:12,outline:"none"}}/>
                    <button onClick={()=>addDayRecord(completeDayModal,mb)} style={{background:c.accent,border:"none",borderRadius:9,padding:"8px 13px",cursor:"pointer",color:"#fff",fontSize:14,fontWeight:700}}>+</button>
                  </div>
                  {records.map(r=>(
                    <div key={r.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 9px",background:c.bg,borderRadius:8,marginBottom:4}}>
                      <span style={{fontSize:10,color:c.accent}}>✦</span>
                      <span style={{flex:1,fontSize:11}}>{r.text}</span>
                      <button onClick={()=>delDayRecord(completeDayModal,mb,r.id)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.2)",cursor:"pointer",fontSize:14,lineHeight:1}}>×</button>
                    </div>
                  ))}
                </div>
              );
            })}
            <button onClick={()=>setCompleteDayModal(null)} style={{width:"100%",background:"#FFD84D",border:"none",borderRadius:12,padding:"12px 0",fontSize:13,fontWeight:900,color:"#0E0E16",cursor:"pointer",marginTop:4}}>저장하고 닫기 ✓</button>
          </div>
        </div>
      )}

      {/* ── 월간 날짜 상세 모달 ── */}
      {monthDetailDay&&(
        <div style={{position:"fixed",inset:0,background:"rgba(0,0,0,0.75)",zIndex:500,display:"flex",alignItems:"center",justifyContent:"center",padding:16}}>
          <div style={{background:"#16161F",borderRadius:20,padding:20,width:"100%",maxWidth:420,border:"1px solid rgba(255,255,255,0.08)"}}>
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:16}}>
              <div>
                <div style={{fontSize:15,fontWeight:900}}>{getCompleted(monthDetailDay)?"✅":"📌"} {fmtFull(monthDetailDay)}</div>
                <div style={{fontSize:10,color:"rgba(255,255,255,0.35)",marginTop:2}}>{getDayLabel(monthDetailDay)}요일</div>
              </div>
              <button onClick={()=>{setMonthDetailDay(null);setCompleteTodoInput({시은:"",지수:""}); }} style={{background:"none",border:"none",color:"rgba(255,255,255,0.3)",fontSize:22,cursor:"pointer",lineHeight:1}}>×</button>
            </div>
            {getCompleted(monthDetailDay)?(
              <>
                {MEMBERS.map(mb=>{
                  const c=M[mb];const records=getDayRecord(monthDetailDay)[mb]||[];
                  return(
                    <div key={mb} style={{marginBottom:14}}>
                      <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:6}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:c.accent}}/>
                        <span style={{fontSize:12,fontWeight:700,color:c.accent}}>{mb}</span>
                      </div>
                      {records.length===0
                        ?<div style={{fontSize:10,color:"rgba(255,255,255,0.25)",paddingLeft:12}}>기록 없음</div>
                        :records.map(r=>(
                          <div key={r.id} style={{display:"flex",alignItems:"center",gap:7,padding:"5px 9px",background:c.bg,borderRadius:8,marginBottom:4}}>
                            <span style={{fontSize:10,color:c.accent}}>✦</span>
                            <span style={{flex:1,fontSize:11}}>{r.text}</span>
                            <button onClick={()=>delDayRecord(monthDetailDay,mb,r.id)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.2)",cursor:"pointer",fontSize:14}}>×</button>
                          </div>
                        ))
                      }
                      <div style={{display:"flex",gap:5,marginTop:5}}>
                        <input value={completeTodoInput[mb]} onChange={e=>setCompleteTodoInput(p=>({...p,[mb]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addDayRecord(monthDetailDay,mb)} placeholder="추가..." style={{flex:1,background:"rgba(255,255,255,0.04)",border:`1px solid ${c.accent}25`,borderRadius:7,padding:"5px 8px",color:"#F0EFE8",fontSize:10,outline:"none"}}/>
                        <button onClick={()=>addDayRecord(monthDetailDay,mb)} style={{background:c.accent,border:"none",borderRadius:7,padding:"5px 9px",cursor:"pointer",color:"#fff",fontSize:11,fontWeight:700}}>+</button>
                      </div>
                    </div>
                  );
                })}
              </>
            ):(
              <div style={{fontSize:11,color:"rgba(255,255,255,0.35)",textAlign:"center",padding:"20px 0"}}>
                {isDateConfirmed(monthDetailDay)?"📌 약속 확정된 날":"아직 완료되지 않은 날이야"}
              </div>
            )}
            <button onClick={()=>{setMonthDetailDay(null);setCompleteTodoInput({시은:"",지수:""});}} style={{width:"100%",background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:12,padding:"10px 0",fontSize:12,fontWeight:700,color:"rgba(255,255,255,0.6)",cursor:"pointer",marginTop:4}}>닫기</button>
          </div>
        </div>
      )}

      {/* ── HEADER ── */}
      <header style={{background:"#12121C",borderBottom:"1px solid rgba(255,255,255,0.05)",padding:"18px 16px 14px",position:"sticky",top:0,zIndex:100}}>
        <div style={{maxWidth:480,margin:"0 auto"}}>
          <div style={{display:"flex",alignItems:"center",gap:10,marginBottom:14}}>
            <span style={{fontSize:22}}>🌙</span>
            <div>
              <div style={{fontSize:17,fontWeight:900,letterSpacing:"-0.5px"}}>어드민나잇</div>
              <div style={{fontSize:9,color:"rgba(255,255,255,0.3)",letterSpacing:"1.5px"}}>ADMIN NIGHT</div>
            </div>
            <div style={{marginLeft:"auto",textAlign:"right"}}>
              <div style={{display:"flex",alignItems:"center",gap:4,justifyContent:"flex-end",marginBottom:3}}>
                <div style={{width:5,height:5,borderRadius:"50%",background:syncDot}}/>
                <span style={{fontSize:9,color:syncDot}}>{syncLabel}</span>
              </div>
              <div><span style={{fontSize:20,fontWeight:900,color:"#FFD84D"}}>{totalDone}</span><span style={{fontSize:9,color:"rgba(255,255,255,0.3)",marginLeft:3}}>총 완료</span></div>
            </div>
          </div>

          {/* stats */}
          <div style={{display:"flex",gap:6,marginBottom:14}}>
            {[
              {label:"이번주",value:`${doneCount}/${WEEK_GOAL}`,hi:doneCount>=WEEK_GOAL},
              {label:"목표달성",value:`${goalMetWks}주`,hi:false},
              {label:"총세션",value:`${totalDone}회`,hi:false},
            ].map(s=>(
              <div key={s.label} style={{flex:1,background:"rgba(255,255,255,0.04)",borderRadius:10,padding:"8px 6px",textAlign:"center",border:`1px solid ${s.hi?"rgba(255,216,77,0.3)":"rgba(255,255,255,0.05)"}`}}>
                <div style={{fontSize:15,fontWeight:900,color:s.hi?"#FFD84D":"rgba(255,216,77,0.7)"}}>{s.value}</div>
                <div style={{fontSize:9,color:"rgba(255,255,255,0.25)",marginTop:1}}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* tabs */}
          <div style={{display:"flex",gap:2,background:"rgba(255,255,255,0.04)",borderRadius:11,padding:3}}>
            {[["week","주간"],["month","월간"],["todos","할 일"]].map(([id,label])=>(
              <button key={id} onClick={()=>setTab(id)} style={{flex:1,border:"none",borderRadius:8,padding:"8px 0",cursor:"pointer",fontSize:12,fontWeight:700,transition:"all .2s",background:tab===id?"#FFD84D":"transparent",color:tab===id?"#0E0E16":"rgba(255,255,255,0.3)"}}>
                {label}
              </button>
            ))}
          </div>
        </div>
      </header>

      <main style={{maxWidth:480,margin:"0 auto",padding:"16px 14px 48px"}}>

        {/* ════ WEEK ════ */}
        {tab==="week"&&(
          <>
            {/* week nav */}
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <button onClick={prevWeek} style={{background:"rgba(255,255,255,0.05)",border:"none",color:"rgba(255,255,255,0.6)",borderRadius:8,padding:"7px 13px",cursor:"pointer",fontSize:14}}>‹</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:13,fontWeight:700}}>{fmt(weekDates[0])} – {fmt(weekDates[6])}</div>
                {weekKey===getWeekKey(new Date())&&<div style={{fontSize:9,color:"#FFD84D",marginTop:1}}>이번 주</div>}
              </div>
              <button onClick={nextWeek} style={{background:"rgba(255,255,255,0.05)",border:"none",color:"rgba(255,255,255,0.6)",borderRadius:8,padding:"7px 13px",cursor:"pointer",fontSize:14}}>›</button>
            </div>

            {/* progress */}
            <div style={{marginBottom:16}}>
              <div style={{display:"flex",justifyContent:"space-between",marginBottom:5}}>
                <span style={{fontSize:10,color:"rgba(255,255,255,0.3)"}}>이번 주 진행도</span>
                <span style={{fontSize:10,fontWeight:700,color:doneCount>=WEEK_GOAL?"#FFD84D":"rgba(255,216,77,0.5)"}}>{doneCount>=WEEK_GOAL?"🎉 목표 달성!":`${doneCount}/${WEEK_GOAL}회`}</span>
              </div>
              <div style={{height:4,background:"rgba(255,255,255,0.06)",borderRadius:999}}>
                <div style={{height:"100%",borderRadius:999,transition:"width .5s",width:`${Math.min(doneCount/WEEK_GOAL,1)*100}%`,background:doneCount>=WEEK_GOAL?"#FFD84D":"rgba(255,216,77,0.5)"}}/>
              </div>
            </div>

            {/* 투표 카드 */}
            <div style={{background:"rgba(255,255,255,0.03)",borderRadius:14,padding:14,marginBottom:12,border:`1px solid ${voteEditing?"rgba(255,216,77,0.25)":"rgba(255,255,255,0.05)"}`}}>
              <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:12}}>
                <span style={{fontSize:11,fontWeight:700,color:voteEditing?"#FFD84D":"rgba(255,255,255,0.4)",letterSpacing:"0.5px"}}>
                  {voteEditing?"가능한 날 선택 중":"가능한 날 투표"}
                </span>
                {!voteEditing
                  ?<button onClick={startVoteEdit} style={{background:"rgba(255,216,77,0.1)",border:"1px solid rgba(255,216,77,0.2)",borderRadius:7,padding:"5px 13px",cursor:"pointer",color:"rgba(255,216,77,0.8)",fontSize:11,fontWeight:700}}>수정</button>
                  :<div style={{display:"flex",gap:6}}>
                    <button onClick={cancelVoteEdit} style={{background:"rgba(255,255,255,0.05)",border:"1px solid rgba(255,255,255,0.08)",borderRadius:7,padding:"5px 11px",cursor:"pointer",color:"rgba(255,255,255,0.4)",fontSize:11}}>취소</button>
                    <button onClick={saveVotes} style={{background:"#FFD84D",border:"none",borderRadius:7,padding:"5px 13px",cursor:"pointer",color:"#0E0E16",fontSize:11,fontWeight:900}}>저장</button>
                  </div>
                }
              </div>

              <div style={{display:"flex",flexDirection:"column",gap:4}}>
                {weekDates.map((ds,i)=>{
                  const v=getVotes(ds);const sv=getSavedVotes(ds);
                  const both=bothSaved(ds);const conf=isConfirmed(ds);const comp=getCompleted(ds);
                  const isToday=ds===todayStr;
                  return(
                    <div key={ds} style={{borderRadius:10,background:rowBg(comp,conf,both),border:`1px solid ${rowBorder(comp,conf,both)}`,transition:"all .2s",overflow:"hidden"}}>
                      {/* 날짜 + 투표 버튼 행 */}
                      <div style={{display:"flex",alignItems:"center",gap:8,padding:"8px 10px"}}>
                        {/* 날짜 */}
                        <div style={{minWidth:46,display:"flex",flexDirection:"column"}}>
                          <span style={{fontSize:9,color:i>=5?"rgba(255,107,107,0.7)":"rgba(255,255,255,0.25)",lineHeight:1}}>{DAYS[i]}</span>
                          <span style={{fontSize:14,fontWeight:900,color:isToday?"#FFD84D":comp?"#FFD84D":conf?"rgba(255,216,77,0.6)":"rgba(255,255,255,0.8)",lineHeight:1.3}}>{fmt(ds)}</span>
                        </div>
                        {/* 투표 버튼 — 둘 다 투표했거나 완료된 날은 하나로 합침 */}
                        <div style={{display:"flex",gap:5,flex:1}}>
                          {(both&&!voteEditing)||(both&&voteEditing&&comp) ? (
                            <button onClick={()=>!comp&&(comp?toggleComplete(ds):conf?toggleComplete(ds):toggleConfirm(ds))} style={{
                              flex:1,border:"none",borderRadius:8,padding:"6px 0",cursor:comp?"default":"pointer",fontSize:11,fontWeight:700,transition:"all .2s",
                              background:comp?"rgba(255,255,255,0.04)":conf?"rgba(255,216,77,0.1)":"rgba(255,255,255,0.05)",
                              color:comp?"rgba(255,255,255,0.3)":conf?"rgba(255,216,77,0.7)":"rgba(255,255,255,0.35)"
                            }}>
                              {comp?"🌙 완료 ✓":conf?"📌 확정됨 — 완료하기":"약속 가능"}
                            </button>
                          ) : both&&voteEditing ? (
                            MEMBERS.map(mb=>{
                              const c=M[mb];const voted=v.includes(mb);
                              return(
                                <button key={mb} onClick={()=>toggleLocalVote(ds,mb)}
                                  style={{flex:1,border:`1.5px solid ${voted?c.accent:"rgba(255,255,255,0.07)"}`,borderRadius:8,padding:"5px 0",cursor:"pointer",fontSize:10,fontWeight:700,background:voted?c.bg:"transparent",color:voted?c.accent:"rgba(255,255,255,0.2)",transition:"all .15s"}}>
                                  {voted?"✓ ":""}{mb}
                                </button>
                              );
                            })
                          ) : (
                            MEMBERS.map(mb=>{
                              const c=M[mb];const voted=v.includes(mb);
                              return(
                                <button key={mb} onClick={()=>voteEditing&&toggleLocalVote(ds,mb)}
                                  style={{flex:1,border:`1.5px solid ${voted?c.accent:"rgba(255,255,255,0.07)"}`,borderRadius:8,padding:"5px 0",cursor:voteEditing?"pointer":"default",fontSize:10,fontWeight:700,background:voted?c.bg:"transparent",color:voted?c.accent:"rgba(255,255,255,0.2)",transition:"all .15s"}}>
                                  {voted?"✓ ":""}{mb}
                                </button>
                              );
                            })
                          )}
                        </div>
                      </div>


                    </div>
                  );
                })}
              </div>
            </div>

            {/* 이번 주 요약 */}
            {(confirmed.length>0||weekCompleted.length>0)&&!voteEditing&&(
              <div style={{display:"flex",flexDirection:"column",gap:8}}>
                {confirmed.filter(d=>!getCompleted(d)).length>0&&(
                  <div style={{background:"rgba(255,216,77,0.06)",border:"1px solid rgba(255,216,77,0.15)",borderRadius:12,padding:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:"rgba(255,216,77,0.6)",marginBottom:6}}>확정된 약속</div>
                    <div style={{display:"flex",gap:5,flexWrap:"wrap"}}>
                      {confirmed.filter(d=>!getCompleted(d)).map(d=>(
                        <span key={d} style={{fontSize:10,padding:"3px 8px",background:"rgba(255,216,77,0.08)",borderRadius:999,color:"rgba(255,216,77,0.7)"}}>
                          {DAYS[weekDates.indexOf(d)]} {fmt(d)}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
                {weekCompleted.length>0&&(
                  <div style={{background:"rgba(255,216,77,0.1)",border:"1px solid rgba(255,216,77,0.3)",borderRadius:12,padding:12}}>
                    <div style={{fontSize:10,fontWeight:700,color:"#FFD84D",marginBottom:8}}>✅ 완료한 어드민나잇</div>
                    {weekCompleted.map(d=>{
                      const rec=getDayRecord(d);
                      return(
                        <div key={d} style={{marginBottom:8}}>
                          <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:4}}>
                            <span style={{fontSize:11,fontWeight:700,color:"#FFD84D"}}>{getDayLabel(d)} {fmt(d)} 🌙</span>
                            <button onClick={()=>{setCompleteDayModal(d);setCompleteTodoInput({시은:"",지수:""}); }} style={{background:"rgba(255,216,77,0.1)",border:"1px solid rgba(255,216,77,0.2)",borderRadius:6,padding:"2px 8px",cursor:"pointer",color:"rgba(255,216,77,0.8)",fontSize:9,fontWeight:700}}>+ 기록</button>
                          </div>
                          {MEMBERS.map(mb=>{
                            const c=M[mb];const items=rec[mb]||[];if(!items.length)return null;
                            return(
                              <div key={mb} style={{display:"flex",flexWrap:"wrap",gap:4,paddingLeft:4,marginBottom:3}}>
                                <span style={{fontSize:9,fontWeight:700,color:c.accent,marginRight:2}}>{mb}</span>
                                {items.map(r=><span key={r.id} style={{fontSize:9,padding:"1px 7px",background:c.bg,borderRadius:999,color:c.accent}}>✦ {r.text}</span>)}
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
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <button onClick={prevMonth} style={{background:"rgba(255,255,255,0.05)",border:"none",color:"rgba(255,255,255,0.6)",borderRadius:8,padding:"7px 13px",cursor:"pointer",fontSize:14}}>‹</button>
              <div style={{fontSize:14,fontWeight:900}}>{monthIdx.y}년 {MONTH_NAMES[monthIdx.m]}</div>
              <button onClick={nextMonth} style={{background:"rgba(255,255,255,0.05)",border:"none",color:"rgba(255,255,255,0.6)",borderRadius:8,padding:"7px 13px",cursor:"pointer",fontSize:14}}>›</button>
            </div>

            {/* 목표 */}
            <div style={{display:"flex",gap:8,marginBottom:14}}>
              {MEMBERS.map(mb=>{
                const c=M[mb];const goals=(data._goals||{})[mb]||[];
                return(
                  <div key={mb} style={{flex:1,background:"rgba(255,255,255,0.03)",borderRadius:12,padding:12,border:`1px solid ${c.accent}18`}}>
                    <div style={{display:"flex",alignItems:"center",gap:5,marginBottom:8}}>
                      <div style={{width:6,height:6,borderRadius:"50%",background:c.accent}}/>
                      <span style={{fontSize:11,fontWeight:700,color:c.accent}}>{mb}의 목표</span>
                    </div>
                    <div style={{display:"flex",gap:5,marginBottom:7}}>
                      <input value={goalInput[mb]} onChange={e=>setGoalInput(p=>({...p,[mb]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addGoal(mb)} placeholder="목표 추가" style={{flex:1,background:"rgba(255,255,255,0.04)",border:`1px solid ${c.accent}25`,borderRadius:7,padding:"5px 8px",color:"#F0EFE8",fontSize:10,outline:"none"}}/>
                      <button onClick={()=>addGoal(mb)} style={{background:c.accent,border:"none",borderRadius:7,padding:"5px 9px",cursor:"pointer",color:"#fff",fontSize:12,fontWeight:700}}>+</button>
                    </div>
                    {goals.length===0
                      ?<div style={{fontSize:10,color:"rgba(255,255,255,0.2)",textAlign:"center",padding:"4px 0"}}>목표를 추가해봐!</div>
                      :<div style={{display:"flex",flexDirection:"column",gap:4}}>
                        {goals.map(g=>(
                          <div key={g.id} style={{display:"flex",alignItems:"center",gap:5,padding:"4px 7px",background:c.bg,borderRadius:7}}>
                            <span style={{fontSize:9,color:c.accent}}>✦</span>
                            <span style={{flex:1,fontSize:10}}>{g.text}</span>
                            <button onClick={()=>delGoal(mb,g.id)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.2)",cursor:"pointer",fontSize:13}}>×</button>
                          </div>
                        ))}
                      </div>
                    }
                  </div>
                );
              })}
            </div>

            {/* 캘린더 */}
            <div style={{background:"rgba(255,255,255,0.02)",borderRadius:14,padding:12,border:"1px solid rgba(255,255,255,0.05)"}}>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",marginBottom:6}}>
                {DAYS_SHORT.map((d,i)=>(
                  <div key={d} style={{textAlign:"center",fontSize:9,fontWeight:700,color:i===0?"rgba(255,100,100,0.7)":"rgba(255,255,255,0.2)",padding:"3px 0"}}>{d}</div>
                ))}
              </div>
              <div style={{display:"grid",gridTemplateColumns:"repeat(7,1fr)",gap:3}}>
                {monthDates.map(({dateStr,cur})=>{
                  const comp=getCompleted(dateStr);const conf=isDateConfirmed(dateStr);
                  const v=getDateVotes(dateStr);const isToday=dateStr===todayStr;
                  const dow=new Date(dateStr).getDay();
                  const rec=getDayRecord(dateStr);
                  const sieonItems=rec["시은"]||[];const jisuItems=rec["지수"]||[];
                  const hasRec=sieonItems.length>0||jisuItems.length>0;
                  return(
                    <div key={dateStr}
                      onClick={()=>cur&&(comp||conf)&&(setMonthDetailDay(dateStr),setCompleteTodoInput({시은:"",지수:""}))}
                      style={{minHeight:46,borderRadius:8,display:"flex",flexDirection:"column",alignItems:"stretch",padding:"4px 3px 4px",
                        background:comp?"rgba(255,216,77,0.1)":conf?"rgba(255,216,77,0.05)":isToday?"rgba(255,216,77,0.04)":"transparent",
                        border:`1px solid ${comp?"rgba(255,216,77,0.35)":conf?"rgba(255,216,77,0.15)":isToday?"rgba(255,216,77,0.12)":"transparent"}`,
                        opacity:cur?1:0.2,cursor:cur&&(comp||conf)?"pointer":"default"}}>
                      <span style={{fontSize:10,fontWeight:isToday?900:400,textAlign:"center",
                        color:comp?"#FFD84D":conf?"rgba(255,216,77,0.6)":isToday?"rgba(255,216,77,0.8)":dow===0?"rgba(255,100,100,0.7)":"rgba(255,255,255,0.7)",
                        lineHeight:1.4,display:"block"}}>
                        {new Date(dateStr).getDate()}
                      </span>
                      {/* 기록 태그 */}
                      {comp&&hasRec&&(
                        <div style={{display:"flex",flexDirection:"column",gap:1,marginTop:1}}>
                          {sieonItems.slice(0,2).map(r=>(
                            <div key={r.id} style={{background:"rgba(255,77,141,0.15)",borderRadius:3,padding:"1px 3px",fontSize:7,color:"#FF4D8D",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {r.text}
                            </div>
                          ))}
                          {jisuItems.slice(0,2).map(r=>(
                            <div key={r.id} style={{background:"rgba(155,89,245,0.15)",borderRadius:3,padding:"1px 3px",fontSize:7,color:"#9B59F5",fontWeight:700,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>
                              {r.text}
                            </div>
                          ))}
                        </div>
                      )}
                      {/* 투표 점 */}
                      {!comp&&(v.includes("시은")||v.includes("지수"))&&(
                        <div style={{display:"flex",gap:1,justifyContent:"center",marginTop:2}}>
                          {v.includes("시은")&&<div style={{width:3,height:3,borderRadius:"50%",background:"#FF4D8D"}}/>}
                          {v.includes("지수")&&<div style={{width:3,height:3,borderRadius:"50%",background:"#9B59F5"}}/>}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
              {/* legend */}
              <div style={{display:"flex",gap:10,marginTop:10,justifyContent:"center",flexWrap:"wrap"}}>
                {[["rgba(255,216,77,1)","완료"],["rgba(255,216,77,0.4)","확정"],["#FF4D8D","시은 기록"],["#9B59F5","지수 기록"]].map(([color,label])=>(
                  <div key={label} style={{display:"flex",alignItems:"center",gap:4}}>
                    <div style={{width:7,height:7,borderRadius:"50%",background:color}}/>
                    <span style={{fontSize:9,color:"rgba(255,255,255,0.3)"}}>{label}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* 이달 완료 목록 */}
            {(()=>{
              const done=monthDates.filter(({cur,dateStr})=>cur&&getCompleted(dateStr)).map(({dateStr})=>dateStr);
              if(!done.length)return null;
              return(
                <div style={{marginTop:12,background:"rgba(255,216,77,0.08)",border:"1px solid rgba(255,216,77,0.2)",borderRadius:12,padding:14}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#FFD84D",marginBottom:10}}>{MONTH_NAMES[monthIdx.m]} 완료한 어드민나잇</div>
                  {done.map(ds=>{
                    const rec=getDayRecord(ds);
                    return(
                      <div key={ds} style={{marginBottom:10,paddingBottom:8,borderBottom:"1px solid rgba(255,216,77,0.08)"}}>
                        <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:5}}>
                          <span style={{fontSize:11,fontWeight:700,color:"#FFD84D"}}>🌙 {fmtFull(ds)} ({getDayLabel(ds)})</span>
                          <button onClick={()=>{setMonthDetailDay(ds);setCompleteTodoInput({시은:"",지수:""}); }} style={{background:"rgba(255,216,77,0.1)",border:"1px solid rgba(255,216,77,0.2)",borderRadius:6,padding:"2px 7px",cursor:"pointer",color:"rgba(255,216,77,0.7)",fontSize:9,fontWeight:700}}>상세</button>
                        </div>
                        {MEMBERS.map(mb=>{
                          const c=M[mb];const items=rec[mb]||[];if(!items.length)return null;
                          return(
                            <div key={mb} style={{display:"flex",flexWrap:"wrap",alignItems:"center",gap:4,paddingLeft:4,marginBottom:3}}>
                              <span style={{fontSize:9,fontWeight:700,color:c.accent}}>{mb}</span>
                              {items.map(r=><span key={r.id} style={{fontSize:9,padding:"1px 7px",background:c.bg,borderRadius:999,color:c.accent}}>✦ {r.text}</span>)}
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
            <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:14}}>
              <button onClick={prevWeek} style={{background:"rgba(255,255,255,0.05)",border:"none",color:"rgba(255,255,255,0.6)",borderRadius:8,padding:"7px 13px",cursor:"pointer",fontSize:14}}>‹</button>
              <div style={{textAlign:"center"}}>
                <div style={{fontSize:12,fontWeight:700}}>{fmt(weekDates[0])} – {fmt(weekDates[6])}</div>
                {weekKey===getWeekKey(new Date())&&<div style={{fontSize:9,color:"#FFD84D",marginTop:1}}>이번 주</div>}
              </div>
              <button onClick={nextWeek} style={{background:"rgba(255,255,255,0.05)",border:"none",color:"rgba(255,255,255,0.6)",borderRadius:8,padding:"7px 13px",cursor:"pointer",fontSize:14}}>›</button>
            </div>
            <div style={{display:"flex",flexDirection:"column",gap:12}}>
              {MEMBERS.map(mb=>{
                const c=M[mb];const todos=(wd.todos||{})[mb]||[];const doneCnt=todos.filter(t=>t.done).length;
                return(
                  <div key={mb} style={{background:"rgba(255,255,255,0.03)",border:`1px solid ${c.accent}18`,borderRadius:14,padding:14}}>
                    <div style={{display:"flex",alignItems:"center",justifyContent:"space-between",marginBottom:10}}>
                      <div style={{display:"flex",alignItems:"center",gap:7}}>
                        <div style={{width:6,height:6,borderRadius:"50%",background:c.accent}}/>
                        <span style={{fontWeight:900,fontSize:13,color:c.accent}}>{mb}의 할 일</span>
                      </div>
                      {todos.length>0&&<span style={{fontSize:10,color:"rgba(255,255,255,0.25)"}}>{doneCnt}/{todos.length}</span>}
                    </div>
                    <div style={{display:"flex",gap:6,marginBottom:8}}>
                      <input value={todoInput[mb]} onChange={e=>setTodoInput(p=>({...p,[mb]:e.target.value}))} onKeyDown={e=>e.key==="Enter"&&addTodo(mb)} placeholder="할 일 추가..." style={{flex:1,background:"rgba(255,255,255,0.04)",border:`1px solid ${c.accent}22`,borderRadius:8,padding:"8px 10px",color:"#F0EFE8",fontSize:11,outline:"none"}}/>
                      <button onClick={()=>addTodo(mb)} style={{background:c.accent,border:"none",borderRadius:8,padding:"8px 13px",cursor:"pointer",color:"#fff",fontSize:14,fontWeight:700}}>+</button>
                    </div>
                    {todos.length===0
                      ?<div style={{textAlign:"center",color:"rgba(255,255,255,0.2)",fontSize:10,padding:"8px 0"}}>아직 할 일이 없어요!</div>
                      :<div style={{display:"flex",flexDirection:"column",gap:5}}>
                        {todos.map(t=>(
                          <div key={t.id} style={{display:"flex",alignItems:"center",gap:8,padding:"7px 9px",background:"rgba(255,255,255,0.03)",borderRadius:8}}>
                            <button onClick={()=>toggleTodo(mb,t.id)} style={{width:16,height:16,borderRadius:4,border:`1.5px solid ${t.done?c.accent:"rgba(255,255,255,0.12)"}`,background:t.done?c.accent:"transparent",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                              {t.done&&<span style={{color:"#fff",fontSize:9}}>✓</span>}
                            </button>
                            <span style={{flex:1,fontSize:11,color:t.done?"rgba(255,255,255,0.25)":"rgba(255,255,255,0.8)",textDecoration:t.done?"line-through":"none"}}>{t.text}</span>
                            <button onClick={()=>delTodo(mb,t.id)} style={{background:"none",border:"none",color:"rgba(255,255,255,0.15)",cursor:"pointer",fontSize:14}}>×</button>
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
