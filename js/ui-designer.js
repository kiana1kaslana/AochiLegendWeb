/* js/ui-designer.js —— 由单文件 index.html 机械拆出，逻辑零改动 */
"use strict";
/* ================================================================
 * 角色自定义设计器
 *   左：基础属性 + 元素选择 + 战斗力预览
 *   右：动态添加技能，每个技能里动态加/删词条
 *   底部：保存到仓库（追加新角色）/导出 JSON
 * ================================================================ */
const GROWTH_STYLE_PRESETS = {
  tank:     {hp:0.55, atk:0.42, def:0.50, spd:0.40},
  assassin: {hp:0.42, atk:0.55, def:0.40, spd:0.50},
  mage:     {hp:0.45, atk:0.52, def:0.42, spd:0.45},
  dps:      {hp:0.48, atk:0.50, def:0.42, spd:0.46},
  healer:   {hp:0.50, atk:0.45, def:0.48, spd:0.44},
  warrior:  {hp:0.52, atk:0.48, def:0.46, spd:0.44},
  support:  {hp:0.46, atk:0.45, def:0.44, spd:0.50},
};
// 成长倾向中文名（与职业是两个概念：职业=定位，成长倾向=属性成长曲线）
const GROWTH_STYLE_LABEL = {
  tank:"坦克（HP高、攻低）", assassin:"刺客（攻高、HP低）", mage:"法师（攻高、HP中）",
  dps:"输出（平衡）", healer:"治疗（HP高、攻中）", warrior:"战士（攻防平衡）", support:"辅助（速高）",
};
const DesignerUI = {
  state:null,         // 当前正在编辑的角色对象
  editingId:null,     // 非空 = 正在改仓库里的某个已有角色（只影响顶部提示文案）
  elementChoice:"Fire",
  initState(){
    this.editingId = null;
    this.state = {
      id:"char_custom", name:"新角色",
      charClass:"balance",
      // 特殊职业是叠加层：不填就是普通角色，填了才有额外机制（目前只有 hero）
      specialClass:"", heroSkillId:null,
      maxHp:3000, atk:700, def:200, spd:100,
      startingEnergy:50, element:"Fire",
      growthStyle:"mage",
      normalAttackId:"atk_fire",
      ultimateId:"ult_fire_storm",
      passiveIds:[],
      // 【星神】装配槽（4 个，空槽 null）。新角色默认一个【气势星神】= 开局满 100 气势。
      // 装配本身在「角色仓库」里改，这里只负责带着走，免得保存时把已有装配弄丢。
      starGods:[STAR_GOD_DEFAULT, null, null, null],
      // 自定义技能缓存（设计器内独有，未保存进 SKILLS 时存在这里）
      customSkills:[]
    };
    this.elementChoice = "Fire";
    // 默认挂 2 个被动供用户参考
    this.state.passiveIds = ["pas_counter_25"];
  },
  /**
   * 把仓库里的角色载入设计器 —— 「自己改初始角色」的正门。
   * 从「角色仓库」点「✎ 编辑此角色」进来，改完保存就是原地覆盖（ID 相同）。
   *
   * 注意技能是**共享对象**：技能块里对词条的每一次改动都是直接改 SKILLS 里的那一份，
   * 引用同一个技能的其他角色会一起变。这不是 bug，是数据模型——所以技能块上标了
   * 「被 N 个角色共用」，改之前能看见影响面。
   */
  loadChar(id){
    const c = CHARS.find(x=>x.id===id);
    if(!c){ alert("找不到角色 " + id); return; }
    this.editingId = c.id;
    this.state = {
      id:c.id, name:c.name,
      charClass:c.charClass || "balance",
      specialClass:c.specialClass || "",
      heroSkillId:c.heroSkillId || null,
      maxHp:c.maxHp, atk:c.atk, def:c.def, spd:c.spd,
      startingEnergy:c.startingEnergy ?? 50,
      element:c.element,
      growthStyle:this._styleKeyOf(GROWTH_STYLE[c.id]) || "mage",
      normalAttackId:c.normalAttackId,
      ultimateId:c.ultimateId,
      passiveIds:[...(c.passiveIds||[])],
      // 【星神】装配必须原样带过来：saveAsNew 是「用 state 重建一个 newChar 整条覆盖」，
      // 不带上就等于"进设计器改个等级，顺手把星神全卸了"。补 null 到 4 个槽位再截断。
      starGods:[...(c.starGods||[])].concat([null,null,null,null]).slice(0,MAX_STAR_GODS),
      customSkills:[],   // 载入已有角色时不带临时技能：它的技能已经在 SKILLS 里了
    };
    this.elementChoice = c.element;
    this.render();
  },
  /** 反查角色用的是哪套成长倾向，好把下拉框对回去 */
  _styleKeyOf(preset){
    if(!preset) return null;
    for(const k of Object.keys(GROWTH_STYLE_PRESETS)){
      const p = GROWTH_STYLE_PRESETS[k];
      if(p.hp===preset.hp && p.atk===preset.atk && p.def===preset.def && p.spd===preset.spd) return k;
    }
    return null;
  },
  /** 清掉本地存档，回到代码里写死的默认数据 */
  resetAll(){
    if(!confirm("确定清掉所有本地改动吗？角色、技能、等级、阵容都会回到默认值。")) return;
    try{ DataIO.reset(); }
    catch(e){ alert("清除失败：" + (e && e.message || e)); }
  },
  /** 保存成功/失败的一行小字反馈 */
  _flash(text){
    const el = document.getElementById("save-flash");
    if(!el) return;
    el.textContent = text;
    el.style.opacity = "1";
    clearTimeout(this._flashT);
    this._flashT = setTimeout(()=>{ el.style.opacity = "0"; }, 2400);
  },
  /**
   * 词条改的是 SKILLS 里的**共享对象**，不跟着 saveAsNew 走——所以每次改动都立刻落盘，
   * 否则用户改完技能直接刷新（没点保存）就白改了。
   * 传进来的若还是「设计器里的临时技能」（没进 SKILLS），就没法存档，如实说明。
   */
  _autosave(skill){
    const isTemp = !!(skill && this.state && this.state.customSkills
      && this.state.customSkills.indexOf(skill) >= 0);
    if(isTemp){ this._flash("草稿已改，点「保存」才会写进仓库"); return; }
    let ok = false;
    try{ ok = (typeof DataIO!=="undefined" && DataIO.save) ? !!DataIO.save() : false; }
    catch(e){ ok = false; }
    this._flash(ok ? "已自动保存（刷新后仍在）" : "本地存储不可用，改动只在本次会话有效");
  },
  /** 保存按钮文案：ID 撞上仓库里的角色时说明这是覆盖不是新增 */
  refreshSaveBtn(){
    const btn = document.getElementById("d-save-btn");
    if(!btn) return;
    const idEl = document.getElementById("d-id");
    const id = idEl ? String(idEl.value||"").trim() : "";
    const exists = id && CHARS.some(c=>c.id===id);
    btn.textContent = exists ? "💾 保存修改（覆盖现有角色）" : "💾 保存为新角色（加入仓库）";
  },
  render(){
    if(!this.state) this.initState();
    // 渲染元素选择器
    const ep = document.getElementById("d-elements");
    if(ep){
      ep.innerHTML = "";
      for(const k of Object.keys(ELEMENTS)){
        if(k==="None") continue;
        const m = ELEMENTS[k];
        const d = document.createElement("div");
        d.className = "ep"+(this.elementChoice===k?" active":"");
        d.style.background = this.elementChoice===k ? m.c : "#fff";
        d.style.color = this.elementChoice===k ? "#fff" : m.c;
        d.textContent = m.n+"系";
        d.onclick = ()=>{ this.elementChoice = k; this.state.element = k; this.render(); };
        ep.appendChild(d);
      }
    }
    // 同步表单值
    document.getElementById("d-id").value = this.state.id;
    document.getElementById("d-name").value = this.state.name;
    document.getElementById("d-hp").value = this.state.maxHp;
    document.getElementById("d-atk").value = this.state.atk;
    document.getElementById("d-def").value = this.state.def;
    document.getElementById("d-spd").value = this.state.spd;
    document.getElementById("d-energy").value = this.state.startingEnergy;
    document.getElementById("d-class").value = this.state.charClass || "balance";
    document.getElementById("d-style").value = this.state.growthStyle;
    const spSel = document.getElementById("d-special");
    if(spSel) spSel.value = this.state.specialClass || "";
    this.renderClassHint();
    this.renderSpecialHint();
    // 战斗力预览
    const preset = GROWTH_STYLE_PRESETS[this.state.growthStyle]||GROWTH_STYLE_PRESETS.mage;
    // Lv50 系数 = 1.0（锚点），预览战斗力
    const hp = Math.round(this.state.maxHp * (1 + (preset.hp-0.5)*0.3));  // 接近 Lv50 估算
    const atk = Math.round(this.state.atk * (1 + (preset.atk-0.5)*0.3));
    const def = Math.round(this.state.def * (1 + (preset.def-0.5)*0.3));
    const spd = this.state.spd;
    document.getElementById("d-power").textContent = (hp/10 + atk*2 + def*2 + spd*1.5).toFixed(0).toLocaleString();
    this.refreshSaveBtn();
    const hint = document.getElementById("d-editing-hint");
    if(hint){
      const ec = this.editingId ? CHARS.find(x=>x.id===this.editingId) : null;
      if(ec){
        hint.style.display = "";
        hint.innerHTML = `✎ 正在编辑仓库角色 <b>${ec.name}</b>（${ec.id}）—— 保存是原地覆盖，不会新建一个`;
      } else {
        hint.style.display = "none"; hint.innerHTML = "";
      }
    }
    // 渲染技能列表
    this.renderSkills();
  },
  // 职业下拉变更：只改职业，不强制改成长倾向（两者独立）
  pickClass(k){
    this.state.charClass = k;
    this.renderClassHint();
  },
  renderClassHint(){
    const box = document.getElementById("d-class-hint");
    if(!box) return;
    const cm = clsMeta(this.state.charClass);
    const stand = {front:"前排（承伤位）", mid:"中排（输出位）", back:"后排（保护位）"}[cm.cls] || "中排";
    box.style.borderLeftColor = cm.c;
    box.innerHTML = `<span style="color:${cm.c};font-weight:bold">${cm.icon} ${cm.n}｜${cm.tag}</span>
      <span style="color:var(--muted)">推荐站位 ${stand}｜建议成长倾向 ${GROWTH_STYLE_LABEL[cm.grow]||cm.grow}</span>
      <div style="margin-top:3px">${cm.desc}</div>
      <div style="margin-top:3px;color:var(--accent)">💡 ${cm.pick}</div>`;
  },
  // 特殊职业切换。选【英雄】时自动挂上第一个英雄技，否则 heroSkillId 清空——
  // 留着旧值会让一个非英雄角色在战斗里凭空放英雄技。
  pickSpecial(k){
    this.state.specialClass = k || "";
    if(!this.state.specialClass){
      this.state.heroSkillId = null;
    } else if(!this.state.heroSkillId || !SKILLS.find(s=>s.id===this.state.heroSkillId)){
      const first = SKILLS.find(s=>s.triggerType==="HeroSkill");
      this.state.heroSkillId = first ? first.id : null;
    }
    this.renderSpecialHint();
  },
  /** 英雄技选择区：只在选了【英雄】时显示 */
  renderSpecialHint(){
    const box = document.getElementById("d-hero-skill");
    if(!box) return;
    const m = this.state.specialClass ? specMeta(this.state.specialClass) : null;
    if(!m){ box.style.display = "none"; box.innerHTML = ""; return; }
    const opts = SKILLS.filter(s=>s.triggerType==="HeroSkill")
      .map(s=>`<option value="${s.id}" ${s.id===this.state.heroSkillId?"selected":""}>${s.name}（${s.id}）</option>`).join("");
    const skill = SKILLS.find(s=>s.id===this.state.heroSkillId);
    // 条件预览：没有英雄技可选时明确提示，而不是给个空下拉框
    let condHtml = "<span style='color:#c0392b'>当前词条库里还没有英雄技，去「技能」页加一个 triggerType=HeroSkill 的技能</span>";
    if(skill){
      const cond = (skill.tags||[]).find(t=>t.type==="AuraCondition");
      condHtml = cond
        ? `己阵 ${(cond.elements||[]).map(e=>(ELEMENTS[e]||{}).n||e).join("/")} 属性角色 ≥ ${cond.value} 人时发动，否则整条作废`
        : "无条件，必定发动";
    }
    const chips = skill ? (skill.tags||[]).filter(t=>t.type!=="AuraCondition")
      .map(t=>tagChipHtml(t.type, t.value!=null&&t.value!==0?String(t.value):"",
        {targetName:t.target&&TARGET_META[t.target]?TARGET_META[t.target].n:null})).join("") : "";
    box.style.display = "";
    box.innerHTML = `<div class="cp-head"><span style="color:${m.c};font-weight:bold">${m.icon} 特殊职业：${m.n}</span>
        <span class="cp-badge" style="background:${m.c}1a;color:${m.c};border-color:${m.c}">${m.tag}</span></div>
      <div class="cp-body" style="margin-bottom:6px">${m.desc}</div>
      <div style="font-size:11px;color:var(--muted);margin-bottom:4px">英雄技</div>
      <select style="width:100%;padding:5px;border:1px solid var(--border);border-radius:4px" onchange="DesignerUI.changeHeroSkill(this.value)">${opts}</select>
      ${skill?`<div class="hero-cond" style="margin-top:6px">发动条件：${condHtml}</div>
      <div class="tag-chips" style="margin-top:6px">${chips||"<span style='color:var(--muted);font-size:11px'>该英雄技没有词条</span>"}</div>`:""}`;
  },
  changeHeroSkill(id){ this.state.heroSkillId = id || null; this.renderSpecialHint(); },
  renderSkills(){
    const wrap = document.getElementById("d-skills");
    if(!wrap) return;
    const allSkills = [...SKILLS, ...this.state.customSkills];
    const findSkill = id => allSkills.find(k=>k.id===id);
    let html = "";
    // 普攻
    html += this._renderSkillBlock("normal", "普攻", this.state.normalAttackId, allSkills, false);
    // 大招
    html += this._renderSkillBlock("ultimate", "大招", this.state.ultimateId, allSkills, false);
    // 被动列表
    html += `<div style="margin-top:8px;font-size:12px;color:var(--muted)">被动技能（可多个）</div>`;
    this.state.passiveIds.forEach((pid, i)=>{
      html += this._renderSkillBlock("passive", `被动 #${i+1}`, pid, allSkills, true, i);
    });
    wrap.innerHTML = html;
  },
  _renderSkillBlock(role, label, skillId, allSkills, removable, passiveIdx){
    const skill = allSkills.find(s=>s.id===skillId);
    // 按格子用途过滤可选技能：普攻槽只列普攻、大招槽只列大招、被动槽排除这三类之外还有英雄技。
    // 不过滤的话英雄技会出现在"普攻"下拉里，选下去就是一个永远不会被触发的技能。
    const allow = s=>{
      const t = s.triggerType;
      if(s.id===skillId) return true;        // 当前选中的永远保留，否则下拉框显示的项对不上
      if(role==="normal") return t==="NormalAttack";
      if(role==="ultimate") return t==="Ultimate";
      if(role==="passive") return t!=="NormalAttack" && t!=="Ultimate" && t!=="HeroSkill";
      return true;
    };
    const opts = allSkills.filter(allow).map(s=>`<option value="${s.id}" ${s.id===skillId?"selected":""}>${(TRIGGER_META[s.triggerType]||{}).n||""} · ${s.name}</option>`).join("");
    let inner = "";
    if(skill){
      const multTag = (skill.tags||[]).find(t=>t.type==="DamageMultiplier");
      const multText = multTag ? `<strong>${multTag.value||1.0}×</strong> 倍率` : "（无伤害词条）";
      inner += `<div class="sk-dmg" style="margin:4px 0">${multText}${skill.energyCost?` · 门槛 ${skill.energyCost} 气势`:""}</div>`;
      inner += `<div style="font-size:11px;color:var(--muted);margin:4px 0">词条（点击删除 / 改值实时生效）</div>`;
      (skill.tags||[]).forEach((t, ti)=>{
        const m = TAG_META[t.type]||{n:t.type,c:"#999"};
        const targets = TARGETS.map(k=>`<option value="${k}" ${(t.target||"CurrentTarget")===k?"selected":""}>${(TARGET_META[k]||{}).n||k}</option>`).join("");
        inner += `<div class="des-tag-row">
          <select style="min-width:90px" onchange="DesignerUI.changeTagType('${role}',${passiveIdx??-1},${ti},this.value)">${Object.keys(TAG_META).map(k=>`<option value="${k}" ${t.type===k?"selected":""}>${TAG_META[k].n}</option>`).join("")}</select>
          <span style="font-size:11px;color:${m.c};background:${m.c}1a;padding:2px 6px;border-radius:3px;min-width:60px;text-align:center">${m.n}</span>
          <label style="font-size:10px">数值<input type="number" class="num" step="0.05" value="${t.value??1}" onchange="DesignerUI.changeTag('${role}',${passiveIdx??-1},${ti},'value',this.value)"></label>
          <label style="font-size:10px">概率<input type="number" class="ch" step="0.05" min="0" max="1" value="${t.chance??1}" onchange="DesignerUI.changeTag('${role}',${passiveIdx??-1},${ti},'chance',this.value)"></label>
          <label style="font-size:10px">回<input type="number" class="dur" step="1" value="${t.duration??0}" onchange="DesignerUI.changeTag('${role}',${passiveIdx??-1},${ti},'duration',this.value)"></label>
          <select class="tg" onchange="DesignerUI.changeTag('${role}',${passiveIdx??-1},${ti},'target',this.value)">${targets}</select>
          <button class="btn small gray" onclick="DesignerUI.removeTag('${role}',${passiveIdx??-1},${ti})">删</button>
        </div>`;
      });
      inner += `<button class="btn small" onclick="DesignerUI.addTag('${role}',${passiveIdx??-1})">+ 加词条</button>`;
    } else {
      inner = `<div style="color:var(--muted);font-size:12px;padding:8px">未选技能</div>`;
    }
    // 技能是共享对象，标一下影响面：改词条会把用到它的角色一起改掉
    const users = skill ? CHARS.filter(c=>c.normalAttackId===skillId || c.ultimateId===skillId
      || c.heroSkillId===skillId || (c.passiveIds||[]).includes(skillId)) : [];
    const sharedHtml = users.length>1
      ? `<span class="shared-by" title="技能定义只有一份，改词条会同步影响这些角色">⚠ 被 ${users.length} 个角色共用：${users.map(c=>c.name).join("、")}</span>`
      : "";
    let html = `<div class="des-skill-item">
      <h4>${label}${removable?` <button class="btn small gray" style="float:right" onclick="DesignerUI.removePassive(${passiveIdx})">删除整个被动</button>`:""}</h4>
      <div class="des-skill-pick">
        <select onchange="DesignerUI.changeSkill('${role}',${passiveIdx??-1},this.value)">${opts}</select>${sharedHtml}
      </div>
      ${inner}
    </div>`;
    return html;
  },
  // ===== 变更事件 =====
  changeSkill(role, pIdx, newId){
    const allSkills = [...SKILLS, ...this.state.customSkills];
    const skill = allSkills.find(s=>s.id===newId);
    if(!skill) return;
    if(role==="normal") this.state.normalAttackId = newId;
    else if(role==="ultimate") this.state.ultimateId = newId;
    else if(role==="passive" && pIdx>=0) this.state.passiveIds[pIdx] = newId;
    this.renderSkills();
  },
  changeTagType(role, pIdx, tIdx, newType){
    const skill = this._getSkill(role, pIdx);
    if(!skill) return;
    skill.tags[tIdx].type = newType;
    this._autosave(skill);
    this.renderSkills();
  },
  changeTag(role, pIdx, tIdx, key, val){
    const skill = this._getSkill(role, pIdx);
    if(!skill) return;
    if(key==="value" || key==="chance" || key==="duration") val = +val;
    skill.tags[tIdx][key] = val;
    this._autosave(skill);
    // value 改了可能要刷新预览
    if(key==="value" || key==="chance") this.renderSkills();
  },
  addTag(role, pIdx){
    const skill = this._getSkill(role, pIdx);
    if(!skill) return;
    if(!skill.tags) skill.tags = [];
    skill.tags.push({type:"DamageMultiplier",value:1.0,chance:1,duration:0,target:"CurrentTarget"});
    this._autosave(skill);
    this.renderSkills();
  },
  removeTag(role, pIdx, tIdx){
    const skill = this._getSkill(role, pIdx);
    if(!skill) return;
    skill.tags.splice(tIdx, 1);
    this._autosave(skill);
    this.renderSkills();
  },
  _getSkill(role, pIdx){
    const allSkills = [...SKILLS, ...this.state.customSkills];
    if(role==="normal") return allSkills.find(s=>s.id===this.state.normalAttackId);
    if(role==="ultimate") return allSkills.find(s=>s.id===this.state.ultimateId);
    if(role==="passive" && pIdx>=0) {
      const pid = this.state.passiveIds[pIdx];
      return allSkills.find(s=>s.id===pid);
    }
    return null;
  },
  // ===== 操作 =====
  addSkill(){
    // 加一个自定义空白大招模板
    const id = "custom_"+Date.now();
    const sk = {id, name:"自定义大招", triggerType:"Ultimate", energyCost:100, tags:[{type:"DamageMultiplier",value:1.5,chance:1,duration:0,target:"CurrentTarget"}]};
    this.state.customSkills.push(sk);
    this.state.ultimateId = id;
    this.renderSkills();
  },
  removePassive(idx){
    this.state.passiveIds.splice(idx, 1);
    this.renderSkills();
  },
  presetFill(){
    this.editingId = null;
    this.state.id = "char_grass_warrior";
    this.state.name = "翠叶战士（模板）";
    this.state.maxHp = 3500; this.state.atk = 700; this.state.def = 280;     this.state.spd = 95;
    this.state.startingEnergy = 50;
    this.state.charClass = "tank";
    this.elementChoice = "Grass";
    this.state.element = "Grass";
    this.state.growthStyle = "warrior";
    this.state.normalAttackId = "atk_grass";
    this.state.ultimateId = "ult_aoe_slam";
    this.state.passiveIds = ["pas_block_40"];
    this.render();
  },
  saveAsNew(){
    // 同步表单回 state
    this.state.id = document.getElementById("d-id").value.trim() || "char_custom";
    this.state.name = document.getElementById("d-name").value.trim() || "未命名";
    this.state.maxHp = +document.getElementById("d-hp").value;
    this.state.atk   = +document.getElementById("d-atk").value;
    this.state.def   = +document.getElementById("d-def").value;
    this.state.spd   = +document.getElementById("d-spd").value;
    this.state.startingEnergy = +document.getElementById("d-energy").value;
    this.state.charClass = document.getElementById("d-class").value;
    this.state.growthStyle = document.getElementById("d-style").value;
    const spEl = document.getElementById("d-special");
    this.state.specialClass = spEl ? (spEl.value||"") : "";
    if(!this.state.specialClass) this.state.heroSkillId = null;
    // 重名检查
    const exist = CHARS.findIndex(c=>c.id===this.state.id);
    const preset = GROWTH_STYLE_PRESETS[this.state.growthStyle];
    GROWTH_STYLE[this.state.id] = preset;
    GROWTH_LEVELS[this.state.id] = GROWTH_LEVELS[this.state.id]||50;
    const newChar = {
      id:this.state.id, name:this.state.name,
      charClass:this.state.charClass,
      maxHp:this.state.maxHp, atk:this.state.atk, def:this.state.def, spd:this.state.spd,
      element:this.state.element,
      normalAttackId:this.state.normalAttackId,
      ultimateId:this.state.ultimateId,
      passiveIds:[...this.state.passiveIds],
      startingEnergy:this.state.startingEnergy,
      // 【星神】装配跟着 state 走（载入已有角色时带过来的，新角色走 initState 的默认值）
      starGods:[...(this.state.starGods||[])].concat([null,null,null,null]).slice(0,MAX_STAR_GODS),
    };
    // 特殊职业字段只在真选了的时候写进去，避免往普通角色身上挂一个空的 heroSkillId
    if(this.state.specialClass){
      newChar.specialClass = this.state.specialClass;
      if(this.state.heroSkillId) newChar.heroSkillId = this.state.heroSkillId;
    }
    // 把临时自定义大招写进 SKILLS（如果有）
    for(const csk of this.state.customSkills){
      if(!SKILLS.find(s=>s.id===csk.id)) SKILLS.push(JSON.parse(JSON.stringify(csk)));
    }
    if(exist>=0){
      CHARS[exist] = newChar;
    } else {
      CHARS.push(newChar);
    }
    // 落盘。不存的话刷新一下改动就回默认数据了，等于没改
    let ok = false;
    try{ ok = (typeof DataIO!=="undefined" && DataIO.save) ? !!DataIO.save() : false; }catch(e){ ok = false; }
    const tail = ok ? "已保存到本地（刷新后仍在）" : "本地存储不可用，改动只在本次会话有效";
    this._flash((exist>=0 ? `已覆盖「${this.state.name}」· ` : `新角色「${this.state.name}」已入库 · `) + tail);
    // 刷新布阵 / 养成 / 仓库
    TeamUI.render();
    RosterUI.render();
    // 编辑已有角色时，顶部提示条和技能共用徽章要跟着新数据更新
    if(this.editingId) this.render();
  },
  exportJson(){
    this.saveAsNew();
    const payload = JSON.stringify(CHARS,null,2);
    const blob = new Blob([payload],{type:"application/json"});
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "characters.json";
    a.click();
    URL.revokeObjectURL(url);
  }
};

