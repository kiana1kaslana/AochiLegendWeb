/* js/ui-glossary.js —— 由单文件 index.html 机械拆出，逻辑零改动 */
"use strict";
/* ================================================================
 * 基础词条表（词条图鉴）
 *   按分类展示所有通用词条：名称 / 英文 key / 含义 / 数值含义 / 被哪些技能用到
 * ================================================================ */
const GlossaryUI = {
  cat:"all",      // all | dmg | def | st | fn | own
  query:"",
  render(){
    const nav = document.getElementById("gl-nav");
    if(!nav) return;
    // 分类导航
    const cats = [["all","全部", "#5b6ee1"]].concat(Object.keys(TAG_CATS).map(k=>[k, TAG_CATS[k].n, TAG_CATS[k].c]));
    nav.innerHTML = cats.map(([k,n,c])=>{
      const on = this.cat===k;
      return `<div class="gl-tab ${on?"active":""}" style="${on?`background:${c};border-color:${c}`:""}" onclick="GlossaryUI.setCat('${k}')">${n}</div>`;
    }).join("");
    // 词条 -> 用到它的技能名列表
    const usedBy = {};
    for(const s of SKILLS){
      for(const t of (s.tags||[])){
        if(!usedBy[t.type]) usedBy[t.type] = [];
        if(!usedBy[t.type].includes(s.name)) usedBy[t.type].push(s.name);
      }
    }
    const q = this.query.trim().toLowerCase();
    const keys = Object.keys(TAG_META).filter(k=>{
      const m = TAG_META[k];
      if(this.cat!=="all" && m.cat!==this.cat) return false;
      if(!q) return true;
      return (m.n+" "+k+" "+(m.desc||"")+" "+(m.v||"")).toLowerCase().includes(q);
    });
    const cnt = document.getElementById("gl-count");
    if(cnt) cnt.textContent = `共 ${keys.length} 个词条${this.cat==="all"?"":"（已按分类筛选）"}`;
    // 按分类分组输出
    const body = document.getElementById("gl-body");
    const order = ["dmg","def","st","fn","own"];
    let html = "";
    let total = 0;
    for(const catKey of order){
      if(this.cat!=="all" && this.cat!==catKey) continue;
      const group = keys.filter(k=>TAG_META[k].cat===catKey);
      if(!group.length) continue;
      total += group.length;
      const c = TAG_CATS[catKey];
      html += `<div class="gl-cat">
        <div class="gl-cat-head" style="background:${c.c}14">
          <h3 style="color:${c.c}">${c.n} · ${group.length} 个</h3>
          <div class="gl-cat-desc">${c.desc}</div>
        </div>
        <div class="gl-grid">${group.map(k=>{
          const m = TAG_META[k];
          const ub = usedBy[k]||[];
          return `<div class="gl-card" style="border-left-color:${m.c}">
            <h4><span class="tag-chip cat-${m.cat}" style="cursor:default">${m.n}</span>
              <span style="font-size:11px;color:var(--muted)">短名「${m.s}」</span>
              <span class="gl-en">${k}</span></h4>
            <div class="gl-desc">${m.desc||""}</div>
            ${m.v?`<div class="gl-val"><b>数值含义</b>：${m.v}</div>`:""}
            <div class="gl-val" style="margin-top:3px">${m.tgt?"<b>可用目标</b>：是，可指定打谁":"<b>可用目标</b>：否，作用于自身/攻击者"}</div>
            ${ub.length?`<div class="gl-used">当前用到它的技能：${ub.join("、")}</div>`:""}
          </div>`;
        }).join("")}</div>
      </div>`;
    }
    body.innerHTML = html || `<div style="color:var(--muted);padding:20px;text-align:center">没有匹配的词条，换个关键词试试</div>`;
    // 职业速查
    const clsBox = document.getElementById("gl-classes");
    if(clsBox){
      clsBox.innerHTML = Object.keys(CLASS_META).map(k=>{
        const m = CLASS_META[k];
        const stand = {front:"前排（承伤位）", mid:"中排（输出位）", back:"后排（保护位）"}[m.cls] || "中排";
        const mem = CHARS.filter(c=>c.charClass===k).map(c=>c.name);
        return `<div class="gl-card" style="border-left-color:${m.c}">
          <h4>${clsBadge(k,true)} <span style="font-size:11px;color:var(--muted)">${m.tag}</span>
            <span class="gl-en">${k}</span></h4>
          <div class="gl-desc">${m.desc}</div>
          <div class="gl-val"><b>推荐站位</b>：${stand}</div>
          <div class="gl-val"><b>建议成长倾向</b>：${GROWTH_STYLE_LABEL[m.grow]||m.grow}</div>
          <div class="gl-val" style="color:var(--accent)">${m.pick}</div>
          <div class="gl-used">当前属于该职业的角色：${mem.length?mem.join("、"):"（暂无）"}</div>
        </div>`;
      }).join("");
    }
    // 特殊职业速查。目前只有【英雄】一种，机制是「带条件的战前全队光环」。
    const spBox = document.getElementById("gl-special");
    if(spBox){
      spBox.innerHTML = Object.keys(SPECIAL_CLASS_META).map(k=>{
        const m = SPECIAL_CLASS_META[k];
        const members = CHARS.filter(c=>c.specialClass===k);
        const heroSkills = members.map(c=>c.heroSkillId).filter(Boolean)
          .map(id=>SKILLS.find(s=>s.id===id)).filter(Boolean);
        const condTexts = heroSkills.map(s=>{
          const cond = (s.tags||[]).find(t=>t.type==="AuraCondition");
          if(!cond) return `${s.name}：无条件`;
          const els = (cond.elements||[]).map(e=>(ELEMENTS[e]||{}).n||e).join("/");
          return `${s.name}：己阵 ${els} 属性 ≥ ${cond.value} 人`;
        });
        return `<div class="gl-card" style="border-left-color:${m.c}">
          <h4>${specBadge(k,true)} <span style="font-size:11px;color:var(--muted)">${m.tag}</span>
            <span class="gl-en">${k}</span></h4>
          <div class="gl-desc">${m.desc}</div>
          ${condTexts.length?`<div class="gl-val"><b>发动条件</b>：${condTexts.join("；")}</div>`:""}
          <div class="gl-val" style="color:var(--accent)">${m.pick}</div>
          <div class="gl-used">当前属于该特殊职业的角色：${members.length?members.map(c=>c.name).join("、"):"（暂无）"}</div>
        </div>`;
      }).join("");
    }
  },
  setCat(k){ this.cat = k; this.render(); },
  setQuery(v){ this.query = v||""; this.render(); },
};

