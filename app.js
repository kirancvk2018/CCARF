(() => {
  const cfg = window.APP_CONFIG || {};
  const $ = (id) => document.getElementById(id);
  const state = { attemptId:null, role:null, questions:[], answers:{}, current:0, startedAt:null, timerHandle:null, result:null, participants:[], adminToken:null, adminEmail:null };
  const apiReady = () => cfg.SUPABASE_URL && cfg.SUPABASE_ANON_KEY && !cfg.SUPABASE_URL.includes("YOUR_") && !cfg.SUPABASE_ANON_KEY.includes("YOUR_");
  const show = (id) => { document.querySelectorAll(".view").forEach(v=>v.classList.add("hidden")); $(id).classList.remove("hidden"); window.scrollTo({top:0,behavior:"smooth"}); };
  const headers = () => ({ "Content-Type":"application/json", "apikey":cfg.SUPABASE_ANON_KEY, "Authorization":`Bearer ${cfg.SUPABASE_ANON_KEY}` });
  async function functionCall(name, payload, token=null) {
    const h = headers(); if (token) h.Authorization = `Bearer ${token}`;
    const res = await fetch(`${cfg.SUPABASE_URL}/functions/v1/${name}`, {method:"POST",headers:h,body:JSON.stringify(payload||{})});
    const data = await res.json().catch(()=>({error:"Unexpected server response"}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }
  function escapeHtml(s) { return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c])); }
  $("adminNav").addEventListener("click",()=>openAdmin());
  $("backHome").addEventListener("click",()=>show("homeView"));
  $("returnHome").addEventListener("click",()=>{clearInterval(state.timerHandle);show("homeView");});
  $("startForm").addEventListener("submit", async (e)=>{
    e.preventDefault(); $("startError").textContent="";
    if(!apiReady()){ $("startError").textContent="The portal has not been configured. Add your Supabase URL and anon key in public/config.js."; return; }
    const btn=e.submitter; btn.disabled=true; btn.textContent="Preparing assessment…";
    try{
      const data=await functionCall("start-assessment",{name:$("participantName").value,email:$("participantEmail").value,role:$("participantRole").value});
      state.attemptId=data.attempt_id; state.role=data.role; state.questions=data.questions; state.answers={}; state.current=0; state.startedAt=data.started_at;
      $("quizRole").textContent=`${data.role.toUpperCase()} ASSESSMENT`;
      $("quizTitle").textContent=`${data.role} · MCP knowledge check`;
      $("participantLabel").textContent=`Participant: ${$("participantName").value.trim()}`;
      renderGrid(); renderQuestion(); show("quizView"); startTimer(data.duration_seconds || 1800);
    }catch(err){$("startError").textContent=err.message;}
    finally{btn.disabled=false;btn.innerHTML='Start assessment <span>→</span>';}
  });
  function renderGrid(){
    $("questionGrid").innerHTML=state.questions.map((q,i)=>`<button type="button" data-index="${i}" aria-label="Question ${i+1}">${i+1}</button>`).join("");
    $("questionGrid").querySelectorAll("button").forEach(b=>b.addEventListener("click",()=>{state.current=Number(b.dataset.index);renderQuestion();}));
  }
  function renderQuestion(){
    const q=state.questions[state.current], n=state.current+1;
    $("progressText").textContent=`Question ${n} of ${state.questions.length}`;
    $("answeredText").textContent=`${Object.keys(state.answers).length} answered`;
    $("progressBar").style.width=`${(n/state.questions.length)*100}%`;
    $("qNumber").textContent=`QUESTION ${String(n).padStart(2,"0")}`;
    $("sectionTag").textContent=q.topic_section || "MCP";
    $("pointsTag").textContent=`${q.points} point${q.points===1?"":"s"}`;
    $("questionText").textContent=q.question;
    $("options").innerHTML=["A","B","C","D"].map(letter=>{
      const text=q.options?.[letter]??"";
      const selected=state.answers[q.question_id]===letter;
      return `<label class="option ${selected?"selected":""}"><input type="radio" name="answer" value="${letter}" ${selected?"checked":""}><span><b>${letter}.</b> ${escapeHtml(text)}</span></label>`;
    }).join("");
    $("options").querySelectorAll("input").forEach(input=>input.addEventListener("change",()=>{
      state.answers[q.question_id]=input.value;renderQuestion();
    }));
    $("prevBtn").disabled=state.current===0;
    $("nextBtn").textContent=state.current===state.questions.length-1?"Review answers →":"Next question →";
    $("nextBtn").disabled=false;
    $("questionGrid").querySelectorAll("button").forEach((b,i)=>{
      b.classList.toggle("current",i===state.current);
      b.classList.toggle("done",Boolean(state.answers[state.questions[i].question_id]));
    });
    $("completionHint").textContent=`${Object.keys(state.answers).length} of ${state.questions.length} answered · ${state.questions.length-Object.keys(state.answers).length} unanswered`;
  }
  $("prevBtn").addEventListener("click",()=>{if(state.current>0){state.current--;renderQuestion();}});
  $("nextBtn").addEventListener("click",()=>{if(state.current<state.questions.length-1){state.current++;renderQuestion();}else{const first=state.questions.findIndex(q=>!state.answers[q.question_id]);if(first>=0){state.current=first;renderQuestion();}else window.scrollTo({top:document.body.scrollHeight,behavior:"smooth"});}});
  $("submitBtn").addEventListener("click",()=>confirmSubmit(false));
  function confirmSubmit(auto){
    const unanswered=state.questions.length-Object.keys(state.answers).length;
    if(!auto && !confirm(`Submit your assessment now? ${unanswered} question(s) are unanswered.`))return;
    submitAssessment(auto);
  }
  let submitting=false;
  async function submitAssessment(auto){
    if(submitting)return;submitting=true;$("submitBtn").disabled=true;$("quizError").textContent="";
    try{
      const result=await functionCall("submit-assessment",{attempt_id:state.attemptId,answers:state.answers});
      state.result=result;clearInterval(state.timerHandle);renderResults(result);show("resultView");
    }catch(err){$("quizError").textContent=err.message;$("submitBtn").disabled=false;submitting=false;}
  }
  function startTimer(seconds){
    let remaining=seconds;const draw=()=>{const m=Math.floor(remaining/60),s=remaining%60;$("timer").textContent=`${String(m).padStart(2,"0")}:${String(s).padStart(2,"0")}`;$("timer").parentElement.classList.toggle("urgent",remaining<=300);};
    draw();clearInterval(state.timerHandle);
    state.timerHandle=setInterval(()=>{remaining--;draw();if(remaining<=0){clearInterval(state.timerHandle);confirmSubmit(true);}},1000);
  }
  function renderResults(r){
    $("scoreValue").textContent=`${r.score}/${r.max_score}`;$("percentValue").textContent=`${r.percentage}%`;
    $("resultHeading").textContent=r.percentage>=80?"Strong performance":r.percentage>=60?"Good progress":"Further revision recommended";
    $("resultMessage").textContent=`You answered ${r.results.filter(x=>x.is_correct).length} of ${r.results.length} questions correctly. Your result has been recorded.`;
    $("expiredNote").classList.toggle("hidden",!r.time_expired);
    $("sectionResults").innerHTML=r.section_scores.map(s=>`<div class="section-row"><span>${escapeHtml(s.section)}</span><div class="bar"><span style="width:${s.percentage}%"></span></div><strong>${s.percentage}%</strong></div>`).join("");
    $("answerReview").innerHTML=r.results.map(q=>`<div class="review-item"><div class="qmeta"><span class="tag">${escapeHtml(q.topic_section)}</span><span class="${q.is_correct?"correct":"incorrect"}">${q.is_correct?"Correct":"Incorrect"}</span></div><h3>${q.display_number}. ${escapeHtml(q.question)}</h3><div class="muted">Your answer: ${q.selected_option?`${q.selected_option}. ${escapeHtml(q.options[q.selected_option])}`:"Not answered"}</div><div class="correct">Correct answer: ${q.correct_option}. ${escapeHtml(q.options[q.correct_option])}</div><div class="feedback">${escapeHtml(q.explanation)}</div></div>`).join("");
  }

  // Trainer authentication and dashboard
  function openAdmin(){
    show("adminView");
    const token=sessionStorage.getItem("trainer_access_token");
    const email=sessionStorage.getItem("trainer_email");
    if(token&&email){state.adminToken=token;state.adminEmail=email;showDashboardShell();loadReport();}
    else{$("loginPanel").classList.remove("hidden");$("dashboardPanel").classList.add("hidden");}
  }
  $("loginForm").addEventListener("submit",async(e)=>{
    e.preventDefault();$("loginError").textContent="";
    if(!apiReady()){$("loginError").textContent="Configure Supabase in public/config.js first.";return;}
    const btn=e.submitter;btn.disabled=true;
    try{
      const res=await fetch(`${cfg.SUPABASE_URL}/auth/v1/token?grant_type=password`,{method:"POST",headers:{"Content-Type":"application/json","apikey":cfg.SUPABASE_ANON_KEY},body:JSON.stringify({email:$("adminEmail").value,password:$("adminPassword").value})});
      const data=await res.json();if(!res.ok)throw new Error(data.msg||data.message||data.error_description||"Sign-in failed.");
      state.adminToken=data.access_token;state.adminEmail=data.user.email;
      sessionStorage.setItem("trainer_access_token",state.adminToken);sessionStorage.setItem("trainer_email",state.adminEmail);
      showDashboardShell();await loadReport();
    }catch(err){$("loginError").textContent=err.message;}
    finally{btn.disabled=false;}
  });
  function showDashboardShell(){$("loginPanel").classList.add("hidden");$("dashboardPanel").classList.remove("hidden");$("adminIdentity").textContent=state.adminEmail||"";}
  async function loadReport(){
    try{
      const data=await functionCall("admin-report",{},state.adminToken);state.participants=data.participants||[];
      renderDashboard();
    }catch(err){
      if(err.message.toLowerCase().includes("session")||err.message.toLowerCase().includes("token"))logout();
      else alert(err.message);
    }
  }
  $("refreshReport").addEventListener("click",loadReport);
  $("roleFilter").addEventListener("change",renderDashboard);
  $("searchParticipants").addEventListener("input",renderDashboard);
  function filteredParticipants(){
    const role=$("roleFilter").value, term=$("searchParticipants").value.trim().toLowerCase();
    return state.participants.filter(p=>(role==="All"||p.role===role)&&(!term||p.participant_name.toLowerCase().includes(term)||p.participant_email.toLowerCase().includes(term)));
  }
  function renderDashboard(){
    const rows=filteredParticipants(),all=state.participants;
    $("statCount").textContent=all.length;
    const avg=all.length?all.reduce((n,p)=>n+Number(p.percentage||0),0)/all.length:0;
    $("statAverage").textContent=`${avg.toFixed(1)}%`;
    $("statDeveloper").textContent=all.filter(p=>p.role==="Developer").length;
    $("statOther").textContent=all.filter(p=>p.role!=="Developer").length;
    const sections={};
    rows.forEach(p=>(p.section_scores||[]).forEach(s=>{
      sections[s.section]??={earned:0,total:0};
      sections[s.section].earned+=Number(s.points_earned||0);sections[s.section].total+=Number(s.points_possible||0);
    }));
    $("adminSections").innerHTML=Object.entries(sections).map(([name,v])=>{const pct=v.total?Math.round(v.earned/v.total*1000)/10:0;return `<div class="section-row"><span>${escapeHtml(name)}</span><div class="bar"><span style="width:${pct}%"></span></div><strong>${pct}%</strong></div>`;}).join("")||'<p class="muted">No submissions for this filter yet.</p>';
    $("participantRows").innerHTML=rows.map(p=>`<tr><td><strong>${escapeHtml(p.participant_name)}</strong></td><td>${escapeHtml(p.participant_email)}</td><td>${escapeHtml(p.role)}</td><td>${p.score}/${p.max_score}</td><td><strong>${Number(p.percentage).toFixed(1)}%</strong></td><td>${p.submitted_at?new Date(p.submitted_at).toLocaleString():"—"}</td><td>${p.time_expired?"Time expired":"Within time"}</td></tr>`).join("")||'<tr><td colspan="7">No submissions found.</td></tr>';
  }
  function exportRows(){
    return filteredParticipants().map(p=>({
      Name:p.participant_name,Email:p.participant_email,Role:p.role,Score:p.score,Maximum:p.max_score,Percentage:p.percentage,
      Started:p.started_at,Submitted:p.submitted_at,TimeExpired:p.time_expired?"Yes":"No",
      ...Object.fromEntries((p.section_scores||[]).map(s=>[s.section,`${s.points_earned}/${s.points_possible} (${s.percentage}%)`]))
    }));
  }
  $("exportCsv").addEventListener("click",()=>{
    const rows=exportRows();if(!rows.length){alert("No rows to export.");return;}
    const cols=[...new Set(rows.flatMap(Object.keys))];
    const csv=[cols.join(","),...rows.map(r=>cols.map(c=>`"${String(r[c]??"").replace(/"/g,'""')}"`).join(","))].join("\r\n");
    downloadBlob("\uFEFF"+csv,"ccarf-mcp-participant-scores.csv","text/csv;charset=utf-8");
  });
  $("exportXlsx").addEventListener("click",()=>{
    const rows=exportRows();if(!rows.length){alert("No rows to export.");return;}
    if(!window.XLSX){alert("Excel export library did not load. Use CSV export instead.");return;}
    const wb=XLSX.utils.book_new();XLSX.utils.book_append_sheet(wb,XLSX.utils.json_to_sheet(rows),"Participant Scores");
    XLSX.writeFile(wb,"ccarf-mcp-participant-scores.xlsx");
  });
  function downloadBlob(content,name,type){const blob=new Blob([content],{type}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download=name;a.click();URL.revokeObjectURL(url);}
  function logout(){
    sessionStorage.removeItem("trainer_access_token");sessionStorage.removeItem("trainer_email");
    state.adminToken=null;state.adminEmail=null;$("loginPanel").classList.remove("hidden");$("dashboardPanel").classList.add("hidden");show("adminView");
  }
  $("logoutBtn").addEventListener("click",logout);
})();
