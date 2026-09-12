/* js/ui-battle.js —— 由单文件 index.html 机械拆出，逻辑零改动 */
"use strict";
/* ================================================================
 * UI 层
 * ================================================================ */
const UI = {
  showPage(name){
    document.querySelectorAll(".tab").forEach(t=>t.classList.toggle("active", t.dataset.page===name));
    document.querySelectorAll(".page").forEach(p=>p.classList.toggle("active", p.id==="page-"+name));
    if(name==="growth") Growth.render();
    if(name==="skills") SkillUI.render();
    if(name==="roster") RosterUI.render();
    if(name==="glossary") GlossaryUI.render();
    if(name==="designer") DesignerUI.render();
  },
  // ===== 通用「选一个」弹层 =====
  // 调用方：await UI._pickOne({candidates: [{label, sub, icon}], title, sub, defaultIndex})
  // candidates[0].dataId 是 Battle._spiritistPreferredBySide 等要存的标识
  _pickResolver:null,
  _pickDataId:null,
  async _pickOne(opts){
    return new Promise(resolve=>{
      const modal = document.getElementById("pick-modal");
      const grid  = document.getElementById("pick-grid");
      const title = document.getElementById("pick-title");
      const sub   = document.getElementById("pick-sub");
      const okBtn = document.getElementById("pick-confirm");
      title.textContent = opts.title || "请选择";
      sub.textContent   = opts.sub   || "";
      grid.innerHTML = "";
      opts.candidates.forEach((c, i)=>{
        const card = document.createElement("div");
        card.className = "pick-item" + (i === (opts.defaultIndex||0) ? " selected" : "");
        card.dataset.idx = i;
        card.dataset.dataId = c.dataId;
        card.innerHTML = `<img src="${c.icon||""}" onerror="this.style.background='#eee'"><div class="pname">${c.label}</div><div class="pclass">${c.sub||""}</div>`;
        card.onclick = ()=>{
          grid.querySelectorAll(".pick-item").forEach(el=>el.classList.remove("selected"));
          card.classList.add("selected");
          okBtn.disabled = false;
        };
        grid.appendChild(card);
      });
      okBtn.disabled = (opts.candidates.length <= 1);
      this._pickResolver = resolve;
      // 把 dataId 解析逻辑放在 confirm 里：优先上次选过/默认，否则用 defaultIndex
      this._pickDefaultIndex = opts.defaultIndex || 0;
      modal.classList.remove("hidden");
    });
  },
  _pickConfirm(){
    const modal = document.getElementById("pick-modal");
    const sel = modal.querySelector(".pick-item.selected");
    if(!sel) return;
    const idx = +sel.dataset.idx;
    const dataId = sel.dataset.dataId;
    modal.classList.add("hidden");
    if(this._pickResolver) this._pickResolver(dataId);
    this._pickResolver = null;
  },
  _pickCancel(){
    const modal = document.getElementById("pick-modal");
    // 取消 = 走默认（第一个）
    const sel = modal.querySelector(".pick-item.selected");
    const dataId = sel ? sel.dataset.dataId : (this._pickDefaultIndex != null
      ? document.querySelector(`#pick-grid .pick-item[data-idx="${this._pickDefaultIndex}"]`).dataset.dataId : null);
    modal.classList.add("hidden");
    if(this._pickResolver) this._pickResolver(dataId);
    this._pickResolver = null;
  }
};
document.querySelectorAll(".tab").forEach(t=>t.onclick=()=>UI.showPage(t.dataset.page));

/* ---------- 布阵 ---------- */
const TeamUI = {
  selectedChar:null,
  render(){
    for(const side of ["player","enemy"]){
      const gridEl = document.getElementById("grid-"+side);
      gridEl.innerHTML = "";
      for(let i=0;i<9;i++){
        const slot = document.createElement("div");
        slot.className = "slot";
        const cid = TEAMS[side].positions[i];
        if(cid){
          const c = CHARS.find(x=>x.id===cid);
          const lv = GROWTH_LEVELS[cid]||50;
          const el = ELEMENTS[c.element];
          slot.classList.add("filled");
          slot.style.borderColor = el.c;
          slot.innerHTML = `<span class="cele" style="background:${el.c}">${el.n}</span><span class="cname">${c.name}</span><span class="lvl">Lv.${lv}</span>`;
        }
        slot.onclick = ()=>this.clickSlot(side, i);
        gridEl.appendChild(slot);
      }
      // 行标签：每个 grid 之后补 label
    }
    // 池
    const pool = document.getElementById("char-pool");
    pool.innerHTML = "";
    for(const c of CHARS.filter(x=>!x.hidden)){
      const s = statsAt(c.id, GROWTH_LEVELS[c.id]||50);
      const el = ELEMENTS[c.element];
      const d = document.createElement("div");
      d.className = "pool-char" + (this.selectedChar===c.id?" selected":"");
      d.innerHTML = `<div class="cname">${c.name}</div><div style="margin:2px 0">${clsBadge(c.charClass)}</div><div class="cele" style="background:${el.c};display:inline-block;border-radius:8px;padding:1px 8px;color:#fff;font-size:10px">${el.n}</div>
        <div class="cstats">Lv.${GROWTH_LEVELS[c.id]||50}｜HP ${s.maxHp}<br>攻${s.atk} 防${s.def} 速${s.spd}</div>`;
      d.onclick = ()=>{ this.selectedChar = this.selectedChar===c.id ? null : c.id; this.render(); };
      pool.appendChild(d);
    }
  },
  /** 阵容改动也落盘，不然排好的阵刷新就没了 */
  _persist(){
    try{ if(typeof DataIO!=="undefined" && DataIO.save) DataIO.save(); }catch(e){}
  },
  clickSlot(side, i){
    const pos = TEAMS[side].positions;
    if(this.selectedChar){
      if(pos.includes(this.selectedChar)) pos[pos.indexOf(this.selectedChar)] = null;
      pos[i] = this.selectedChar;
      this.selectedChar = null;
    } else {
      pos[i] = null;
    }
    this._persist();
    this.render();
  },
  clear(){ TEAMS.player.positions = new Array(9).fill(null); TEAMS.enemy.positions = new Array(9).fill(null); this._persist(); this.render(); },
  preset(){
    // 默认阵容：5v5（与 C# 版 Program.cs 一致），按蛇形命中尽量每列上下都有
    TEAMS.player.positions = ["char_light_tank","char_grass_assassin","char_fire_brave","char_fire_dps",null,"char_water_healer",null,null,null];
    TEAMS.enemy.positions = ["char_grass_warrior","char_dark_mage","char_light_dps","char_grass_assassin",null,"char_fire_brave",null,null,null];
    this._persist();
    this.render();
  }
};

/* ---------- 战斗 + 回放 ---------- */
const Battle = {
  controller:null, result:null, orderSummary:null,
  /**
   * 通灵师主角选择：每个阵营选一个 charId（同名重复放多个时仍按单位索引；
   * 同名多个的"主角"按数据存储的 unitIdx 编号 `unitId#pos`）。
   * 一旦确定：spiritPoints 只给主角累加，其他通灵师被"冻结"（不涨点、不触发变身）。
   * 单候选时直接默认第 1 个，不弹框。
   */
  _spiritistPreferredBySide:{player:null, enemy:null},
  _heroPreferredBySide:{player:null, enemy:null},
  /** 把阵容里的"通灵师候选"映射成 {label, sub, icon, dataId} 数组。dataId 存 charId。 */
  _candidatesSpiritists(grid, side){
    const cands = [];
    const seen = new Map();   // charId -> count（处理同名重复放）
    for(let i=0;i<9;i++){
      const u = grid.slots[i];
      if(!u || !u.isAlive || !u.isSpiritist()) continue;
      const k = u.data.id;
      const n = (seen.get(k)||0) + 1;
      seen.set(k, n);
      cands.push({
        dataId: u.data.id,
        label: cands.length===0 && seen.get(k)===1 ? u.data.name
             : (seen.get(k)>1 ? `${u.data.name} #${n}` : `${u.data.name}`),
        sub: `通灵师 · ${(ELEMENTS[u.data.element]||{}).n||u.data.element}`,
        icon: portraitOf(u.data.id) || ""
      });
    }
    return cands;
  },
  _candidatesHeroes(grid){
    const cands = [];
    for(let i=0;i<9;i++){
      const u = grid.slots[i];
      if(!u || !u.isAlive || !u.heroSkill) continue;
      cands.push({
        dataId: u.data.id,
        label: u.data.name,
        sub: `英雄 · ${u.heroSkill.name}`,
        icon: portraitOf(u.data.id) || ""
      });
    }
    return cands;
  },
  async enter(){
    Replay.stop();
    const seedStr = document.getElementById("seed-input").value.trim();
    const seed = seedStr ? (Math.abs(hashCode(seedStr))||1) : (Math.floor(Math.random()*2**31)||1);
    const c = new BattleController(seed, true);
    c.initialize(TEAMS.player, TEAMS.enemy);
    this.controller = c;
    // ===== 通灵师 / 英雄：多于 1 时让玩家选主角 =====
    c._spiritistPreferredBySide = {player:null, enemy:null};
    c._heroPreferredBySide = {player:null, enemy:null};
    // 通灵师选择
    for(const side of ["player","enemy"]){
      const grid = side==="player" ? c.playerGrid : c.enemyGrid;
      const cands = this._candidatesSpiritists(grid, side);
      if(cands.length === 0) continue;
      if(cands.length === 1){
        c._spiritistPreferredBySide[side] = cands[0].dataId;
        continue;
      }
      const picked = await UI._pickOne({
        title: `${side==="player"?"我方":"敌方"}阵容有 ${cands.length} 位通灵师`,
        sub: "同一阵容只能触发一位通灵师的通灵技，请指定主角。（通灵点只会累加在主角身上）",
        candidates: cands
      });
      c._spiritistPreferredBySide[side] = picked;
    }
    // 英雄选择
    for(const side of ["player","enemy"]){
      const grid = side==="player" ? c.playerGrid : c.enemyGrid;
      const cands = this._candidatesHeroes(grid);
      if(cands.length === 0) continue;
      if(cands.length === 1){
        c._heroPreferredBySide[side] = cands[0].dataId;
        continue;
      }
      const picked = await UI._pickOne({
        title: `${side==="player"?"我方":"敌方"}阵容有 ${cands.length} 位英雄`,
        sub: "同一阵容只能发动一位英雄的英雄技，请指定主角。",
        candidates: cands
      });
      c._heroPreferredBySide[side] = picked;
    }
    // 跑战斗（气势判定、循环出手）
    this.result = c.run();
    // 本场出手序列摘要（首发由全员 SPD 总和决定）
    const playerSpd = c.playerGrid.aliveUnits().reduce((a,u)=>a+u.effSpd,0);
    const enemySpd = c.enemyGrid.aliveUnits().reduce((a,u)=>a+u.effSpd,0);
    const firstSide = playerSpd >= enemySpd ? "我方" : "敌方";
    const sideText = `首发：${firstSide}（我SPD ${playerSpd} vs 敌 ${enemySpd}）`;
    this.orderSummary = `${sideText}　出手序按列推进：右列→中列→左列，每列从上到下；右阵镜像对称`;
    // 把选角结果记一份到 Battle 上，方便 console / debug
    this._spiritistPreferredBySide = c._spiritistPreferredBySide;
    this._heroPreferredBySide = c._heroPreferredBySide;
    Replay.load(c.events, this.result);
  },
  rerun(){ return this.enter(); }
};
function hashCode(s){ let h=0; for(let i=0;i<s.length;i++){ h=(h<<5)-h+s.charCodeAt(i)|0; } return h; }

const Replay = {
  events:[], idx:-1, playing:false, timer:null, speed:600, result:null,
  frames:[], fi:-1,
  /**
   * 把事件流切成「播放帧」。
   * 【群攻】执行期间发出的所有事件带同一个并行组号 parallel，它们合成一帧——
   * 一帧内被攻击的几个单位**同时**掉血。连击没有组号，所以仍是每击一帧、逐次播放。
   * 这就是【群攻】和【连击】在战斗表现上的区别。
   */
  _buildFrames(){
    const fr = [];
    for(let i=0;i<this.events.length;i++){
      const g = this.events[i].parallel;
      const last = fr[fr.length-1];
      if(g!=null && last && last.group===g) last.end = i;   // 并进上一帧
      else fr.push({group: g==null?null:g, start:i, end:i});
    }
    this.frames = fr;
  },
  frameOf(i){
    for(let k=0;k<this.frames.length;k++) if(i>=this.frames[k].start && i<=this.frames[k].end) return k;
    return 0;
  },
  load(events, result){
    this.events = events; this.result = result; this.idx = -1; this.fi = -1;
    this._buildFrames();
    this.renderLog();
    if(events.length) this.renderFromSnap(events[0].snap);
    document.getElementById("btn-play").textContent = "▶ 播放";
    this.playing = false;
    const rb = document.getElementById("round-badge");
    rb.textContent = "— 战斗就绪，点击播放 —";
    const os = document.getElementById("order-strip");
    if(os && Battle.orderSummary) os.textContent = Battle.orderSummary;
  },
  toggle(){ this.playing ? this.stop() : this.play(); },
  play(){
    // 已经播完 → 从头重播
    if(this.fi >= this.frames.length-1){ this.fi = -1; this.idx = -1; }
    this.playing = true;
    document.getElementById("btn-play").textContent = "⏸ 暂停";
    const tick = ()=>{
      if(!this.playing) return;
      if(this.fi >= this.frames.length-1){ this.stop(); return; }
      this.step(1, true);
      this.timer = setTimeout(tick, this.speed);
    };
    tick();
  },
  stop(){
    this.playing = false;
    if(this.timer) clearTimeout(this.timer);
    document.getElementById("btn-play").textContent = this.fi>=this.frames.length-1 ? "↻ 重播" : "▶ 播放";
  },
  setSpeed(v){ this.speed = +v; },
  /** 按帧前进/后退（n 只会是 ±1）。一帧 = 一条普通事件，或一整个【群攻】并行组 */
  step(n, fromPlay){
    if(!fromPlay) this.stop();
    const nf = Math.max(-1, Math.min(this.frames.length-1, this.fi + (n<0?-1:1)));
    this.fi = nf;
    // 清掉所有残留 badge（避免跳转时叠加）
    document.querySelectorAll(".bcell .act-badge").forEach(b=>b.remove());
    if(nf < 0){
      this.idx = -1;
      if(this.events.length) this.renderFromSnap(this.events[0].snap);
      this.scrollLog();
      this._updateRoundBadge();
      return;
    }
    this.idx = this.frames[nf].end;
    const f = this.frames[nf];
    this.applyFrame(this.events.slice(f.start, f.end+1));
  },
  /** 跳到第 i 条事件所在的帧（点日志用）。同组的事件一起显示，避免停在"打了一半"的状态 */
  jumpTo(i){
    this.stop();
    if(!this.frames.length) return;
    const k = this.frameOf(Math.max(0, Math.min(this.events.length-1, i)));
    this.fi = k; this.idx = this.frames[k].end;
    document.querySelectorAll(".bcell .act-badge").forEach(b=>b.remove());
    const f = this.frames[k];
    this.applyFrame(this.events.slice(f.start, f.end+1));
  },
  /**
   * 播放一帧。帧内可能只有 1 条事件（普攻/连击的每一击），也可能是【群攻】的一整组。
   * 顺序很关键：先按**最后一条**事件的快照统一渲染（所有单位的血条一次性更新），
   * 再把整帧的飘字/徽章一次性打出去 —— 看上去就是被群攻的几个单位同时掉血。
   */
  applyFrame(frame){
    if(!frame || !frame.length) return;
    this.renderFromSnap(frame[frame.length-1].snap, this.idx);
    for(const ev of frame) this.applyEventVisual(ev);
    this.scrollLog();
    this._updateRoundBadge();
  },
  applyEvent(ev){ if(ev) this.applyFrame([ev]); },
  /**
   * 单条事件的视觉部分（不含快照渲染）。
   * 飘字必须等 renderFromSnap 之后再加，否则会被 renderFromSnap 重写 cell.innerHTML 冲掉。
   */
  applyEventVisual(ev){
    // 出手序列条：每回合开始时更新
    if(ev.type==="Round" && ev.seqText){
      const el = document.getElementById("order-strip");
      if(el) el.textContent = "出手序: " + ev.seqText;
    }
    // 特效
    if(ev.type==="Damage"||ev.type==="CritDamage"||ev.type==="DotDamage"||ev.type==="Counter"){
      const t = this._cell(ev.target || (ev.type==="DotDamage" ? ev.actor : null));
      if(t){
        t.classList.add("targeted"); setTimeout(()=>t.classList.remove("targeted"),400);
        // 【毁灭伤害】走紫色飘字：一眼区分"能挡的伤害"和"挡不住的伤害"
        const isTrue = ev.isTrueDamage || /【毁灭伤害】/.test(ev.text||"");
        const isCrit = ev.type==="CritDamage";
        const sa = ev.shieldAbsorbed||0;
        if(sa>0) this._float(t, "盾 -"+sa, "#9aa7b5", false);   // 打在盾上：灰字
        const leaked = Math.max(0, ev.value - sa);
        if(leaked>0 || ev.value<1){
          let color, big;
          if(isTrue){ color = "#1f1f1f"; big = true; }            // 毁灭：黑色
          else if(ev.shieldBroken){ color = this._elemColorOf(ev.actor); big = isCrit; }  // 破盾：属性色
          else { color = isCrit ? "#e67e22" : "#e74c3c"; big = isCrit; }
          this._float(t, (isTrue?"【毁灭】-":(ev.shieldBroken?"破盾 -":"-"))+(leaked>0?leaked:ev.value), color, big);
        }
        // 暴击：金色「暴击！」徽章 + 加重的红闪抖动，跟普通命中一眼区分开
        if(isCrit){
          this._showBadge(t, "暴击！", "crit", 800);
          t.classList.add("crit-hit"); setTimeout(()=>t.classList.remove("crit-hit"), 500);
        }
        if(isTrue) this._showBadge(t, "毁灭", "true", 700);
      }
    }
    if(ev.type==="Heal" && ev.target){
      const t = this._cell(ev.target);
      if(t) this._float(t, "+"+ev.value, "#27ae60");
    }
    if(ev.type==="Revive"){
      const t = this._cell(ev.target);
      if(t) this._float(t, "复活!", "#f1c40f");
    }
    if(ev.type==="Dodged"){
      const t = this._cell(ev.target);
      if(t) this._float(t, "闪避", "#8e44ad");
    }
    // 【免疫】挡下一击：蓝色「无效」飘字 + 盾牌徽章，跟闪避在观感上区分开
    if(ev.type==="Immunity"){
      const t = this._cell(ev.target);
      if(t){
        t.classList.add("targeted"); setTimeout(()=>t.classList.remove("targeted"),400);
        this._float(t, "免疫", "#2f6fb5", true);
        this._showBadge(t, "免伤", "immune", 700);
      }
    }
    // 【生命上限】：全队一起涨上限，绿色「+X」飘字
    if(ev.type==="MaxHpUp" && ev.target){
      const t = this._cell(ev.target);
      if(t) this._float(t, "+上限", "#27ae60");
    }
    // 【龙魂追击】：紫色「魂」徽章，一轮亮一次，能看出消耗了几轮
    if(ev.type==="DragonSoul" && ev.actor){
      const a = this._cell(ev.actor);
      if(a) this._showBadge(a, "龙魂", "soul", 800);
    }
    // 英雄技发动：金色「英雄技」徽章，战前就能看到
    if(ev.type==="HeroSkill" && ev.actor){
      const a = this._cell(ev.actor);
      if(a){ this._float(a, "英雄技", "#c9a227", true); this._showBadge(a, "英雄技", "hero", 900); }
    }
    if(ev.actor){
      const a = this._cell(ev.actor);
      if(a){ a.classList.add("acting"); setTimeout(()=>a.classList.remove("acting"), Math.max(200,this.speed*0.8)); }
    }
    // 大招/技能徽章：亮起 cell 标识 + 大招时飘大字"必杀！"
    if(ev.type==="UltimateUsed" && ev.actor){
      const a = this._cell(ev.actor);
      if(a) this._showBadge(a, "必杀！", "ult", 900);
    } else if(ev.type==="SkillUsed" && ev.actor){
      const a = this._cell(ev.actor);
      if(a){
        // 连攻逐击报幕带 hitBadge（技能名），首击报幕从文本里提取
        const sn = ev.hitBadge || (ev.text.match(/使用了 (.+)/) || [, "技能"])[1];
        this._showBadge(a, sn.slice(0,4), "skill", 600);
      }
    }
    // 通灵变身：金紫大徽章（通灵技名）+ 格子高亮闪烁，等连携出手接上
    if(ev.type==="SpiritTransform" && ev.actor){
      const a = this._cell(ev.actor);
      if(a){
        a.classList.add("spirit-flash"); setTimeout(()=>a.classList.remove("spirit-flash"), 1400);
        this._showBadge(a, "通灵·"+(ev.spiritName||"变身"), "spirit", 1500);
        this._float(a, "通灵!", "#f39c12", true);
      }
    }
    // 条件连攻触发（创界破军等）：施法者头顶弹来源徽章
    if(ev.note==="RepeatBoost" && ev.actor){
      const a = this._cell(ev.actor);
      if(a){
        this._showBadge(a, ev.noteText||"创界之力", "boost", 1000);
        this._float(a, "连击+1", "#8e44ad");
      }
    }
  },
  _updateRoundBadge(){
    let round = 0; for(let i=this.idx;i>=0;i--){ if(this.events[i].round!=null){round=this.events[i].round;break;} }
    const rb = document.getElementById("round-badge");
    if(!rb) return;
    if(this.idx===this.events.length-1 && this.result) rb.textContent = this.result.summary + `　共${this.events.length}条事件`;
    else rb.textContent = round ? `第 ${round} 回合` : "战斗开始";
  },
  _elemColorOf(u){
    const el = u && u.data ? (ELEMENTS[u.data.element]||{}) : {};
    return el.c || "#e74c3c";
  },
  _cell(ref){
    if(!ref) return null;
    const side = ref.isPlayerSide ? "player" : "enemy";
    const row = Math.trunc(ref.gridPosition/3), col = ref.gridPosition%3;
    // 网格渲染顺序：0-8 直接对应
    return document.querySelector(`#bgrid-${side} .bcell[data-pos="${ref.gridPosition}"]`);
  },
  _float(cell, text, color, big){
    const f = document.createElement("div");
    f.className = "float-num";
    f.textContent = text;
    f.style.color = color;
    if(big) f.style.fontSize = "24px";
    // 横向随机偏移：连攻/多段攻击连续飘字时错开位置，不然每一击都叠在同一点，
    // 看起来像"只打了一下"
    f.style.left = (42 + Math.random()*16) + "%";
    f.style.top = (16 + Math.random()*10) + "%";
    cell.appendChild(f);
    setTimeout(()=>f.remove(), 1000);
  },
  _showBadge(cell, text, kind, durMs){
    // 清除旧的避免堆叠
    cell.querySelectorAll(".act-badge").forEach(x=>x.remove());
    const b = document.createElement("div");
    b.className = "act-badge " + (kind||"");
    b.textContent = text;
    cell.appendChild(b);
    setTimeout(()=>{ if(b.parentNode) b.remove(); }, durMs||700);
  },
  renderFromSnap(snap){
    // snap: {player:[9], enemy:[9]}
    // 阵营上方通灵进度条：每个阵营挑 spiritPoints 最大的那个通灵师（按 pref 选主角）。
    // 通灵可无限触发：已变身后进度条继续显示新一轮累计。
    for(const side of ["player","enemy"]){
      const bar = document.getElementById("spirit-bar-"+side);
      const fill = document.getElementById("spirit-bar-fill-"+side);
      const text = document.getElementById("spirit-bar-text-"+side);
      const arr = snap[side].filter(u=>u && u.specialClass==="spirit");
      if(arr.length===0){
        bar.classList.add("spirit-bar-empty");
        continue;
      }
      const main = arr.find(u=>u.spirited) || arr[0];
      const max = main.spiritThreshold || 7;
      const cur = Math.min(main.spiritPoints, max);
      const pct = Math.round(cur/max*100);
      bar.classList.remove("spirit-bar-empty");
      bar.classList.toggle("spirited", !!main.spirited);
      fill.style.width = pct + "%";
      text.textContent = main.spirited
        ? `${main.name} ✦已通灵 · ${cur}/${max}`
        : `${main.name} 通灵点 ${cur}/${max}`;
    }
    for(const side of ["enemy","player"]){
      const gridEl = document.getElementById("bgrid-"+side);
      // 清掉所有 cell 内容重建
      for(let i=0;i<9;i++){
        let cell = gridEl.querySelector(`.bcell[data-pos="${i}"]`);
        const u = snap[side][i];
        if(!cell){
          cell = document.createElement("div");
          cell.className = "bcell "+(side==="enemy"?"enemy-cell":"player-cell");
          cell.dataset.pos = i;
          gridEl.appendChild(cell);
        }
        if(!u){ cell.innerHTML = ""; cell.style.visibility="hidden"; continue; }
        cell.style.visibility = "visible";
        const el = ELEMENTS[u.element] || ELEMENTS.None;
        // 诺雅（infiniteEnergy）气势无上限：条子按 100 门槛封顶显示，数字区显示 ∞
        const infEn = !isFinite(u.maxEnergy);
        const maxEn = infEn ? 100 : (u.maxEnergy || MAX_ENERGY);
        const hpPct = Math.max(0, Math.round(u.hp/u.maxHp*100));
        const enPct = Math.min(100, Math.round(u.energy/maxEn*100));
        const chips = u.statuses.map(s=>{
          const t = s.turns<0 ? "∞" : s.turns;
          const tip = `${STATUS_NAME[s.type]||s.type}${s.turns<0?"（永久）":`（剩 ${s.turns} 回合）`}`;
          const cls = s.type==="Stealth" ? "stealth" : (s.type==="Control" ? "ctl" : (seIsDebuff(s.type)?"debuff":"buff"));
          return `<span class="st-chip ${cls}" title="${tip}">${statusShort(s)}${t}</span>`;
        }).join("");
        // 气势到了放大招的门槛时，把"这一发大招有多疼"直接写在格子上（气势/100）
        const multTag = (u.ultCost && u.energy>=u.ultCost)
          ? `<span class="en-mult" title="气势 ≥ ${u.ultCost} 可以放大招，伤害按 气势/100 放大">大招×${(u.energy/100).toFixed(2)}</span>` : "";
        // 资源计数器（龙魂）：>0 时显示成紫色徽章，回放里能直接看到攒了几个
        const soulBadge = (u.dragonSouls>0)
          ? `<span class="st-chip soul" title="龙魂 ×${u.dragonSouls}：任意单位出手后按此数量释放追击，每轮消耗 1 个">魂${u.dragonSouls}</span>` : "";
        // 【免疫】剩余层数：蓝色徽章
        const immBadge = (u.immunityCharges>0)
          ? `<span class="st-chip immune" title="【免疫】×${u.immunityCharges}：可无效化接下来 ${u.immunityCharges} 次直接攻击（【毁灭伤害】无效）">免${u.immunityCharges}</span>` : "";
        // 【复活储备】层数：绿色徽章，看得出「还剩几条命」
        const revBadge = (u.reviveCharges>0)
          ? `<span class="st-chip revive" title="【复活储备】×${u.reviveCharges}：还能满血复活 ${u.reviveCharges} 次">生${u.reviveCharges}</span>` : "";
        // 职业标记（小圆点，颜色对应职业）。【英雄】是叠加在基础职业之上的特殊职业，
        // 所以两个角标会同时出现——金色星标紧挨着基础职业的图标。
        const cmu = u.charClass ? clsMeta(u.charClass) : null;
        const smu = u.specialClass ? specMeta(u.specialClass) : null;
        const clsMark = (cmu ? `<span class="cls-mark" style="background:${cmu.c}" title="职业：${cmu.n}">${cmu.icon}</span>` : "")
                      + (smu ? `<span class="cls-mark sp" style="background:${smu.c}" title="特殊职业：${smu.n}">${smu.icon}</span>` : "");
        const portraitUrl = portraitOf(u.id);
        const portraitTag = portraitUrl
          ? `<img class="bc-portrait" src="${portraitUrl}" alt="" loading="lazy" onerror="this.remove()">`
          : `<div class="bc-portrait bc-portrait-fallback" style="background:${el.c}">${u.name[0]}</div>`;
        cell.innerHTML = `
          ${portraitTag}
          <div class="st-chips">${soulBadge}${immBadge}${revBadge}${chips}</div>
          <div class="top">${clsMark}<span class="uname">${u.name}</span><span class="el-badge" style="background:${el.c}">${el.n}</span></div>
          <div class="bars">
            <div class="hpbar"><div class="fill" style="width:${hpPct}%"></div></div>
            <div class="enbar"><div class="fill" style="width:${enPct}%"></div></div>
            <div class="nums"><span>${u.hp}/${u.maxHp}</span><span>气势 ${Math.round(u.energy)}${infEn?"（∞）":"/"+maxEn}</span></div>
            ${multTag?`<div class="mult-row">${multTag}</div>`:""}
          </div>`;
        cell.classList.toggle("dead", !u.alive);
        cell.classList.toggle("stealth", !!u.stealth);
        cell.classList.toggle("ctl", !!u.controlled);
      }
    }
  },
  applySnap(){ if(this.events.length) this.renderFromSnap(this.events[0].snap); },
  renderLog(){
    const el = document.getElementById("battle-log");
    el.innerHTML = "";
    this.events.forEach((ev,i)=>{
      const d = document.createElement("div");
      d.dataset.i = i;
      let cls = "ev";
      if(ev.type==="Round") cls += " rnd";
      if(ev.type==="UltimateUsed") cls += " ult";
      if(ev.parallel!=null) cls += " par";   // 【群攻】同帧事件，标成一组
      d.className = cls;
      d.textContent = ev.text;
      d.onclick = ()=>this.jumpTo(i);
      el.appendChild(d);
    });
  },
  scrollLog(){
    const el = document.getElementById("battle-log");
    el.querySelectorAll(".cur").forEach(x=>x.classList.remove("cur"));
    // 高亮当前**帧**的全部日志行：群攻帧会一次亮起一组，直观显示"这几条是同时发生的"
    const f = this.frames[this.fi];
    if(!f) return;
    for(let i=f.start;i<=f.end;i++){
      const d = el.querySelector(`div[data-i="${i}"]`);
      if(d) d.classList.add("cur");
    }
    const cur = el.querySelector(`div[data-i="${f.end}"]`);
    if(cur) cur.scrollIntoView({block:"nearest"});
  }
};

/* ---------- 100 场模拟 ---------- */
const Sim = {
  run100(){
    const el = document.getElementById("sim-result");
    el.textContent = "模拟中...";
    setTimeout(()=>{
      let wins=0, rounds=0;
      for(let i=0;i<100;i++){
        const c = new BattleController(i+1, false);
        c.initialize(TEAMS.player, TEAMS.enemy);
        const r = c.run();
        if(r.playerWon) wins++;
        rounds += r.rounds;
      }
      el.textContent = `→ 100场：我方胜 ${wins} 场（${wins}%），平均 ${Math.round(rounds/100)} 回合`;
    }, 30);
  }
};

/* ---------- 技能词条编辑 ---------- */
const SkillUI = {
  selected:null,
  render(){
    const list = document.getElementById("skill-list");
    list.innerHTML = "";
    for(const s of SKILLS){
      const trig = TRIGGER_META[s.triggerType]||{n:s.triggerType,c:"#999"};
      const d = document.createElement("div");
      d.className = "skill-item"+(this.selected===s.id?" selected":"");
      const chips = (s.tags||[]).map(t=>{
        const m = TAG_META[t.type]; if(!m) return "";
        let txt = "";
        if(t.value){
          if(t.type==="DamageMultiplier") txt += t.value+"×";
          else if(t.type==="MultiTarget") txt += "*"+t.value;
          else if(t.type==="DestructionDamage" || t.type==="TrueDamage") txt += Math.round(t.value*100)+"%";
          else txt += t.value;
        }
        if((t.chance??1)<1) txt += (txt?" ":"")+`${(t.chance*100)|0}%`;
        if(t.duration) txt += (txt?" ":"")+(t.duration<0?"永久":`×${t.duration}回`);
        return tagChipHtml(t.type, txt);
      }).join("");
      d.innerHTML = `<span class="sname">${s.name}</span><span class="strig" style="background:${trig.c}">${trig.n}</span>
        ${s.energyCost?`<span style="font-size:10px;color:#e67e22">门槛${s.energyCost}气势</span>`:""}
        <div class="tag-chips">${chips}</div>`;
      d.onclick = ()=>{ this.selected = s.id; this.render(); };
      list.appendChild(d);
    }
    this.renderEditor();
  },
  renderEditor(){
    const ed = document.getElementById("skill-editor");
    const s = SKILLS.find(x=>x.id===this.selected);
    if(!s){ ed.innerHTML = `<div style="color:var(--muted);padding:20px">← 点击左侧技能查看和编辑词条</div>`; return; }
    let html = `<div class="card">
      <h3>${s.name}（${s.id}）</h3>
      <div class="form-row">
        <label>名称</label><input id="se-name" value="${s.name}">
        <label>触发</label>
        <select id="se-trig">${Object.keys(TRIGGER_META).map(k=>`<option value="${k}" ${s.triggerType===k?"selected":""}>${TRIGGER_META[k].n}</option>`).join("")}</select>
        <label>放大招门槛(气势)</label><input id="se-cost" type="number" value="${s.energyCost||0}" style="width:70px" title="气势到这条线才能放大招（默认 100）。气势超过门槛的部分会按 气势/100 放大这一发大招的伤害">
        <label>被动触发率</label><input id="se-pchance" type="number" step="0.05" min="0" max="1" value="${s.passiveTriggerChance??1}" style="width:70px">
      </div>
      <div id="se-tags">`;
    (s.tags||[]).forEach((t,i)=>{
      html += `<div class="tag-row">
        <select class="tt" onchange="SkillUI.changeTagType(${i},this.value)">${Object.keys(TAG_META).map(k=>`<option value="${k}" ${t.type===k?"selected":""}>${TAG_META[k].n}（${k}）</option>`).join("")}</select>
        数值<input type="number" step="0.05" value="${t.value??0}" onchange="SkillUI.setTag(${i},'value',this.value)">
        概率<input type="number" step="0.05" min="0" max="1" value="${t.chance??1}" onchange="SkillUI.setTag(${i},'chance',this.value)">
        回合<input type="number" step="1" value="${t.duration??0}" onchange="SkillUI.setTag(${i},'duration',this.value)">
        目标<select class="tg" onchange="SkillUI.setTag(${i},'target',this.value)">${TARGETS.map(k=>`<option value="${k}" ${(t.target||"CurrentTarget")===k?"selected":""}>${(TARGET_META[k]||{}).n||k}（${k}）</option>`).join("")}</select>
        <button class="btn small gray" onclick="SkillUI.removeTag(${i})">删除</button>
      </div>`;
    });
    html += `</div>
      <div style="margin-top:8px">
        <button class="btn small" onclick="SkillUI.addTag()">+ 添加词条</button>
        <button class="btn small orange" onclick="SkillUI.applyMeta()">保存修改</button>
        <span id="se-flash" class="save-flash"></span>
      </div>
      <div style="margin-top:10px;color:var(--muted);font-size:11px">
        词条管线：伤害(倍率/连击/暴击/穿透/溅射/追击/群攻) → 真实伤害(毁灭伤害，与倍率伤害同时结算) → 自身增益 → 辅助(治疗/复活/隐身/净化/驱散/气势)。
        受击方判定：闪避 → 暴击 → 克制 → 防御 → 格挡 → 护盾/减伤 → 状态 → 吸血 → 反击。
        开大招时的伤害再乘「当前气势 / 100」：175 气势开大 = 1.75 倍。
      </div>
    </div>`;
    ed.innerHTML = html;
  },
  /** 词条改的是 SKILLS 里的共享对象，落盘要立刻做，否则刷新就白改 */
  _persist(){
    let ok = false;
    try{ ok = (typeof DataIO!=="undefined" && DataIO.save) ? !!DataIO.save() : false; }catch(e){ ok = false; }
    const el = document.getElementById("se-flash");
    if(el){
      el.textContent = ok ? "✅ 已保存到本地（刷新后仍在）" : "⚠ 本地存储不可用，改动只在本次会话有效";
      el.style.opacity = "1";
      clearTimeout(this._flashT);
      this._flashT = setTimeout(()=>{ el.style.opacity = "0"; }, 2400);
    }
  },
  setTag(i, key, v){ const s = SKILLS.find(x=>x.id===this.selected); s.tags[i][key] = key==="target" ? v : +v; this._persist(); this.render(); },
  changeTagType(i, v){
    const s = SKILLS.find(x=>x.id===this.selected);
    const old = s.tags[i];
    s.tags[i] = {type:v, value:0, chance:1, duration:0, target:old.target||"CurrentTarget"};
    this._persist();
    this.render();
  },
  addTag(){ const s = SKILLS.find(x=>x.id===this.selected); (s.tags=s.tags||[]).push({type:"DamageMultiplier",value:1,chance:1,duration:0,target:"CurrentTarget"}); this._persist(); this.render(); },
  removeTag(i){ const s = SKILLS.find(x=>x.id===this.selected); s.tags.splice(i,1); this._persist(); this.render(); },
  applyMeta(){
    const s = SKILLS.find(x=>x.id===this.selected);
    s.name = document.getElementById("se-name").value;
    s.triggerType = document.getElementById("se-trig").value;
    s.energyCost = +document.getElementById("se-cost").value || 0;
    s.passiveTriggerChance = +document.getElementById("se-pchance").value;
    this.render();
    this._persist();   // 放在 render 之后：flash 节点是 render 重新生成的
  }
};

/* ---------- 养成 ---------- */
const Growth = {
  current:null,
  render(){
    if(!this.current) this.current = CHARS[0].id;
    const pick = document.getElementById("growth-char-pick");
    pick.innerHTML = "";
    for(const c of CHARS){
      const d = document.createElement("div");
      d.className = "cp"+(this.current===c.id?" selected":"");
      d.textContent = c.name;
      d.onclick = ()=>{ this.current = c.id; document.getElementById("lvl-slider").value = GROWTH_LEVELS[c.id]||50; this.render(); };
      pick.appendChild(d);
    }
    const lv = GROWTH_LEVELS[this.current]||50;
    document.getElementById("lvl-slider").value = lv;
    document.getElementById("growth-level").textContent = "Lv."+lv;
    const s = statsAt(this.current, lv);
    const s50 = statsAt(this.current, 50);
    document.getElementById("growth-exp").textContent = `升到 Lv.${Math.min(lv+1,MAX_LV)} 还需经验 ${expToNext(lv).toLocaleString()}（累计 ${this._totalExp(lv).toLocaleString()}）`;
    document.getElementById("growth-power").textContent = power(s).toLocaleString();
    const c = CHARS.find(x=>x.id===this.current);
    const table = document.getElementById("growth-table");
    table.innerHTML = `<tr><th>属性</th><th>Lv.50 基准</th><th>当前值</th><th>变化</th></tr>` +
      [["生命值",s50.maxHp,s.maxHp],["攻击",s50.atk,s.atk],["防御",s50.def,s.def],["速度",s50.spd,s.spd]]
      .map(([n,a,b])=>{
        const d = b-a; const dp = a? Math.round(d/a*100):0;
        return `<tr><td>${n}</td><td>${a.toLocaleString()}</td><td class="val">${b.toLocaleString()}</td><td class="delta">${d>=0?"+":""}${d.toLocaleString()}（${d>=0?"+":""}${dp}%）</td></tr>`;
      }).join("");
    // 曲线：取攻击力作为曲线展示（也可以切其他属性）
    const curve = document.getElementById("growth-curve");
    curve.innerHTML = "";
    const vals = [];
    for(let L=1; L<=MAX_LV; L++) vals.push(statsAt(this.current, L).atk);
    const maxV = Math.max(...vals);
    vals.forEach((v,i)=>{
      const b = document.createElement("div");
      b.className = "bar"+(i+1===lv?" cur":"");
      b.style.height = (v/maxV*100)+"%";
      if(i+1===lv || i%10===9) b.innerHTML = `<span class="bv">${v}</span>`;
      curve.appendChild(b);
    });
    // 养成等级变化要刷新布阵池显示
    TeamUI.render();
  },
  setLevel(lv){
    lv = +lv;
    GROWTH_LEVELS[this.current] = lv;
    this.render();
  },
  _totalExp(lv){ let t=0; for(let i=1;i<lv;i++) t+=expToNext(i); return t; }
};

