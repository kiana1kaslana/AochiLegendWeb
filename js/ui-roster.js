/* js/ui-roster.js —— 由单文件 index.html 机械拆出，逻辑零改动 */
"use strict";
/* ================================================================
 * 角色仓库
 *   左：所有角色列表（带元素色块 + 当前等级）
 *   右：选中角色的详情（属性格子 + 技能词条明细 + 等级滑条）
 * ================================================================ */
// 带讲解的词条 chip：鼠标悬浮显示基本含义，点击可展开（在词条表里用）
function tagChipHtml(type, extraText, opts){
  const m = TAG_META[type];
  if(!m) return "";
  const o = opts||{};
  const cls = m.cat ? "cat-"+m.cat : "";
  const extra = extraText ? ` <b style="font-weight:bold">${extraText}</b>` : "";
  const tgt = o.targetName ? ` <span style="opacity:0.65;font-size:10px">[${o.targetName}]</span>` : "";
  const tip = `${m.n}｜${m.desc||""}`;
  return `<span class="tag-chip ${cls} ${o.big?"big":""}" data-type="${type}" title="${tip}">${m.n}${extra}${tgt}</span>`;
}

const RosterUI = {
  selected:null,
  render(){
    const list = document.getElementById("roster-list");
    if(!list) return;
    if(!this.selected || !CHARS.find(c=>c.id===this.selected)) this.selected = CHARS[0]?.id;
    list.innerHTML = "";
    for(const c of CHARS){
      const el = (ELEMENTS[c.element]||{}).n || c.element || "?";
      const ec = (ELEMENTS[c.element]||{}).c || "#999";
      const lv = GROWTH_LEVELS[c.id]||50;
      const d = document.createElement("div");
      d.className = "roster-item"+(this.selected===c.id?" selected":"");
      // 列表头像：有 portrait 字段就显示立绘缩略图，没有就显示首字色块
      const portraitTag = c.portrait
        ? `<img class="ri-avatar" src="${c.portrait}" alt="${c.name}" loading="lazy" onerror="this.style.display='none'">`
        : `<div class="ri-avatar ri-avatar-fallback" style="background:${ec}">${c.name[0]}</div>`;
      d.innerHTML = `${portraitTag}
        <div style="flex:1;min-width:0">
          <div class="ri-name">${c.name}</div>
          <div class="ri-tags">${clsBadge(c.charClass)}${c.specialClass?specBadge(c.specialClass):""}<span style="background:${ec};color:#fff;padding:1px 7px;border-radius:8px;font-size:10px">${el}系</span></div>
          <div class="ri-meta">${c.id}</div>
        </div>
        <div style="text-align:right"><div class="ri-meta">Lv.${lv}</div></div>`;
      d.onclick = ()=>{ this.selected = c.id; this.render(); };
      list.appendChild(d);
    }
    this.renderDetail();
  },
  renderDetail(){
    const det = document.getElementById("roster-detail");
    const c = CHARS.find(x=>x.id===this.selected);
    if(!c){ det.innerHTML = `<div style="color:var(--muted);padding:20px">← 左侧选角色</div>`; return; }
    const lv = GROWTH_LEVELS[c.id]||50;
    const s = statsAt(c.id, lv);
    const pwr = power(s);
    const el = (ELEMENTS[c.element]||{}).n || c.element || "?";
    const ec = (ELEMENTS[c.element]||{}).c || "#999";
    // 技能分组：普攻 / 大招 / 被动
    const norm = SKILLS.find(k=>k.id===c.normalAttackId);
    const ult  = SKILLS.find(k=>k.id===c.ultimateId);
    const passives = (c.passiveIds||[]).map(id=>SKILLS.find(k=>k.id===id)).filter(Boolean);
    // 【英雄】特殊职业：英雄技单独成一个区块，不混进普通被动里——它的发动时机（战前）
    // 和结算方式（带条件判定）都和被动不同，混在一起看会以为它也是"每次挨打抽概率"那种。
    const hero = c.heroSkillId ? SKILLS.find(k=>k.id===c.heroSkillId) : null;
    const renderSkill = (s, role) => {
      if(!s) return `<div class="skill-block"><h4>（未配置${role}）</h4></div>`;
      const trig = TRIGGER_META[s.triggerType]||{n:s.triggerType,c:"#999"};
      const multTag = (s.tags||[]).find(t=>t.type==="DamageMultiplier");
      const multText = multTag ? `<strong>${multTag.value||1.0}×</strong> 倍率` : "（无直接伤害词条）";
      // 一个技能可以有多段伤害，各自目标不同 —— 这里把伤害段单独列出来
      const dmgTags = (s.tags||[]).filter(t=>["DamageMultiplier","TrueDamage","FollowUp","Splash","Combo"].includes(t.type));
      let hitText = "";
      if(dmgTags.length>1){
        hitText = `<div style="font-size:11px;color:#e67e22;margin-bottom:4px">多段伤害：` +
          dmgTags.map(t=>{
            const tgtN = t.target && TARGET_META[t.target] ? TARGET_META[t.target].n : (t.target||"—");
            return `${tagName(t.type)} ${t.value||1}× → ${tgtN}`;
          }).join(" ＋ ") + `</div>`;
      }
      const chips = (s.tags||[]).map(t=>{
        const m = TAG_META[t.type]; if(!m) return "";
        let extra = "";
        if(t.type==="Shield" && t.pct!=null){
          // 百分比盾：显示「40%生命」，别让 duration 的 ×3 被误读成 3 倍盾
          extra = `${Math.round(t.pct*100)}%生命`;
        } else if(t.value!=null && t.value!==0){
          extra = (t.type==="DamageMultiplier" ? t.value+"×" : String(t.value));
        }
        if((t.chance??1)<1) extra += (extra?" ":"")+`${(t.chance*100)|0}%`;
        if(t.duration) extra += (extra?" ":"")+`持续${t.duration}回合`;
        const tgtN = t.target && TARGET_META[t.target] ? TARGET_META[t.target].n : null;
        return tagChipHtml(t.type, extra, {targetName:tgtN});
      }).join("");
      return `<div class="skill-block">
        <h4><span style="background:${trig.c};color:#fff;padding:2px 8px;border-radius:4px;font-size:11px">${trig.n}</span> ${s.name} <span style="color:var(--muted);font-size:10px">${s.id}</span></h4>
        <div class="sk-dmg">${multText}${s.energyCost?` · 放大招门槛 ${s.energyCost} 气势`:""}</div>
        ${hitText}
        <div class="tag-chips">${chips||"<span style='color:var(--muted);font-size:11px'>无词条</span>"}</div>
      </div>`;
    };
    // 该角色所有技能里用到的词条类型（去重，保持出现顺序）
    const usedTypes = [];
    [norm,ult,hero,...passives].filter(Boolean).forEach(sk=>(sk.tags||[]).forEach(t=>{
      if(TAG_META[t.type] && !usedTypes.includes(t.type)) usedTypes.push(t.type);
    }));
    const cm = clsMeta(c.charClass);
    // 【英雄】只是叠加在基础职业上的第二层，属性曲线/推荐站位仍然由 charClass 决定，
    // 所以这里单独取一份，两个面板都展示。
    const sm = c.specialClass ? specMeta(c.specialClass) : null;
    // 英雄技的发动条件（AuraCondition）单独提出来写在面板上，不然看技能词条猜不出来
    const heroCond = hero ? (hero.tags||[]).find(t=>t.type==="AuraCondition") : null;
    const heroCondText = !hero ? ""
      : heroCond
        ? `己阵 ${(heroCond.elements||[]).map(e=>(ELEMENTS[e]||{}).n||e).join(" / ")} 属性角色 ≥ ${heroCond.value} 人，否则整条英雄技作废`
        : "无条件，必定发动";
    // 职业推荐站位提示
    const standText = {front:"前排（承伤位）", mid:"中排（输出位）", back:"后排（保护位）"}[cm.cls] || "中排";
    // ---- 【星神】装配面板：4 个槽位，每个槽位一个下拉框 ----
    // 星神是「开局生效」的固定资产，跟等级滑条一样，改完立刻落盘。
    const sgSlots = (c.starGods||[]);
    const sgHtml = Array.from({length:MAX_STAR_GODS}, (_,i)=>{
      const cur = sgSlots[i] || "";
      const opts = [`<option value="">— 空槽 —</option>`].concat(
        STAR_GOD_ORDER.map(k=>`<option value="${k}"${cur===k?" selected":""}>${STAR_GODS[k].n}</option>`)
      ).join("");
      const g = cur ? STAR_GODS[cur] : null;
      return `<div class="sg-slot${g?"":" empty"}">
        <div class="sg-slot-head">槽位 ${i+1}</div>
        <select onchange="RosterUI.setStarGod(${i}, this.value)">${opts}</select>
        <div class="sg-slot-desc">${g?`<b style="color:${g.c}">${g.icon||""} ${g.n}</b> · ${g.v}<br>${g.desc}`:"未装配星神"}</div>
      </div>`;
    }).join("");
    // 开局气势预览：角色基础气势 + 气势星神加成（多个气势星神叠加，最终受上限约束）
    const sgBaseEnergy = c.startingEnergy ?? 50;
    let sgEnergyBonus = 0;
    for(const k of sgSlots) if(k==="energy") sgEnergyBonus += (STAR_GODS.energy.apply.energy||0);
    const sgEnergyTotal = Math.min(MAX_ENERGY, sgBaseEnergy + sgEnergyBonus);
    // 战斗属性面板用的：暴击/格挡来自「角色基础 + 星神加成」。基础暴击 20%/150%，
    // 暴击星神 +30% 暴击率，格挡星神 +20% 格挡率（格挡减伤固定 50%）
    let sgCrit = 0, sgBlock = 0;
    for(const k of sgSlots){
      if(k==="crit")  sgCrit  += (STAR_GODS.crit.apply.critChance||0);
      if(k==="block") sgBlock += (STAR_GODS.block.apply.blockChance||0);
    }
    const critRate  = Math.round((0.20 + sgCrit)*100);
    const critDmg   = Math.round(1.5*100);
    const blockRate = Math.round(sgBlock*100);
    const sgLegend = STAR_GOD_ORDER.map(k=>{
      const g = STAR_GODS[k];
      return `<div class="sg-legend-item" style="border-left-color:${g.c}">
        <span class="sg-legend-name" style="color:${g.c}">${g.icon||""} ${g.n}</span>
        <span class="sg-legend-v">${g.v}</span>
        <span class="sg-legend-desc">${g.desc}</span></div>`;
    }).join("");
    det.innerHTML = `
      <div style="display:flex;gap:14px;align-items:flex-start;margin-bottom:10px">
        ${c.portrait
          ? `<img class="rd-portrait" src="${c.portrait}" alt="${c.name}" onerror="this.style.display='none'">`
          : `<div class="rd-portrait rd-portrait-fallback" style="background:${ec}">${c.name[0]}</div>`}
        <div style="flex:1;min-width:0">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px">
            <div>
              <h2 style="margin:0">${c.name} <span style="background:${ec};color:#fff;padding:3px 10px;border-radius:12px;font-size:12px;vertical-align:middle">${el}系</span> <span style="vertical-align:middle">${clsBadge(c.charClass,true)}</span>${c.specialClass?` <span style="vertical-align:middle">${specBadge(c.specialClass,true)}</span>`:""}</h2>
              <div style="color:var(--muted);font-size:11px;margin-top:2px">${c.id} · 初始气势 ${c.startingEnergy??50} · ${cm.tag}</div>
              ${c.specialClass==='spirit'?`<div style="color:#C77DFF;font-size:12px;margin-top:4px">【通灵】攒满 ${c.spiritThreshold} 点发动「${c.id==='char_kunlun'?'破军降世':c.id==='char_noya'?'星月降临':'通灵技'}」；获取：${c.id==='char_kunlun'?'己方任意单位出手攻击按命中段数累积（含自己）':c.id==='char_noya'?'光/暗属性队友出手 +2，其他 +0':'随队友出手累积'}<br>首次变身 HP×2 / 攻×1.6 / 满血 +1 连携；再次只满血 +1 连携</div>`:''}
            </div>
            <div style="text-align:right">
              <div style="font-size:24px;font-weight:bold;color:#e67e22">${pwr.toLocaleString()}</div>
              <div style="font-size:10px;color:var(--muted)">战斗力 (Lv.${lv})</div>
              <button class="btn small orange" style="margin-top:6px" onclick="RosterUI.editCurrent()">✎ 编辑此角色的属性与技能</button>
            </div>
          </div>
        </div>
      </div>
      <div class="class-panel" style="border-left-color:${cm.c}">
        <div class="cp-head"><span style="color:${cm.c};font-weight:bold">${cm.icon} 职业：${cm.n}</span>
          <span class="cp-badge" style="background:${cm.c}1a;color:${cm.c};border-color:${cm.c}">推荐站位 ${standText}</span>
          <span class="cp-badge" style="background:#f0f2fb;color:var(--muted);border-color:var(--border)">成长倾向 ${GROWTH_STYLE_LABEL[cm.grow]||cm.grow}</span>
        </div>
        <div class="cp-body">${cm.desc}</div>
        <div class="cp-body" style="color:var(--accent)">💡 ${cm.pick}</div>
      </div>
      ${sm?`<div class="class-panel sp" style="border-left-color:${sm.c}">
        <div class="cp-head"><span style="color:${sm.c};font-weight:bold">${sm.icon} 特殊职业：${sm.n}</span>
          <span class="cp-badge" style="background:${sm.c}1a;color:${sm.c};border-color:${sm.c}">${sm.tag}</span>
        </div>
        <div class="cp-body">${sm.desc}</div>
        <div class="cp-body" style="color:var(--accent)">💡 ${sm.pick}</div>
      </div>`:""}
      <div style="display:flex;gap:10px;align-items:center;background:#f5f6fa;padding:8px 12px;border-radius:6px;margin-bottom:8px">
        <label style="font-size:12px;color:var(--muted)">等级</label>
        <input type="range" min="1" max="${MAX_LV}" value="${lv}" style="flex:1" oninput="RosterUI.setLevel(this.value)">
        <span style="font-weight:bold;font-size:15px;color:var(--accent)">Lv.${lv}</span>
      </div>
      <div class="roster-stats">
        <div class="stat-box"><div class="sb-label">最大生命</div><div class="sb-val">${s.maxHp.toLocaleString()}</div><div class="sb-base">基 ${c.maxHp}</div></div>
        <div class="stat-box"><div class="sb-label">攻击</div><div class="sb-val">${s.atk.toLocaleString()}</div><div class="sb-base">基 ${c.atk}</div></div>
        <div class="stat-box"><div class="sb-label">防御</div><div class="sb-val">${s.def.toLocaleString()}</div><div class="sb-base">基 ${c.def}</div></div>
        <div class="stat-box"><div class="sb-label">速度</div><div class="sb-val">${s.spd}</div><div class="sb-base">基 ${c.spd}</div></div>
        <div class="stat-box"><div class="sb-label">暴击率</div><div class="sb-val">${critRate}%</div><div class="sb-base">基 20%${sgCrit?` ＋星神 ${Math.round(sgCrit*100)}%`:""}</div></div>
        <div class="stat-box"><div class="sb-label">暴击伤害</div><div class="sb-val">${critDmg}%</div><div class="sb-base">暴击时伤害 ×1.5</div></div>
        <div class="stat-box"><div class="sb-label">格挡率</div><div class="sb-val">${blockRate}%</div><div class="sb-base">${sgBlock?"格挡时减伤 50%":"装格挡星神获得"}</div></div>
      </div>
      <h3 style="margin:12px 0 4px 0;font-size:13px">⭐ 星神装配
        <span style="color:var(--muted);font-size:11px;font-weight:normal">每个角色 ${MAX_STAR_GODS} 个槽位，开局自动生效，不需要触发</span></h3>
      <div class="sg-wrap">
        <div class="sg-grid">${sgHtml}</div>
        <div class="sg-summary">开局气势：基础 ${sgBaseEnergy}${sgEnergyBonus?` ＋ 星神 ${sgEnergyBonus}`:""} ＝
          <b style="color:#e67e22">${sgEnergyTotal}</b>${sgEnergyTotal>=ULT_ENERGY_COST?`（≥ ${ULT_ENERGY_COST}，第一个大回合就能放大招）`:"（不够放大招）"}</div>
        <div class="sg-legend">${sgLegend}</div>
      </div>
      <h3 style="margin:10px 0 4px 0;font-size:13px">技能组合</h3>
      ${renderSkill(norm,"普攻")}
      ${renderSkill(ult,"大招")}
      ${hero?`<div class="hero-skill-wrap">
        <h3 style="margin:10px 0 4px 0;font-size:13px;color:#b8941d">英雄技（战前结算）</h3>
        ${renderSkill(hero,"英雄技")}
        <div class="hero-cond">发动条件：${heroCondText}</div>
      </div>`:""}
      ${passives.map(s=>renderSkill(s,"被动")).join("")}
      <div class="glossary-inline">
        <h3 style="margin:0 0 6px 0;font-size:13px">词条讲解 —— 这个角色用到的词条分别是什么意思</h3>
        <div style="font-size:11px;color:var(--muted);margin-bottom:8px">共 ${usedTypes.length} 种。鼠标悬浮技能里的彩色词条也能看讲解。</div>
        ${usedTypes.map(t=>{
          const m = TAG_META[t];
          const cat = TAG_CATS[m.cat]||{n:"其他"};
          const own = m.cat==="own";
          return `<div class="tag-doc ${own?"own":""}" style="border-left-color:${m.c}">
            <div class="td-head">
              <span class="tag-chip cat-${m.cat}" style="cursor:default">${m.n}</span>
              <span class="td-en">${t}</span>
              <span class="td-cat" style="color:${m.c};border-color:${m.c}">${cat.n}</span>
            </div>
            <div class="td-desc">${m.desc||""}</div>
            ${m.v?`<div class="td-meta"><b>数值含义</b>：${m.v}</div>`:""}
          </div>`;
        }).join("")}
      </div>
    `;
  },
  setLevel(lv){ lv=+lv; GROWTH_LEVELS[this.selected]=lv;
    try{ if(typeof DataIO!=="undefined" && DataIO.save) DataIO.save(); }catch(e){}
    this.render(); },
  /**
   * 换掉某个槽位的【星神】。传空字符串（下拉选回「空槽」）就是卸下。
   * 星神只影响战斗时的开局结算，所以改完只要落盘 + 重渲染，不用重建任何缓存。
   */
  setStarGod(idx, val){
    const c = CHARS.find(x=>x.id===this.selected);
    if(!c) return;
    if(!Array.isArray(c.starGods)) c.starGods = [];
    while(c.starGods.length < MAX_STAR_GODS) c.starGods.push(null);
    c.starGods[idx] = (val && STAR_GODS[val]) ? val : null;
    try{ if(typeof DataIO!=="undefined" && DataIO.save) DataIO.save(); }catch(e){}
    this.renderDetail();
  },
  /** 载入设计器去改这个角色。属性、技能、被动都能动，保存即原地覆盖。 */
  editCurrent(){
    if(!this.selected) return;
    try{
      DesignerUI.loadChar(this.selected);
      UI.showPage("designer");
    }catch(e){
      alert("载入设计器失败：" + (e && e.message || e));
    }
  }
};

