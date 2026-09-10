/* js/storage.js —— 由单文件 index.html 机械拆出，逻辑零改动 */
"use strict";
/* ---------- 导出 / 本地存档 ---------- */
/**
 * 存档是**按 id 合并**回去的，不是整包替换。
 * 理由：以后代码里新增一个默认角色时，用户的旧存档里没有它；整包替换会让新角色凭空消失。
 * 合并则「存档里的覆盖同名项，代码里新增的默认项保留」。
 */
function mergeById(base, incoming){
  if(!Array.isArray(incoming)) return;
  const idx = new Map();
  base.forEach((x,i)=>{ if(x && x.id!=null) idx.set(x.id, i); });
  for(const item of incoming){
    if(!item || item.id==null) continue;
    if(idx.has(item.id)) base[idx.get(item.id)] = item;
    else { idx.set(item.id, base.length); base.push(item); }
  }
}
/** 对象按键合并（成长倾向表、等级表） */
function mergeObject(base, incoming){
  if(!incoming || typeof incoming!=="object") return;
  for(const k of Object.keys(incoming)) base[k] = incoming[k];
}

const DataIO = {
  KEY: "aochi_save_v1",

  /**
   * 把当前内存里的角色/技能/成长倾向/等级/阵容整包写进 localStorage。
   * 返回是否写成功——隐私模式、配额满、headless 沙箱都可能失败，
   * 这里吞掉异常并返回 false，免得把「拖一下等级滑条」这种小事搞成崩溃。
   */
  save(){
    try{
      if(typeof localStorage==="undefined") return false;
      localStorage.setItem(this.KEY, JSON.stringify({
        v:1,
        chars:CHARS, skills:SKILLS,
        growthStyle:GROWTH_STYLE, levels:GROWTH_LEVELS,
        teams:TEAMS,
      }));
      return true;
    }catch(e){
      try{ console.warn("本地存档写入失败：", e); }catch(_){}
      return false;
    }
  },

  /** 读存档并覆盖内存。返回 true 表示确实载入了存档（调用方据此决定要不要补默认阵容） */
  load(){
    let raw = null;
    try{ raw = (typeof localStorage!=="undefined") ? localStorage.getItem(this.KEY) : null; }
    catch(e){ return false; }
    if(!raw) return false;
    let bag;
    try{ bag = JSON.parse(raw); }
    catch(e){ try{ console.warn("存档损坏，按默认数据启动：", e); }catch(_){} return false; }
    if(!bag || typeof bag!=="object") return false;
    // CHARS / SKILLS / TEAMS 都是 const 绑定，只能就地改内容，不能重新赋值
    if(Array.isArray(bag.chars)) mergeById(CHARS, bag.chars);
    if(Array.isArray(bag.skills)) mergeById(SKILLS, bag.skills);
    // 存档里的角色是整条替换的，老档没有 starGods 字段 —— 这里补一次，
    // 不然「刷新一下默认星神就没了」。见 ensureStarGods 的注释。
    ensureStarGods();
    // 诺亚「时间之子」schema 强制覆盖：老存档里这条被动可能还带着上一版的【复活储备】
    // 词条（每回合白送一条命 → 双重复活），新版本只有【复活（带连携）】+【回满血】。
    // 策划口径变了，但存档还是旧版 —— 这里以代码为准把 tags 重置一次。
    // 等以后设计稳定了再换成统一的 schema 版本号机制（清掉整包存档）。
    {
      const t = SKILLS.find(s=>s.id==="pas_noah_time");
      if(t && (t.tags||[]).some(x=>x.type==="ReviveCharge")){
        t.tags = [
          {type:"Revive", value:1.0, target:"Self", chain:1},
          {type:"HealPct", value:1.0, target:"Self"}
        ];
        t.fromRound = 2;
      }
    }
    mergeObject(GROWTH_STYLE, bag.growthStyle);
    mergeObject(GROWTH_LEVELS, bag.levels);
    if(bag.teams && typeof bag.teams==="object"){
      for(const side of ["player","enemy"]){
        const pos = bag.teams[side] && bag.teams[side].positions;
        if(Array.isArray(pos)) TEAMS[side].positions = pos;
      }
    }
    return true;
  },

  /** 清掉存档并重来，回到代码里写死的默认数据 */
  reset(){
    try{ if(typeof localStorage!=="undefined") localStorage.removeItem(this.KEY); }catch(e){}
    try{ location.reload(); }catch(e){ /* headless 无 location 时忽略 */ }
  },

  export(){
    const charsOut = CHARS.map(c=>{
      const s = statsAt(c.id, GROWTH_LEVELS[c.id]||50);
      return {...c, level:GROWTH_LEVELS[c.id]||50, maxHp:s.maxHp, atk:s.atk, def:s.def, spd:s.spd,
        energyPerTurn:1, energyPerAttack:1, portraitSlot:"", modelSlot:""};
    });
    const skillsOut = SKILLS.map(s=>({...s, tags:(s.tags||[]).map(t=>({
      type:t.type, value:t.value||0, chance:t.chance??1, duration:t.duration||0, target:t.target||"CurrentTarget"}))}));
    const blob = new Blob([JSON.stringify({characters:charsOut, skills:skillsOut},null,2)],{type:"application/json"});
    const a = document.createElement("a");
    a.href = URL.createObjectURL(blob);
    a.download = "aochi_data.json";
    a.click();
    URL.revokeObjectURL(a.href);
  }
};

