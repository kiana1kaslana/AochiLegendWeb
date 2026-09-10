/* js/engine.js —— 由单文件 index.html 机械拆出，逻辑零改动 */
"use strict";
/* ================================================================
 * 战斗引擎（与 C# 版逐行对应移植）
 * ================================================================ */
function mulberry32(seed){
  let a = seed >>> 0;
  return function(){
    a |= 0; a = a + 0x6D2B79F5 | 0;
    let t = Math.imul(a ^ a >>> 15, 1 | a);
    t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
    return ((t ^ t >>> 14) >>> 0) / 4294967296;
  };
}

// 增益类状态（其余一律算减益，会被【净化】清掉）
// MaxHpUp / Immunity 都是增益：它们不会被净化误伤，反而会被驱散针对。
const BUFF_TYPES = ["AtkUp","DefUp","SpdUp","Shield","DamageReduction","DodgeBoost","CritBoost","Stealth","MaxHpUp","Immunity","VitalityOnHurt"];
function seIsBuff(t){ return BUFF_TYPES.includes(t); }
function seIsDebuff(t){ return !seIsBuff(t) && t !== "None"; }
// 词条类型 → 状态类型。旧数据里的 Stun / Freeze 一律归到统一的【控制】。
const TAG_TO_STATUS = {
  Control:"Control", Stun:"Control", Freeze:"Control",
  Poison:"Poison", Burn:"Burn", Bleed:"Bleed",
  AtkDown:"AtkDown", DefDown:"DefDown", SpdDown:"SpdDown", Taunt:"Taunt",
  AtkUp:"AtkUp", DefUp:"DefUp", SpdUp:"SpdUp", Shield:"Shield",
  DamageReduction:"DamageReduction", Stealth:"Stealth",
  HealBlock:"HealBlock",
};
function tagToStatus(tag){ return TAG_TO_STATUS[tag.type] || null; }

class StatusEffect{
  // meta 用来带「一个数值塞不下」的配置，目前只有【生息不止】用（value 存回复比例，
  // meta.hits 存触发【连携】需要的受击次数）。不带就是 null，其余状态不受影响。
  constructor(type,value,turns,source,meta){
    this.type=type; this.value=value; this.remainingTurns=turns; this.source=source;
    this.meta = meta || null;
  }
  get isBuff(){ return seIsBuff(this.type); }
  get isDebuff(){ return seIsDebuff(this.type); }
}

class BattleUnit{
  constructor(charData, lvStats, gridPos, isPlayer, skills){
    this.data = charData;
    this.stats = lvStats;              // 养成后属性
    this.gridPosition = gridPos;
    this.isPlayerSide = isPlayer;
    this.isAlive = true;
    this.currentHp = lvStats.maxHp;
    this.statusEffects = [];
    this.bonusCritChance = 0;
    this.bonusDodgeChance = 0;
    // 【连击】额外出手回合的递归深度守卫：额外回合不再派生额外回合，否则无限递归
    this._comboDepth = 0;
    // ===== 装备预留字段（现在都是 0，以后接装备系统时由装备填）=====
    this.gearCritChance = 0;   // 装备追加的暴击率，例如 +0.15
    this.gearCritMult   = 0;   // 装备追加的暴击倍率，叠加到 BASE_CRIT_MULT 上
    this.gearStartEnergy= 0;   // 装备追加的开局气势（"开局满气势"的装备写这里）
    this.gearMaxEnergy  = 0;   // 装备追加的气势上限
    // 开局气势：角色自身配置优先，再叠装备
    this.currentEnergy = (charData.startingEnergy ?? BASE_ENERGY) + this.gearStartEnergy;
    // ===== 【星神】装配（开局一次性结算）=====
    // starAtkPct 进 effAtk；starCritChance 进 _processAttack 的暴击判定；
    // starDodgeChance 进闪避判定；starBlockChance/starBlockValue 进格挡判定。
    // 全部单开字段，不复用那些每回合会被 processTurnEnd 清掉的状态字段。
    this.starGods = (charData.starGods||[]).filter(id=>STAR_GODS[id]);
    this.starAtkPct = 0;
    this.starCritChance = 0;
    this.starDodgeChance = 0;
    this.starBlockChance = 0;
    this.starBlockValue = 0.5;      // 格挡触发时的减伤比例，【格挡】固定 50%
    for(const gid of this.starGods){
      const a = (STAR_GODS[gid]||{}).apply || {};
      if(a.energy)      this.currentEnergy    += a.energy;
      if(a.atkPct)      this.starAtkPct       += a.atkPct;
      if(a.critChance)  this.starCritChance   += a.critChance;
      if(a.dodgeChance) this.starDodgeChance  += a.dodgeChance;
      if(a.blockChance){
        this.starBlockChance += a.blockChance;
        this.starBlockValue = Math.max(this.starBlockValue, a.blockValue||0.5);
      }
    }
    // 气势不能越过上限（塞满 4 个气势星神会算到 250，得削回 maxEnergy）
    this.currentEnergy = Math.min(this.currentEnergy, this.maxEnergy);
    // 本次出手是大招时记下「气势/100」的伤害倍率，普攻/被动固定为 1
    this._castEnergyMult = 1;
    // 资源型计数器（如龙魂）
    this.dragonSouls = 0;
    // 【免疫】剩余层数。>0 时挡下一次直接攻击伤害（【毁灭伤害】不在此列）。
    // 用独立计数器而不是 StatusEffect：它按「次数」消耗，跟回合数无关。
    this.immunityCharges = 0;
    // 【复活储备】剩余次数。带 useCharge 的【复活】词条每触发一次扣 1 层。
    // 阿瑞斯的「生命之王」开局发 2 层，诺亚的「时间之子」每个大回合补 1 层。
    this.reviveCharges = 0;
    // 【生命上限】累计加成比例（0.2 = +20%）。永久、不可驱散、不可净化，
    // 直接乘在 maxHp 上，所以按最大生命结算的效果（灼烧）也会跟着变高。
    this.maxHpBonusPct = 0;
    // 【气势免疫】标记（hero aura 一次性给的）：被置 true 后，所有【气势降低】命中该单位
    // 都直接落空。目前只有莉莉丝英雄技"大地赐福"会给草属性加这个标记。
    this.energyImmunity = false;
    // 【通灵点】：通灵师专属。队友每次出手（按出手次数累积）都给自己加，
    // 满 7 触发通灵变身（HP×2 / ATK×1.6 / 满血复活 / 1 连携）。
    this.spiritPoints = 0;
    // 标记通灵师是否已经通灵过一次（变身只能触发一次）
    this.spirited = false;
    // 通灵变身给的 ATK 加成倍率（1.0 = 不变；1.6 = 通灵后 +60% ATK）
    this.atkMult = 1;
    // 标记某些被动已触发过（once:true 复活/同类一次性触发）
    this._triggeredOnce = new Set();
    const byId = id => skills.find(s=>s.id===id) || null;
    this.normalAttack = byId(charData.normalAttackId);
    this.ultimate = byId(charData.ultimateId);
    // 【英雄】特殊职业专属：英雄技。战前统一结算的全队光环，走 _processHeroSkills
    this.heroSkill = byId(charData.heroSkillId);
    this.passives = (charData.passiveIds||[]).map(byId).filter(Boolean);
    if(!this.normalAttack)
      this.normalAttack = {id:"auto_attack",name:"普通攻击",triggerType:"NormalAttack",tags:[{type:"DamageMultiplier",value:1.0}]};
  }
  /** 战力估算（用于「敌方战力最低」选敌） */
  powerScore(){ return Math.trunc(this.effAtk*2 + this.currentHp + this.effDef + this.effSpd*30); }
  get column(){ return this.gridPosition % 3; }
  /** 最大生命 = 养成值 ×（1 + 【生命上限】加成） */
  get maxHp(){ return Math.trunc(this.stats.maxHp * (1 + this.maxHpBonusPct)); }
  /**
   * 叠加【生命上限】。涨上限的同时把涨出来的那部分血补上——
   * 不补的话会出现「开局血条只有 83%」的观感 bug（上限涨了、当前血没动）。
   */
  applyMaxHpBonus(ratio){
    const before = Math.trunc(this.stats.maxHp * (1 + this.maxHpBonusPct));
    this.maxHpBonusPct += ratio;
    const after = Math.trunc(this.stats.maxHp * (1 + this.maxHpBonusPct));
    const delta = after - before;
    if(delta>0 && this.isAlive) this.currentHp += delta;
    this.currentHp = Math.min(this.currentHp, this.maxHp);
    return delta;
  }
  /** 气势上限：基础 200 + 装备加成 */
  get maxEnergy(){ return MAX_ENERGY + this.gearMaxEnergy; }
  /**
   * 放大招需要的气势门槛。默认统一 100（100 只是门槛，不是上限）。
   * skills 里写了 costEnergy 才覆盖，energyCost 是老字段名，一起兼容。
   */
  get ultEnergyCost(){
    if(!this.ultimate) return 0;
    const v = this.ultimate.costEnergy ?? this.ultimate.energyCost;
    return (v!=null && v>0) ? v : ULT_ENERGY_COST;
  }
  /** 当前气势对应的大招伤害倍率（100 气势 = 1.0 倍）*/
  get energyDamageMult(){ return energyMultiplier(this.currentEnergy); }
  /** 是否被【控制】 */
  get isControlled(){ return this.hasStatus("Control"); }
  _mod(type){ let s=0; for(const se of this.statusEffects) if(se.type===type) s+=se.value; return s; }
  _sum(type){ return this._mod(type); }
  // 【攻击星神】的百分比加成走 starAtkPct：和攻↑/攻↓同一层相加，但不占状态位
  // atkMult 是通灵变身后的固定倍率（1.6），叠在最后一层，不受减益影响
  get effAtk(){ return this.stats.atk * (1 + this._mod("AtkUp") - this._mod("AtkDown") + (this.starAtkPct||0)) * (this.atkMult||1); }
  get effDef(){ return this.stats.def * (1 + this._mod("DefUp") - this._mod("DefDown")); }
  get effSpd(){ return this.stats.spd * (1 + this._mod("SpdUp") - this._mod("SpdDown")); }
  get totalShield(){ return this._sum("Shield"); }
  get totalDr(){ return Math.min(0.8, this._sum("DamageReduction")); }
  hasStatus(t){ return this.statusEffects.some(s=>s.type===t); }
  // 【控制】统一替代了旧版的眩晕/冰冻：被控时下一次攻击放空。
  // 若本该放大招，也一并放空，且不消耗气势（onTurnStart 里 canAct 判定在放技能之前）。
  get canAct(){ return this.isAlive && !this.hasStatus("Control"); }
  /** 通灵师判定：specialClass 是 spirit 且没通灵过 */
  isSpiritist(){ return this.isAlive && !this.spirited && this.data.specialClass==="spirit"; }

  /** 结算伤害。opts.true = 真伤（【毁灭伤害】）：无视减伤与护盾，直接扣血 */
  takeDamage(rawDamage, opts){
    const isTrue = !!(opts && opts.true);
    if(!isTrue){
      rawDamage *= (1 - this.totalDr);
      const shieldBefore = this.totalShield;
      if(shieldBefore > 0){
        // 与 C# 逐行对应：先算总吸收量，再逐层扣盾
        let absorbed = Math.min(shieldBefore, rawDamage);
        for(const se of this.statusEffects){
          if(se.type!=="Shield") continue;
          const can = Math.min(se.value, absorbed);
          se.value -= can; absorbed -= can;
          if(absorbed <= 0) break;
        }
        rawDamage -= Math.min(shieldBefore, rawDamage);
        this.statusEffects = this.statusEffects.filter(s=>!(s.type==="Shield" && s.value<=0));
      }
    }
    let damage = Math.max(1, Math.trunc(rawDamage));
    if(damage >= this.currentHp){
      damage = this.currentHp; this.currentHp = 0; this.isAlive = false;
    } else this.currentHp -= damage;
    return damage;
  }
  heal(amount){
    if(!this.isAlive) return 0;
    const actual = Math.min(amount, this.maxHp - this.currentHp);
    this.currentHp += actual;
    return actual;
  }
  addStatus(type,value,duration,source,meta){
    // 【控制】按次叠加：连吃两次"控制 1 回合"就是连着放空两次
    if(type==="Control"){
      const ex = this.statusEffects.find(s=>s.type==="Control");
      if(ex && ex.remainingTurns>0){ ex.remainingTurns += Math.max(1,duration); return; }
    }
    // 【禁疗】是永久标记型，重复获得不叠加（修尔平 a 命中后再吃大招也只算 1 条）。
    // 标志本身没有 duration，所以也走不到下面 processTurnEnd 的递减逻辑。
    if(type==="HealBlock"){
      const ex = this.statusEffects.find(s=>s.type==="HealBlock");
      if(ex) return;
      this.statusEffects.push(new StatusEffect(type,value,duration,source,meta));
      return;
    }
    // 【生息不止】是"有就行"的持续效果，不叠加——重复获得只刷新配置，否则阿瑞斯每开一次大
    // 就多挂一层，受击一次回几倍的命。
    const uniqueTypes = ["VitalityOnHurt"];
    if(uniqueTypes.includes(type)){
      const ex = this.statusEffects.find(s=>s.type===type);
      if(ex){ ex.value = value; ex.meta = meta || ex.meta; return; }
      this.statusEffects.push(new StatusEffect(type,value,duration,source,meta));
      return;
    }
    const refreshTypes = ["Taunt","AtkUp","AtkDown","DefUp","DefDown","SpdUp","SpdDown","DamageReduction","DodgeBoost","CritBoost","Stealth"];
    if(refreshTypes.includes(type)){
      const ex = this.statusEffects.find(s=>s.type===type);
      // remainingTurns<0 表示永久，不能被有限回合"刷新"成有限
      if(ex){
        const permanent = ex.remainingTurns<0 || duration<0;
        ex.remainingTurns = permanent ? -1 : Math.max(ex.remainingTurns, duration);
        ex.value = Math.max(ex.value, value);
      }
      else this.statusEffects.push(new StatusEffect(type,value,duration,source,meta));
    } else this.statusEffects.push(new StatusEffect(type,value,duration,source,meta)); // DoT / 控制可叠加
  }
  /**
   * 回合开始：只结算 DoT。
   * DoT（中毒/灼烧/流血）统一按【毁灭伤害】度量——无视防御、减伤和护盾，直接扣血。
   */
  processTurnStart(){
    if(!this.isAlive) return 0;
    let totalDot = 0;
    const dots = this.statusEffects.filter(s=>["Poison","Burn","Bleed"].includes(s.type));
    for(const d of dots){
      let dmg = d.type==="Burn" ? Math.trunc(this.maxHp*d.value) : Math.trunc(d.value);
      if(dmg>0){
        const a = this.takeDamage(dmg, {true:true});
        totalDot += a;
        this._logEvent("DotDamage", this, null, a,
          `${this.data.name} 受到【毁灭伤害】${a}（${STATUS_NAME[d.type]||d.type}持续效果）`);
      }
    }
    return totalDot;
  }
  /**
   * 回合结束：状态回合数在这里递减。
   * 必须放在回合结束而不是回合开始——否则 duration=1 的【控制】会在被控者自己的
   * 回合开始就被扣掉，等于完全没生效。
   * remainingTurns < 0 表示永久（例如【隐身】），不递减。
   */
  processTurnEnd(){
    if(!this.isAlive) return 0;
    for(const s of this.statusEffects){ if(s.remainingTurns>0) s.remainingTurns--; }
    const expired = this.statusEffects.filter(s=>s.remainingTurns===0);
    for(const e of expired){
      this.statusEffects.splice(this.statusEffects.indexOf(e),1);
      this._logEvent("StatusExpired", this, null, 0, `${this.data.name} 的 ${STATUS_NAME[e.type]||e.type} 效果消失`);
    }
    this.bonusCritChance = 0; this.bonusDodgeChance = 0;
    return 0;
  }
  cleanseDebuffs(){ this.statusEffects = this.statusEffects.filter(s=>!s.isDebuff); }
  dispelBuffs(){ this.statusEffects = this.statusEffects.filter(s=>!s.isBuff); }
  // 事件回调由 controller 注入
  _logEvent(){ if(this._onEvent) this._onEvent(...arguments); }
}

class BattleGrid{
  constructor(isPlayer){ this.slots = new Array(9).fill(null); this.isPlayerSide = isPlayer; }
  aliveUnits(){ return this.slots.filter(u=>u && u.isAlive); }
  /** 场上所有活着的通灵师（specialClass==='spirit' 且未通灵过的单位） */
  spiritists(){ return this.aliveUnits().filter(u => u.isSpiritist()); }
  /** 场上已通灵过的通灵师（仍在场上、可以继续战斗，只是不会再触发通灵） */
  spiritedOnes(){ return this.slots.filter(u => u && u.spirited); }
  get defeated(){ return this.slots.every(u=>!u || !u.isAlive); }
  columnFrontUnit(col){
    for(let row=0; row<3; row++){
      const u = this.slots[row*3+col];
      if(u && u.isAlive) return u;
    }
    return null;
  }
  rowUnits(rowIdx){
    const r=[]; for(let col=0; col<3; col++){ const u=this.slots[rowIdx*3+col]; if(u&&u.isAlive) r.push(u);} return r;
  }
  frontRow(){ return this.rowUnits(0); }
  middleRow(){ return this.rowUnits(1); }
  backRow(){ return this.rowUnits(2); }
  allUnits(){ return this.slots.filter(Boolean); }
  adjacentUnits(pos){
    const row = Math.trunc(pos/3), col = pos%3, r = [];
    const tryAdd = (p)=>{ const u=this.slots[p]; if(u&&u.isAlive) r.push(u); };
    if(row>0) tryAdd((row-1)*3+col);
    if(row<2) tryAdd((row+1)*3+col);
    if(col>0) tryAdd(row*3+col-1);
    if(col<2) tryAdd(row*3+col+1);
    return r;
  }
  /** 该阵的列优先级：前排 = 靠近对手的那一列。玩家在左（前排 col=2），敌方在右（前排 col=0） */
  get colOrder(){ return this.isPlayerSide ? [2,1,0] : [0,1,2]; }
  columnUnits(col){ const r=[]; for(let row=0;row<3;row++){ const u=this.slots[row*3+col]; if(u&&u.isAlive) r.push(u);} return r; }
  /** 按「距对手远近」取第 rank 列：0=前排 / 1=中排 / 2=后排 */
  columnByRank(rank){ return this.columnUnits(this.colOrder[Math.min(2,Math.max(0,rank))]); }
  /**
   * 可被选为攻击目标的单位。
   * 【隐身】单位在还有非隐身友军存活时，不进候选池；只有全队都隐身时才重新纳入。
   */
  targetableUnits(){
    const a = this.aliveUnits();
    const vis = a.filter(u=>!u.hasStatus("Stealth"));
    return vis.length ? vis : a;
  }
  /** 只保留非隐身单位（若全部隐身则原样返回，避免无目标可用） */
  _dropStealth(list){
    const vis = list.filter(u=>!u.hasStatus("Stealth"));
    return vis.length ? vis : list;
  }
  // 下面三个「取最值」都会再过滤一次存活：尸体 currentHp 归 0，一旦混进候选池
  // 就会成为「血量最低」，导致毁灭伤害/斩杀类词条打到已经死掉的单位上。
  lowestHpUnit(pool){ const a=(pool||this.aliveUnits()).filter(u=>u&&u.isAlive); return a.length? a.reduce((m,u)=>u.currentHp<m.currentHp?u:m) : null; }
  highestHpUnit(pool){ const a=(pool||this.aliveUnits()).filter(u=>u&&u.isAlive); return a.length? a.reduce((m,u)=>u.currentHp>m.currentHp?u:m) : null; }
  lowestPowerUnit(pool){ const a=(pool||this.aliveUnits()).filter(u=>u&&u.isAlive); return a.length? a.reduce((m,u)=>u.powerScore()<m.powerScore()?u:m) : null; }
  randomUnit(rng){ const a=this.aliveUnits(); return a.length? a[Math.floor(rng()*a.length)] : null; }
  findAttackTarget(fromColumn){
    // 旧版按"列优先"兜底（保留供 EnemyAdjacent 等使用）
    let t = this.columnFrontUnit(fromColumn);
    if(t) return t;
    const order = fromColumn===0?[1,2] : fromColumn===1?[0,2] : [1,0];
    for(const col of order){ t = this.columnFrontUnit(col); if(t) return t; }
    return null;
  }
  /**
   * 索敌优先级（横板布局）：
   *  1. 先在攻击者所在 row 上找，列按「前排 → 中排 → 后排」找活人
   *  2. 同 row 没人 → 找**离本行最近**的另一行（最底行 → 中排 → 顶行；顶行 → 中排 → 底行），
   *     中排则先看顶行再看底行。每行仍按前排 → 中排 → 后排。
   *  3. 都没人（只剩隐身单位）→ 兜底打血最少的那个
   */
  pickFrontTarget(fromRow){
    const colOrder = this.colOrder;
    // 按 |行差| 升序，等距时保持 0→1→2 的原始次序（Array.sort 稳定）
    const rowOrder = [0,1,2].sort((a,b)=>Math.abs(a-fromRow)-Math.abs(b-fromRow));
    for(const r of rowOrder){
      for(const c of colOrder){
        const u = this.slots[r*3+c];
        if(u && u.isAlive && !u.hasStatus("Stealth")) return u;
      }
    }
    // 全场只剩隐身单位：退化为打血最少的
    return this.lowestHpUnit(this.targetableUnits());
  }
  /**
   * 当前格子里有没有【嘲讽】单位（活人）。嘲讽的语义是「敌方只能打自己」，
   * 所以任何指向这个格子的攻击都得把目标改成嘲讽者本人（不管原本想打后排还是群攻）。
   */
  taunter(){
    return this.aliveUnits().find(u=>u.hasStatus("Taunt")) || null;
  }
}

function elementMultiplier(atk, def){
  if(atk==="None"||def==="None"||!atk||!def) return 1;
  if(atk===def) return 0.75;
  const table = {Fire:{Grass:1.5},Grass:{Water:1.5},Water:{Fire:1.5},Light:{Dark:1.3},Dark:{Light:1.3}};
  return (table[atk]&&table[atk][def]) || 1;
}

// ===== 气势（怒气）系统 =====
// 气势不是"顶到 100 就满了"：100 只是放大招的门槛，上限 200（装备还能再抬）。
// 开大时按「当前气势 / 100」放大伤害：175 气势开大 = 原本大招的 1.75 倍。
// 放完大招气势清零，所以攒得越满打得越疼；被控制住没放出大招则不消耗气势。
function gainEnergy(unit, amount){
  if(!unit.isAlive || amount===undefined || amount===null) return;
  unit.currentEnergy = Math.min(unit.maxEnergy, unit.currentEnergy + amount);
}
const BASE_ENERGY = 50;         // 开局气势
const ULT_ENERGY_COST = 100;    // 放大招的门槛（不是上限）
const MAX_ENERGY = 200;         // 气势上限，装备可通过 gearMaxEnergy 再往上抬
const ENERGY_BASIC_GAIN = 50;   // 普攻出手获得
const ENERGY_HIT_GAIN = 50;     // 被攻击获得
const ENERGY_PER_TURN = 0;      // 每回合自动获得（默认 0）
// 气势 → 大招伤害倍率：100 气势 = 1.0 倍，175 气势 = 1.75 倍
function energyMultiplier(energy){ return Math.max(1, energy / ULT_ENERGY_COST); }

// ===== 暴击系统 =====
// 所有角色自带基础暴击率 20%、暴击伤害 150%，在这之上再叠技能词条与装备
const BASE_CRIT_CHANCE = 0.20;
const BASE_CRIT_MULT   = 1.5;
// 装备预留位：unit.gearCritChance / gearCritMult / gearStartEnergy / gearMaxEnergy
//   以后加"加暴击率的装备"就写 gearCritChance，"开局满气势的装备"就写 gearStartEnergy

// ===== 阵营微调系数 =====
// 双方技能池不是同一套（默认演示阵容里我方是「坦+刺+勇+精灵+奶」，敌方是
// 「坦+法+祭+刺+勇」），光靠属性拉不平，所以给一个整体倍率把默认阵容的胜率
// 摁在 65% 上下。调整初始角色技能数值后必须重新标定这两个值，否则胜率会跑飞：
// 把敌方的「双群攻（圣光审判 + 地震波）」压下去之后，这套系数从 1.18/0.87 调到了下面这组。
const FACTION_PLAYER_MULT = 1.12;
const FACTION_ENEMY_MULT  = 0.93;

// ===== 状态名映射（战斗日志 / 状态徽章共用）=====
const STATUS_NAME = {
  Control:"【控制】", Stealth:"【隐身】", Poison:"中毒", Burn:"灼烧", Bleed:"流血",
  AtkUp:"攻击增益", AtkDown:"攻击减益", DefUp:"防御增益", DefDown:"防御减益",
  SpdUp:"速度增益", SpdDown:"速度减益", Taunt:"嘲讽", Shield:"护盾",
  DamageReduction:"减伤", DodgeBoost:"闪避加成", CritBoost:"暴击加成",
  VitalityOnHurt:"【生息不止】",
  HealBlock:"【禁疗】",
};
const STATUS_SHORT = {
  Control:"控", Stealth:"隐", Poison:"毒", Burn:"烧", Bleed:"血",
  AtkUp:"攻↑", AtkDown:"攻↓", DefUp:"防↑", DefDown:"防↓", SpdUp:"速↑", SpdDown:"速↓",
  Taunt:"嘲", DamageReduction:"减", DodgeBoost:"闪↑", CritBoost:"暴↑",
  VitalityOnHurt:"生息",
  HealBlock:"禁疗",
};
function statusShort(s){
  if(STATUS_SHORT[s.type]) return STATUS_SHORT[s.type];
  if(s.type==="Shield") return "盾"+Math.round(s.value);
  return s.type;
}

class BattleController{
  constructor(seed, recordEvents){
    this.rng = mulberry32(seed);
    this.record = recordEvents !== false;
    this.events = [];
    this.playerGrid = new BattleGrid(true);
    this.enemyGrid = new BattleGrid(false);
    this.maxRounds = 50;
    this.currentTurn = 0;
    this.triggeredDeathPassives = new Set();
    // 【群攻】并行动画组：同一组里的事件在回放时同时结算（一起扣血、一起飘字）。
    // 连击不加组，仍然逐击播放——这就是【群攻】与【连击】在表现上的区别。
    this._evGroup = null;
    this._groupSeq = 0;
    this._bindUnitLogging = this._bindUnitLogging.bind(this);
  }
  _bindUnitLogging(unit){
    unit._onEvent = (type, actor, target, value, text)=>{
      if(type==="DotDamage" || type==="StatusExpired"){
        // DoT / 状态到期由 unit 发出，补 target 语义
        this.addEvent(type, actor, null, value, text, {hpAfter:actor.currentHp});
      }
    };
  }
  addEvent(type, actor, target, value, text, extra){
    const ev = {type, actor, target, value, text, snap: this.record ? this.snapshot() : null, ...(extra||{})};
    // 群攻执行期间发出的所有事件（伤害/受击回势/死亡…）打上同一个并行动画组号
    if(this._evGroup != null && ev.parallel == null) ev.parallel = this._evGroup;
    this.events.push(ev);
    return ev;
  }
  snapshot(){
    const cap = g => g.slots.map(u=>{
      if(!u) return null;
      return {id:u.data.id, name:u.data.name, element:u.data.element, hp:u.currentHp, maxHp:u.maxHp,
        energy:u.currentEnergy, maxEnergy:u.maxEnergy, energyMult:u.energyDamageMult, alive:u.isAlive,
        charClass:u.data.charClass||null,
        specialClass:u.data.specialClass||null,
        // 资源型词条的计数器（目前只有龙魂），>0 时战斗界面会显示徽章
        dragonSouls:u.dragonSouls||0,
        // 【免疫】剩余层数：>0 时战斗界面显示蓝色「免N」徽章
        immunityCharges:u.immunityCharges||0,
        // 【复活储备】层数：>0 时显示绿色「生N」徽章，一眼看出还能死几次
        reviveCharges:u.reviveCharges||0,
        stealth:u.hasStatus("Stealth"), controlled:u.hasStatus("Control"),
        statuses:u.statusEffects.map(s=>({type:s.type,value:s.value,turns:s.remainingTurns})),
        ultCost: u.ultimate ? (u.ultimate.costEnergy ?? u.ultimate.energyCost ?? ULT_ENERGY_COST) : null};
    });
    return {player:cap(this.playerGrid), enemy:cap(this.enemyGrid)};
  }
  initialize(playerTeam, enemyTeam){
    this._placeTeam(playerTeam, this.playerGrid, true);
    this._placeTeam(enemyTeam, this.enemyGrid, false);
    this.addEvent("BattleStart", null, null, 0, "=== 战斗开始 ===");
  }
  _placeTeam(team, grid, isPlayer){
    for(let i=0;i<9;i++){
      const cid = team.positions[i];
      if(!cid) continue;
      const cd = CHARS.find(c=>c.id===cid);
      if(!cd) continue;
      const unit = new BattleUnit(cd, statsAt(cid, GROWTH_LEVELS[cid]||50), i, isPlayer, SKILLS);
      this._bindUnitLogging(unit);
      grid.slots[i] = unit;
    }
  }
  run(){
    // 【英雄】英雄技排在最前。它给的是全队起点加成（生命上限 / 免疫），
    // 放在「战斗开始」之后会跟开场的 OnBattleStart 被动抢顺序，也容易漏掉开局血量的补足。
    this._processHeroSkills();
    // 战斗开始钩子：触发 OnBattleStart 被动（如 DragonSoulInit 叠 N 个龙魂）
    this._processBattleStartPassives();
    for(let round=1; round<=this.maxRounds; round++){
      this.currentRound = round;
      // 大回合开场被动（OnRoundStart）：在出手序计算之前结算，跟谁先手无关。
      // 诺亚的「时间之子」就挂在这里——每回合回满血 + 补一层复活储备。
      this._processRoundStartPassives();
      if(this._checkEnd()) return this._result();
      const order = this._turnOrder();
      const seqText = order.filter(u=>u.isAlive).map(u=>`${u.isPlayerSide?"P":"E"}${u.data.name}(格${u.gridPosition})`).join(" → ");
      this.addEvent("Round", null, null, 0, `--- 第 ${round} 回合 ---\n出手序: ${seqText}`, {round, seqText});
      for(const unit of order){
        if(!unit.isAlive) continue;
        if(this._checkEnd()) return this._result();
        this.currentTurn++;
        this._processTurn(unit);
        if(this._checkEnd()) return this._result();
      }
    }
    return this._result();
  }
  /**
   * 出手顺序：**按列推进**，一列从上扫到下，再换下一列。
   * - 左阵（玩家）：列序 右→中→左（前排先动），列内行序 上→中→下。位置序号：
   *     右列：0→(0,2)右上  1→(1,2)右中  2→(2,2)右下
   *     中列：3→(0,1)中上  4→(1,1)中中  5→(2,1)中下
   *     左列：6→(0,0)左上  7→(1,0)左中  8→(2,0)左下
   * - 右阵（敌人）左右镜像：列序 左→中→右（同样是"靠近对手那列先动"），列内行序同上。
   * - 每回合开始，比较两阵活着的全员 SPD 总和，高者出 1 号位
   * - 同阵内部按 0→1→…→8 推进；死/空格天然跳过
   *
   * 注意别写成"按行推进"——那样会把右上→左上→右上扫成一条横线，
   * 第一列（前排）的三个人反而被拆散到三个不同的批次里。
   */
  _turnOrder(){
    const playerSeq = this._snakeOrder(true);
    const enemySeq = this._snakeOrder(false);
    if(playerSeq.length===0) return enemySeq;
    if(enemySeq.length===0) return playerSeq;
    const playerSpd = playerSeq.reduce((a,u)=>a+u.effSpd, 0);
    const enemySpd = enemySeq.reduce((a,u)=>a+u.effSpd, 0);
    const merged = [];
    let pi=0, ei=0;
    while(pi<playerSeq.length || ei<enemySeq.length){
      const p = playerSeq[pi], e = enemySeq[ei];
      // 顶部选手：本阵全员 SPD 总和更高者优先出动 1 号位
      // 之后两边交替按各自的列序顺序取出
      if(p && !e){ merged.push(p); pi++; continue; }
      if(e && !p){ merged.push(e); ei++; continue; }
      if(!p && !e) break;
      // 顶部权：第一回合每方先出第一位（由最高 SPD 阵决定顺序），
      // 此后按"轮到谁"严格交替：上一动是玩家就下一动是敌人（反之亦然）
      const lastSide = merged.length ? merged[merged.length-1].isPlayerSide : null;
      if(lastSide===null){
        // 首发：SPD 总和更高者出 1 号位
        if(playerSpd >= enemySpd){ merged.push(p); pi++; } else { merged.push(e); ei++; }
      } else if(lastSide===true){
        merged.push(e); ei++;
      } else {
        merged.push(p); pi++;
      }
    }
    // 标记出手位（用于 UI 高亮）
    this.lastOrder = merged;
    return merged;
  }
  _snakeOrder(isPlayer){
    const g = isPlayer ? this.playerGrid : this.enemyGrid;
    // 列序：玩家 右→中→左（2→1→0，前排先动）；敌方镜像 左→中→右（0→1→2）
    // 每一列内部：行序 上→中→下（0→1→2）
    const colOrder = isPlayer ? [2,1,0] : [0,1,2];
    const seq = [];
    for(const col of colOrder){
      for(let row=0; row<3; row++){
        const pos = row*3 + col;
        const u = g.slots[pos];
        if(u && u.isAlive) seq.push(u);
      }
    }
    return seq;
  }
  _processTurn(unit){
    this.addEvent("TurnStart", unit, null, 0, `${unit.data.name} 的回合 (HP:${unit.currentHp}/${unit.maxHp} 气势:${Math.round(unit.currentEnergy)}/${unit.maxEnergy})`, {actingPos: unit.gridPosition, actingSide: unit.isPlayerSide?'player':'enemy'});
    try{
      // 1. DoT 结算（按【毁灭伤害】度量）
      unit.processTurnStart();
      if(!unit.isAlive){
        this.addEvent("Death", null, unit, 0, `${unit.data.name} 因持续伤害倒下！`);
        this._processDeathPassives();     // 可能被复活类被动救回来
        if(!unit.isAlive) return;
        this.addEvent("Info", unit, null, 0, `  ${unit.data.name} 被复活，继续本回合行动`);
      }
      // 2. 回合开始被动
      for(const p of unit.passives){
        if(p.triggerType!=="OnTurnStart") continue;
        if(this.rng() > (p.passiveTriggerChance??1)) continue;
        this.addEvent("Passive", unit, null, 0, `${unit.data.name} 触发被动：${p.name}`);
        this.executeSkill(unit, p);
      }
      // 3. 能否行动（被【控制】时直接放空，气势不动）
      if(!unit.canAct){
        this.addEvent("Info", unit, null, 0, `  ${unit.data.name} 处于【控制】状态，本次出手放空${unit.currentEnergy>=unit.ultEnergyCost?"（本该放的大招没放出来，气势不消耗）":""}`);
        return;
      }
      // 4. 选技能：气势 ≥ 门槛（默认 100）则放大招，否则普攻
      const cost = unit.ultEnergyCost;
      const canUlt = unit.ultimate && cost > 0 && unit.currentEnergy >= cost;
      const skill = canUlt ? unit.ultimate : unit.normalAttack;
      if(!skill) return;
      if(canUlt){
        // 气势越高，大招越强：伤害倍率 = 当前气势 / 100（175 气势 = 1.75 倍）
        const energyAtCast = unit.currentEnergy;
        const mult = energyMultiplier(energyAtCast);
        unit.currentEnergy = 0;
        unit._castEnergyMult = mult;
        this.addEvent("UltimateUsed", unit, null, Math.trunc(energyAtCast),
          `【大招】${unit.data.name} 释放 ${skill.name}！气势 ${Math.round(energyAtCast)} → 伤害 ×${mult.toFixed(2)}（气势清零）`);
      }
      // 5. 执行
      this.executeSkill(unit, skill);
      unit._castEnergyMult = 1;
      // 6. 普攻回气势
      if(skill.triggerType==="NormalAttack"){
        gainEnergy(unit, ENERGY_BASIC_GAIN);
        this.addEvent("EnergyGain", unit, null, ENERGY_BASIC_GAIN, `  ${unit.data.name} 普攻回势 +${ENERGY_BASIC_GAIN}（当前 ${Math.round(unit.currentEnergy)}）`);
      }
      // 6.5 队友出手后被动：caster 一方活体中，所有 OnAllyActed 触发器检查并尝试触发
      if(unit.isAlive){
        this._processAllyActedPassives(unit);
      }
      // 7. 死亡被动
      this._processDeathPassives();
    } finally {
      // 8. 回合结束：状态回合数在这里递减（控制按「次数」生效，不能被提前扣掉）
      if(unit.isAlive) unit.processTurnEnd();
    }
  }
  /** 队友出手后，遍历 caster 一方活体的 OnAllyActed 被动并尝试触发 */
  _processAllyActedPassives(actor){
    const grid = actor.isPlayerSide ? this.playerGrid : this.enemyGrid;
    const defGrid = actor.isPlayerSide ? this.enemyGrid : this.playerGrid;
    for(const unit of grid.allUnits()){
      // 注意：这里**不排除 actor 自己**。秩序龙尊放大招 → 补龙魂 → 自己的龙魂追击
      // 也该跟出来，限定「不能享受自己的出手」会让自家开大后白攒一轮龙魂。
      // 不会递归：下面走的是 executeSkill，而 executeSkill 不回调本函数。
      if(!unit.isAlive) continue;          // 死亡不触发
      for(const p of unit.passives||[]){
        if(p.triggerType !== "OnAllyActed") continue;
        if(this.rng() > (p.passiveTriggerChance??1)) continue;
        // 龙魂为 0：整条被动静默跳过，连「触发被动」的报幕都不发（报了也是空放，只会刷屏）
        if((p.tags||[]).some(t=>t.type==="DragonSoulAllyRetaliate") && (unit.dragonSouls||0)<=0) continue;
        this.addEvent("Passive", unit, null, 0, `${unit.data.name} 触发被动：${p.name}`);
        // 复用 executeSkill，确保龙魂反击注入（同 DragonSoulAllyRetaliate tag）
        this.executeSkill(unit, p);
      }
    }
  }
  /**
   * 每回合开始时被动（OnRoundStart）。
   *
   * 和 OnTurnStart 的区别：OnTurnStart 是「轮到自己了」才跑，一个单位一回合只有一次；
   * OnRoundStart 是整个大回合的开场，跟出手顺序无关，用来做「每回合固定结算一次」的东西
   * ——诺亚的「时间之子」就靠它：每个大回合开场看一眼自己是死是活，死了就满血复活、
   * 活着就回满血。没有这条，诺亚在别人回合里被打死就真的没了。
   *
   * 死人也跑：靠的就是上面那句「死了捞回来」。所以这里只对「带自我复活的那条技能」放行死人，
   * 其余技能死人一律跳过
   * ——不然一个死人身上别的开场被动也会跑一遍，伤害词条拿尸体属性开打，纯烂账。
   */
  _processRoundStartPassives(){
    for(const grid of [this.playerGrid, this.enemyGrid]){
      for(const unit of grid.allUnits()){
        if(!unit) continue;
        for(const p of unit.passives||[]){
          if(p.triggerType !== "OnRoundStart") continue;
          // 「从第 N 个大回合起才生效」（fromRound，默认 1）。诺亚的「时间之子」写 fromRound:2：
          // 进场也就是第一大回合开场时，他是满血活人，这时候发【复活储备】既没用、
          // 又等于白送一条命 —— 第一个大回合不算数，从第二大回合开场才开始每回合充能。
          if(this.currentRound < (p.fromRound||1)) continue;
          const selfRevive = (p.tags||[]).some(t=>t.type==="Revive" && (t.target||"Self")==="Self");
          if(!unit.isAlive && !selfRevive) continue;
          if(this.rng() > (p.passiveTriggerChance??1)) continue;
          this.addEvent("Passive", unit, null, 0, `${unit.data.name} 触发回合开始被动：${p.name}`);
          this.executeSkill(unit, p);
        }
      }
    }
  }
  /**
   * 受击后触发（目前只有阿瑞斯的【生息不止】）。
   *
   * 刻意读受害者身上的**状态**而不是扫被动列表：【生息不止】是阿瑞斯大招挂上去的效果，
   * 不是天生被动——大招还没放出来的那几回合挨打本来就不该回血。
   * 钩子挂在 _processAttack 里、只有 actual>0（真的掉了血）时才调，闪避/免疫/被护盾吃光都不算。
   */
  _processOnDamagedPassives(victim, attacker){
    if(!victim || !victim.isAlive) return;
    const se = victim.statusEffects.find(s=>s.type==="VitalityOnHurt");
    if(!se) return;
    // ① 每次受到伤害回复最大生命的 value 比例（value=0.4 → 回 40%）
    const heal = Math.trunc(victim.maxHp * (se.value||0));
    const h = victim.heal(heal);
    if(h>0) this.addEvent("Heal", victim, victim, h, `  【生息不止】${victim.data.name} 回复 ${h} HP`);
    // ② 受击计数，满 hits 次 → 同横排攻击力最高的存活单位获得【连携】
    const need = (se.meta && se.meta.hits) || 3;
    victim._vitalityHits = (victim._vitalityHits||0) + 1;
    if(victim._vitalityHits < need) return;
    victim._vitalityHits = 0;
    const grid = victim.isPlayerSide ? this.playerGrid : this.enemyGrid;
    const row = Math.trunc(victim.gridPosition/3);
    // 「横排」= 视觉上的同一行，即 pos/3 相同；空位和尸体天然不在 aliveUnits 里
    const mates = grid.aliveUnits().filter(u=>Math.trunc(u.gridPosition/3)===row);
    if(!mates.length) return;
    const best = mates.reduce((m,u)=>u.effAtk>m.effAtk?u:m);
    this.addEvent("Info", victim, null, 0,
      `  【生息不止】${victim.data.name} 受击满 ${need} 次 → 同排攻击最高的 ${best.data.name} 获得【连携】`);
    this._grantChain(best, 1);
  }
  /**
   * 【英雄】特殊职业的英雄技：进入战斗前统一结算。
   * 和普通被动的区别在于它是「有条件的一次性光环」——条件不满足整条技能作废，
   * 而普通被动是抽概率、无论条件如何都在场。
   */
  _processHeroSkills(){
    const pref = this._heroPreferredBySide || {player:null, enemy:null};
    for(const grid of [this.playerGrid, this.enemyGrid]){
      // 【多于 1 选一个】：如果本阵营有 ≥1 个英雄，但 Battle.enter 还没指定主角，
      // 默认选第一个（让日常透明）；指定了就只跑那一个。
      const heroes = grid.allUnits().filter(u=>u && u.isAlive && u.heroSkill);
      if(heroes.length===0) continue;
      const w = grid.isPlayerSide ? 'player' : 'enemy';
      const keep = heroes.find(u=>u.data.id===pref[w]) || heroes[0];
      if(keep.data.id !== (pref[w] || heroes[0].data.id)){
        // 默认选了 heroes[0] 时写回 pref，避免其他子系统仍把它当作"未指定"
        if(!pref[w]) pref[w] = heroes[0].data.id;
      }
      const unit = keep;
      if(!unit || !unit.isAlive || !unit.heroSkill) continue;
      const skill = unit.heroSkill;
      const cond = (skill.tags||[]).find(t=>t.type==="AuraCondition");
      // 条件判定要先于技能发动输出日志，不然日志顺序读起来像「先发动又反悔」
      if(cond && !this._checkAuraCondition(unit, cond)) continue;
      this.addEvent("HeroSkill", unit, null, 0, `【英雄技】${unit.data.name} 发动「${skill.name}」`);
      // 走 executeSkill 复用统一管线：这样【生命上限】【免疫】等词条不用在这里重写一遍
      const tags = (skill.tags||[]).filter(t=>t.type!=="AuraCondition");
      this.executeSkill(unit, {...skill, tags});
    }
  }
  /** 英雄技触发条件：己阵里指定属性的角色数量 ≥ value（只数存活单位）*/
  _checkAuraCondition(unit, cond){
    const grid = unit.isPlayerSide ? this.playerGrid : this.enemyGrid;
    const els = cond.elements || [];
    const need = Math.trunc(cond.value||0);
    const n = grid.aliveUnits().filter(u=>els.includes(u.data.element)).length;
    const ok = n >= need;
    const elName = els.map(e=>(ELEMENTS[e]||{}).n||e).join("/");
    this.addEvent("Info", unit, null, n, ok
      ? `  【英雄条件】己阵 ${elName} 属性 ${n} 人，满足（需要 ≥${need}）`
      : `  【英雄条件】己阵 ${elName} 属性只有 ${n} 人，不足 ${need} 人 → 英雄技作废`);
    return ok;
  }
  _processDeathPassives(){
    const all = [...this.playerGrid.allUnits(), ...this.enemyGrid.allUnits()];
    for(const unit of all){
      if(unit.isAlive) continue;
      // 按「单位 + 被动」记账：同一被动技能被多个角色共用时，每人各自能触发一次
      if(!unit._deathFired) unit._deathFired = new Set();
      for(const p of unit.passives){
        if(p.triggerType!=="OnDeath") continue;
        // 按【复活储备】消耗的复活（阿瑞斯的「生命之王」）不走一次性记账：
        // 储备是耗材，没储备就自然触发不了、下回合补上了又该能用，
        // 所以这里只查储备够不够，不写 _deathFired，也不被它拦住。
        const chargeRevive = (p.tags||[]).find(t=>t.type==="Revive" && t.useCharge);
        if(chargeRevive){
          if((unit.reviveCharges||0) <= 0) continue;
        } else {
          if(unit._deathFired.has(p.id)) continue;
          unit._deathFired.add(p.id);
        }
        this.addEvent("Passive", unit, null, 0, `${unit.data.name} 死亡触发：${p.name}`);
        this.executeSkill(unit, p);
      }
    }
  }
  _checkEnd(){ return this.playerGrid.defeated || this.enemyGrid.defeated; }
  /** 战斗开始被动：触发所有 OnBattleStart 触发器（如 DragonSoulInit 叠龙魂） */
  _processBattleStartPassives(){
    for(const grid of [this.playerGrid, this.enemyGrid]){
      for(const unit of grid.allUnits()){
        if(!unit || !unit.isAlive) continue;
        for(const p of unit.passives||[]){
          if(p.triggerType !== "OnBattleStart") continue;
          if(this.rng() > (p.passiveTriggerChance??1)) continue;
          this.addEvent("Passive", unit, null, 0, `${unit.data.name} 触发开场被动：${p.name}`);
          this.executeSkill(unit, p);
        }
      }
    }
  }
  _result(){
    const playerWon = this.enemyGrid.defeated && !this.playerGrid.defeated;
    const survivors = playerWon ? this.playerGrid.aliveUnits() : this.enemyGrid.aliveUnits();
    const summary = playerWon ? `🏆 玩家胜利！${this.currentRound}回合，存活${survivors.length}人` : `💀 玩家失败...${this.currentRound}回合`;
    this.addEvent("BattleEnd", null, null, 0, summary, {playerWon});
    return {playerWon, rounds:this.currentRound, survivors:survivors.length, summary};
  }

  /* ============ 技能执行（与 C# SkillExecutor 对应）============ */
  executeSkill(caster, skill){
    this.addEvent("SkillUsed", caster, null, 0, `${caster.data.name} 使用了 ${skill.name}`);
    // dmgMult/targetType 现在支持多个（同一技能多个 DamageMultiplier tag 可选不同目标）
    // 数组中每项：{mult, target, repeat}（repeat 由【Repeat】词条填入，>1 表示同 target 多打几下）
    const dmgHits = [];           // {mult, target, repeat}
    const trueDmgHits = [];       // {mult, target}：真实伤害，含 TrueDamage 与【毁灭伤害】
    let comboCount=1, critChance=0, critMult=1.5, piercePct=0,
        splashPct=0, followUpChance=0, lifestealPct=0, energyDrain=0, multiTargetCount=0;
    const onHitDebuffs=[], selfBuffs=[], supportTags=[];
    for(const tag of skill.tags||[]){
      switch(tag.type){
        case "DamageMultiplier":
          dmgHits.push({mult:tag.value, target:tag.target||"CurrentTarget"});
          break;
        // 真实伤害统一到 trueDmgHits，走 takeDamage(raw,{true:true})，无视减伤/护盾
        case "TrueDamage":
        case "DestructionDamage":
          trueDmgHits.push({mult:tag.value, target:tag.target||"CurrentTarget"});
          break;
        // 【群攻】*n：把上面的伤害倍率随机打给敌方 n 个目标（只影响 DamageMultiplier 那组）
        case "MultiTarget": multiTargetCount=Math.max(1,Math.trunc(tag.value||1)); break;
        case "Combo": comboCount=Math.max(1,Math.trunc(tag.value||1)); break;
        // 【Repeat】：让"上一个 dmgHit"对同一个 target 多打几下。语义是「连续释放 N 次」，
        // 比如昆仑平 a：[{DamageMultiplier 200%}, {Repeat 2}] → 当前目标挨 2 下 200%。
        // 一个技能通常只挂一个 Repeat tag；如果技能里有多个 dmgHit，Repeat 绑定到最后一个
        // 上（符合玩家直觉：先写目标、再写重复）。
        // 创界破军（昆仑被动）等动态 +1 不通过 Repeat 词条走，而是在 executeSkill 末尾
        // 直接给 dmgHit.repeat 累加，避免和静态 Repeat 冲突。
        case "Repeat": {
          const n = Math.max(1, Math.trunc(tag.value||1));
          const lastDmg = dmgHits[dmgHits.length-1];
          if(lastDmg) lastDmg.repeat = n;
          else dmgHits.push({mult:1, target:tag.target||"CurrentTarget", repeat:n});
          break;
        }
        case "Crit": critChance=tag.chance||0; critMult=tag.value>0?tag.value:1.5; break;
        case "Pierce": piercePct=tag.value; break;
        case "Splash": splashPct=tag.value; break;
        case "FollowUp": followUpChance=tag.chance||0; break;
        case "Lifesteal": lifestealPct=tag.value; break;
        case "EnergyDrain": energyDrain=tag.value; break;
        case "Stun": case "Freeze": case "Control": case "Poison": case "Burn": case "Bleed":
        case "AtkDown": case "DefDown": case "SpdDown":
        case "HealBlock":
          onHitDebuffs.push(tag); break;
        // 【嘲讽】按设计意图就是「施法者吸引火力」，落点永远是 caster 自己。
        // 旧实现把它归到 onHitDebuffs 会贴到被攻击的目标脸上（打自己一巴掌给对方挂嘲讽），
        // 这里按"自增益"路径走（_applySelfBuff 内部会按 tag.target=Self 解析回施法者）。
        case "Taunt":
          selfBuffs.push(tag); break;
        case "AtkUp": case "DefUp": case "SpdUp": case "Shield": case "DamageReduction":
          selfBuffs.push(tag); break;
        // 【暴击/闪避加成】是"本次技能"性的临时累加：直接抬高 caster.bonus*Chance，
        // **不入 status 系统**。如果走 status 会有两个坑：
        //   (1) duration=0 立刻过期，加不上去；
        //   (2) 走 refreshTypes 的 Math.max 逻辑会拿旧值跟新值取大，
        // 两次连击叠加反而只算最大那次。
        // 这里只用 processTurnEnd 自然清零即可（每回合结束 bonus*Chance 归零）。
        case "CritBoost":  caster.bonusCritChance += (tag.value||0); break;
        case "DodgeBoost": caster.bonusDodgeChance += (tag.value||0); break;
        // 【隐身】必须排在 Revive 之后应用：Revive 会把 statusEffects 清空，
        // 放在 selfBuffs 里会被复活顺手清掉，所以归到 supportTags 里按声明顺序执行。
        case "Heal": case "Revive": case "Cleanse": case "Dispel": case "EnergyGain": case "Stealth":
        // 【免疫】与【生命上限】也是「给目标挂东西」，一起走支援管线
        case "Immunity": case "MaxHpUp":
        // 【比例治疗】按最大生命回血；【复活储备】发复活次数；【生息不止】挂受击回血效果
        // 【连携】给目标一个立刻出手的回合——它可能跟在【复活】后面（诺亚「被复活就出动」），
        // 所以一起进 supportTags，靠声明顺序保证「先复活、再连携」。
        case "HealPct": case "ReviveCharge": case "VitalityOnHurt": case "Chain":
          supportTags.push(tag); break;
        // 【气势降低】即时扣目标气势（不在 status 系统里，就是一次效果）。
        // 负 value 是常用形态（如修尔"是非之魔"开场敌方同横排 -20）。
        // 草属性单位在大地赐福激活时免疫此效果（见 _execSupport 的 EnergyImmunity 分支）。
        case "EnergyDown":
        // 【气势免疫】标记（布尔型）：hero aura 给的「整场免疫气势降低」buff，
        // 单独 case 处理，给单位打上 energyImmunity 标志供 EnergyDown 跳过
        case "EnergyImmunity":
          supportTags.push(tag); break;
        // 资源型词条（龙魂）：不参与普通管线，在 _execResourceTags 中处理
        case "DragonSoulInit":
        case "DragonSoulRefillOnUlt":
        case "DragonSoulAllyRetaliate":
          supportTags.push(tag); break;
      }
    }
    // 资源型词条处理（龙魂初始/补充/反击挂钩）
    this._execResourceTags(caster, skill, supportTags);
    // 【创界破军】（昆仑专属）：己方存活 < 敌方存活时，给本次技能所有 dmgHit.repeat 各 +1。
    // 放在 _execDamage 之前，让 _execDamage 看到 repeat 已经 +1 的 dmgHits。
    if(caster.data.id==="char_kunlun" && this._isAllyOutnumbered(caster)){
      for(const d of dmgHits){
        d.repeat = (d.repeat||1) + 1;
      }
      this.addEvent("Info", caster, null, 0,
        `  【创界破军】己方人数劣势，昆仑本次连击次数 +1`);
    }
    if(dmgHits.length>0 || trueDmgHits.length>0){
      this._execDamage(caster, dmgHits, trueDmgHits, comboCount, critChance, critMult,
        piercePct, splashPct, followUpChance, onHitDebuffs, lifestealPct, energyDrain, multiTargetCount);
    }
    for(const b of selfBuffs) this._applySelfBuff(caster, b);
    for(const s of supportTags) this._execSupport(caster, s, skill);
    // 英雄光环"大地赐福"激活时：草属性角色每次放大招后回满气势。
    // 判定条件：caster 是草属性 + 大招 + 大地赐福激活（energyImmunity 是 aura 留下的标志）。
    // 必须放在 selfBuffs/supportTags 之后，否则被【气势吸取】先抽走再回满会变成"白吸"。
    if(skill.triggerType==="Ultimate" && caster.data.element==="Grass" && caster.energyImmunity){
      const before = caster.currentEnergy;
      caster.currentEnergy = caster.maxEnergy;
      if(caster.currentEnergy > before){
        this.addEvent("EnergyGain", caster, null, caster.currentEnergy - before,
          `  ${caster.data.name} 【大地赐福】释放大招后回满气势（${Math.round(before)} → ${Math.round(caster.currentEnergy)}）`);
      }
    }
    // 通灵师系统：caster 出手后给本阵营所有通灵师加通灵点（点数 = 本回合攻击次数，含 Repeat）。
    // 满 7 立刻触发变身。同一阵营只允许一位通灵师触发，多人满时把决定权抛给 UI（_pickSpiritist）。
    // 单通灵师场景默认就自动选，多人弹框由 ui-battle.js 接管（见 _spiritCandidates）。
    this._processSpiritPoints(caster, this._countSkillHits(skill, dmgHits));
  }
  _execDamage(caster, dmgHits, trueDmgHits, comboCount, critChance, critMult,
              piercePct, splashPct, followUpChance, onHitDebuffs, lifestealPct, energyDrain, multiTargetCount){
    const attackerGrid = caster.isPlayerSide ? this.playerGrid : this.enemyGrid;
    const defenderGrid = caster.isPlayerSide ? this.enemyGrid : this.playerGrid;
    // 技能本体只执行一次。**不要**在这里按 comboCount 循环重打同一份 dmgHits：
    // 【连击】的语义是"再给一个出手回合"，不是"同一个技能多打几下"——
    // 额外回合要按当时气势重新决定放大招还是平a，见 _processComboExtraTurns。
    body: {
      // 对每一组 (mult, target) 解析为多个目标；
      // 对同一 target 同一轮只打一次（去重），最后一个 mult + repeat 生效
      const seen = new Map();
      if(multiTargetCount>0){
        // 【群攻】*n：每击重新随机抽 n 个可攻击目标（隐身单位不在池子里）
        const picked = this._pickRandomTargets(defenderGrid.targetableUnits().filter(u=>u.isAlive), multiTargetCount);
        const mult = dmgHits.length ? dmgHits[dmgHits.length-1].mult : 1;
        for(const t of picked) seen.set(t, {mult, repeat:1});
        if(picked.length){
          this.addEvent("Info", caster, null, 0, `  【群攻】随机命中 ${picked.length} 个目标：${picked.map(t=>t.data.name).join("、")}`);
        }
      } else {
        for(const d of dmgHits){
          const tlist = this._resolveTargets(caster, d.target, attackerGrid, defenderGrid);
          for(const t of tlist){
            if(!t.isAlive) continue;
            if(!seen.has(t)) seen.set(t, {mult:d.mult, repeat:d.repeat||1});
            else { seen.get(t).mult = d.mult; seen.get(t).repeat = d.repeat||1; } // 后定义的覆盖
          }
        }
      }
      if(seen.size===0 && trueDmgHits.length===0) break body;
      // ---------- ① 普通伤害（合并去重后的目标）----------
      // 【群攻】开并行动画组：这一组的事件在回放里同帧结算，敌方一起掉血；
      // 非群攻（单体/连击/Repeat）不加组，仍是一个目标一条一条播。
      const isGroupAttack = multiTargetCount>0;
      if(isGroupAttack) this._evGroup = ++this._groupSeq;
      for(const [target, info] of seen){
        // 施法者可能在上一段里被反击打死了（死人不能继续出手），目标也可能已经死了
        // （例如群攻前面几段先把它打死、后面的溅射仍指向它）——两种情况都直接跳过
        if(!caster.isAlive) break;
        if(!target.isAlive) continue;
        // 【Repeat】同一个 target 打 repeat 次（昆仑平 a / 大招的「连续释放 N 次」）。
        // splash / 真伤只在最后一次打完后再结算，避免连击 3 下溅射 3 次把数据搞乱。
        const repeat = info.repeat||1;
        for(let r=0; r<repeat; r++){
          if(!caster.isAlive) break;
          if(!target.isAlive) break;
          this._processAttack(caster, target, info.mult, 0, critChance, critMult,
            piercePct, onHitDebuffs, lifestealPct, energyDrain);
        }
        if(splashPct>0 && target.isAlive){
          for(const adj of defenderGrid.adjacentUnits(target.gridPosition)){
            if(!adj.isAlive || adj.hasStatus("Stealth")) continue;
            const sd = this._processAttack(caster, adj, info.mult*splashPct, 0, 0, 1, 0, [], 0, 0);
            this.addEvent("Damage", caster, adj, sd, `  溅射命中 ${adj.data.name}，造成 ${sd} 伤害`);
          }
        }
      }
      if(isGroupAttack) this._evGroup = null;
      // ---------- ② 追击（在技能本体打完之后判定一次）----------
      if(followUpChance>0 && this.rng()<followUpChance){
        this.addEvent("FollowUp", caster, null, 0, `  ${caster.data.name} 触发追击！`);
        // 追击对每个 dmgHit.target 重新解析
        for(const d of dmgHits){
          for(const t of this._resolveTargets(caster, d.target, attackerGrid, defenderGrid)){
            if(!t.isAlive) continue;
            this._processAttack(caster, t, d.mult, 0, critChance, critMult, piercePct, onHitDebuffs, lifestealPct, energyDrain);
          }
        }
      }
      // ---------- ③ 真实伤害 / 【毁灭伤害】（最后结算）----------
      // 放在主体伤害之后有两个理由：
      //  1. 「立刻对敌方当前血量最低单位」的自然语义是**补刀**——先群攻削血，再对残血补一发；
      //     若先算真伤，挑中的是满血时的血最低值，跟玩家看到的结果对不上。
      //  2. 目标在真正开打的那一刻才解析，且强制只取**存活**单位，
      //     不会出现"毁灭伤害打在刚被群攻打死的尸体上"。
      // （伤害事件由 _processAttack 自己发，这里不再补一条，免得同一次伤害记两遍）
      for(const d of trueDmgHits){
        const tlist = this._resolveTargets(caster, d.target, attackerGrid, defenderGrid)
                        .filter(t=>t.isAlive);
        if(!tlist.length){
          this.addEvent("Info", caster, null, 0, `  【毁灭伤害】敌方已无存活单位，落空`);
          continue;
        }
        for(const t of tlist){
          if(!t.isAlive) continue;
          this._processAttack(caster, t, 0, d.mult, 0, 1, 0, [], 0, 0);
        }
      }
      // ---------- ④ 【连击】：额外出手回合 ----------
      // 放在最后，等本体的伤害/追击/真伤都结算完，额外回合才开打
      this._processComboExtraTurns(caster, comboCount-1);
    }
  }
  /**
   * 【连击】的额外出手回合。
   *
   * 语义：**再给一个出手回合**，不是"同一个技能多打几下"。
   * 每个额外回合按当时的气势重新决定这一下放什么：
   *   - 气势 ≥ 大招门槛 → 再放一次大招（照常吃气势倍率、气势清零）
   *   - 气势不够        → 自动执行一次平a，并按普攻规则回气势 +ENERGY_BASIC_GAIN
   * 所以「只有连击」时看到的就是「放完大招 → 气势 0 → 白送一次平a → 气势回到 50」；
   * 若额外回合开始前气势被补够（≥100），那一下会直接再放大招。
   *
   * 额外回合**不再派生额外回合**（`_comboDepth` 守卫）：否则"大招自带连击 → 额外回合
   * 又放出同一个大招 → 又带连击"会无限递归。
   */
  _processComboExtraTurns(caster, extra){
    if(!extra || extra<=0) return;
    if(!caster.isAlive) return;
    if(caster._comboDepth > 0) return;
    caster._comboDepth = (caster._comboDepth||0) + 1;
    try{
      for(let i=0; i<extra; i++){
        if(!caster.isAlive) break;
        if(this._checkEnd()) break;
        const cost = caster.ultEnergyCost;
        const canUlt = caster.ultimate && cost>0 && caster.currentEnergy >= cost;
        if(canUlt){
          const energyAtCast = caster.currentEnergy;
          const mult = energyMultiplier(energyAtCast);
          caster._castEnergyMult = mult;
          caster.currentEnergy = 0;
          this.addEvent("UltimateUsed", caster, null, Math.trunc(energyAtCast),
            `【连击】${caster.data.name} 额外出手，再放一次大招 ${caster.ultimate.name}！气势 ${Math.round(energyAtCast)} → 伤害 ×${mult.toFixed(2)}（气势清零）`);
          this.executeSkill(caster, caster.ultimate);
          caster._castEnergyMult = 1;
        } else {
          const na = caster.normalAttack;
          if(!na) break;
          this.addEvent("Info", caster, null, 0, `【连击】${caster.data.name} 额外出手（气势 ${Math.round(caster.currentEnergy)} 不够放 ${caster.ultimate?caster.ultimate.name:"大招"}），自动执行平a ${na.name}`);
          this.executeSkill(caster, na);
          // 额外回合放的是平a → 按普攻规则回气势（_processTurn 第 6 步只覆盖本体那一次）
          gainEnergy(caster, ENERGY_BASIC_GAIN);
          this.addEvent("EnergyGain", caster, null, ENERGY_BASIC_GAIN,
            `  ${caster.data.name} 平a回势 +${ENERGY_BASIC_GAIN}（当前 ${Math.round(caster.currentEnergy)}/${caster.maxEnergy}）`);
        }
      }
    } finally {
      caster._comboDepth -= 1;
    }
  }
  /**
   * 【连携】：让 unit **立刻**多打一个出手回合。
   *
   * 和【连击】的关系：两者最终都落到同一套「额外出手回合」逻辑上（按当时气势决定放大招
   * 还是平a，平a 回 50 气势，不再派生额外回合）。区别在**谁发起**——
   *   - 【连击】写在技能自己的词条里，施法者放完本体后自己接着打；
   *   - 【连携】由别的效果发出来（阿瑞斯受击满 3 次给同排最高攻队友、诺亚被复活时给自己），
   *     是"你被点名了，现在就动"。所以它落在目标身上，目标立刻出手。
   *
   * 复用 _processComboExtraTurns 而不是自己写一份，顺带白拿 _comboDepth 递归守卫：
   * 连携打出的额外回合里不会再触发链式连携，否则「连携 → 出手 → 又连携」能转死。
   */
  _grantChain(unit, turns){
    if(!unit || !unit.isAlive) return;
    const n = Math.max(1, Math.trunc(turns||1));
    this.addEvent("Chain", unit, null, n, `【连携】${unit.data.name} 立刻获得 ${n} 个出手回合`);
    this._processComboExtraTurns(unit, n);
  }

  /* ============ 通灵师系统 ============
   *  设计要点：
   *   1. 通灵点按"caster 单次出手的攻击次数"累加：Repeat N 的 dmgHit 给通灵师加 N 点
   *      （昆仑平 a 默认打 2 次 → 加 2 点；大招打 3 次 → 加 3 点；创界破军 +1 时再加 1）。
   *      这样昆仑自己也是给自己加（"自己单次出手内的攻击次数"），队友出手也按各自次数算。
   *   2. 满 7 自动触发变身：HP 上限 ×2 / ATK ×1.6 / 满血复活（无视禁疗）/ 1 次连携。
   *      同阵营只允许一位通灵师变身，多人满 7 时把"待选列表"抛给 UI（_spiritCandidates）。
   *      单通灵师场景自动选（_pickSpiritist 只返回一人）。
   *   3. 通灵点存在 BattleUnit.spiritPoints 字段（普通数字），不需要 StatusEffect。
   */

  /** 计数本次 executeSkill 实际"打"了几次（含 Repeat）。
   *  dmgHits 已经被创界破军修正过 repeat，所以这里直接读 dmgHit.repeat。 */
  _countSkillHits(skill, dmgHits){
    let total = 0;
    for(const d of dmgHits) total += (d.repeat||1);
    // 没 dmgHits 的（纯支援技能）按 1 次算（一次出手就 1 次），避免漏算
    if(total===0) total = 1;
    return total;
  }
  /** 自己阵营存活数 < 敌方阵营存活数（创界破军触发条件） */
  _isAllyOutnumbered(unit){
    const ally = unit.isPlayerSide ? this.playerGrid.aliveUnits().length : this.enemyGrid.aliveUnits().length;
    const foe  = unit.isPlayerSide ? this.enemyGrid.aliveUnits().length : this.playerGrid.aliveUnits().length;
    return ally < foe;
  }
  /** caster 出招后给本阵营所有通灵师加 hitCount 通灵点。满 7 的进入 _spiritCandidates。
   *  单候选自动变身；多候选写到一个待选池，由 ui-battle.js 弹框。
   *  【多于 1 选一个】：Battle.enter 时已经定好 `_spiritistPreferredBySide[side]`，
   *  这里只会给"主角通灵师"累加 spiritPoints。其他通灵师即使在场也当作"挂名"，
   *  spiritPoints 永远是 0，避免「同时满 7」的并发问题。  */
  _processSpiritPoints(caster, hitCount){
    if(hitCount<=0) return;
    const grid = caster.isPlayerSide ? this.playerGrid : this.enemyGrid;
    const spiritists = grid.spiritists();
    if(!spiritists.length) return;
    const w = caster.isPlayerSide ? 'player' : 'enemy';
    const pref = (this._spiritistPreferredBySide || {})[w];
    // 主角通灵师：只有 pref 指向的那个（或默认第一个）才累计 +1
    const main = pref ? spiritists.find(u=>u.data.id===pref) : spiritists[0];
    if(!main) return;
    this.addEvent("Info", caster, null, hitCount,
      `  ${caster.data.name} 出手 ${hitCount} 次 → 主角通灵师 ${main.data.name} 获得 ${hitCount} 通灵点`);
    main.spiritPoints = (main.spiritPoints||0) + hitCount;
    this.addEvent("Info", caster, main, main.spiritPoints,
      `  ${main.data.name} 通灵点 ${main.spiritPoints}/7`);
    if(main.spiritPoints >= 7){
      this._triggerSpiritTransform(main);
    }
  }
  /** 执行通灵变身：HP×2 / ATK×1.6 / 满血（无视禁疗） / 1 连携 */
  _triggerSpiritTransform(unit){
    if(!unit || !unit.isAlive || unit.spirited) return;
    unit.spirited = true;
    // HP 上限 ×2：maxHp 是派生 getter（stats.maxHp × (1 + maxHpBonusPct)），
    // 不能直接赋值。改走 applyMaxHpBonus(1.0) 在已有的 +0 基础上加 100%。
    // helper 内部会自动把涨出来的那部分血补上。
    const oldMax = unit.maxHp;
    unit.applyMaxHpBonus(1.0);
    // 满血复活（无视 HealBlock）：直接写 currentHp = maxHp，绕过 takeDamage / Heal 词条
    unit.currentHp = unit.maxHp;
    unit.isAlive = true;
    // ATK ×1.6（atkMult 是战斗里 _processAttack 用的乘数）
    unit.atkMult = 1.6;
    // 给 1 次连携（立刻多一次出手回合）
    this.addEvent("Info", unit, null, 0,
      `  【通灵】${unit.data.name} 通灵变身！HP ×2（${oldMax} → ${unit.maxHp}），ATK ×1.6，立刻满血 + 1 连携`);
    this._grantChain(unit, 1);
  }
  _processAttack(caster, target, dmgMult, trueDmg, critChance, critMult, piercePct, onHitDebuffs, lifestealPct, energyDrain){
    // 0. 尸体不吃伤害。目标可能在本技能的上一段（群攻/溅射/追击）就已经被打死了，
    //    不拦的话 takeDamage 会返回 0、并且再补一条重复的「被击败」事件。
    if(!target.isAlive) return 0;
    // 【毁灭伤害】/ 真实伤害的识别方式：只有 trueDmg 有值、普通倍率为 0
    const isTrueDamage = dmgMult===0 && trueDmg>0;
    // 1. 闪避（含被动与【闪避星神】）
    let dodgeChance = target.bonusDodgeChance + (target.starDodgeChance||0);
    for(const p of target.passives){
      if(p.triggerType!=="OnHit") continue;
      if(this.rng() > (p.passiveTriggerChance??1)) continue;
      for(const t of p.tags||[]) if(t.type==="Dodge") dodgeChance += t.chance;
    }
    if(dodgeChance>0 && this.rng()<dodgeChance){
      this.addEvent("Dodged", caster, target, 0, `  ${target.data.name} 闪避了攻击！`, {dodged:true});
      return 0;
    }
    // 1.5 【免疫】：挡下一次「直接攻击」。判定放在闪避之后，是因为闪避成功的那次
    //     根本不算命中——不该白白吃掉一层免疫。真实伤害（【毁灭伤害】）在下面
    //     用 isTrueDamage 判定直接绕过这里，所以毒伤/灼烧/毁灭伤害免疫挡不住。
    if(!isTrueDamage && target.immunityCharges>0){
      target.immunityCharges -= 1;
      this.addEvent("Immunity", caster, target, 0,
        `  ${target.data.name} 用【免疫】无效化了本次攻击！（剩余 ${target.immunityCharges} 层）`);
      return 0;
    }
    // 2. 基础伤害：倍率与真实伤害倍率都乘攻击力
    //    大招再按开大那一刻的气势放大：175 气势 = ×1.75（普攻/被动固定 ×1）
    const energyMult = caster._castEnergyMult || 1;
    let raw = caster.effAtk * (dmgMult + trueDmg) * energyMult;
    // 3. 暴击：所有角色自带基础 20% / 150%，技能词条与装备在此之上叠加
    //    毁灭伤害不做暴击判定（固定倍率，求稳）
    const totalCrit = BASE_CRIT_CHANCE + critChance + caster.bonusCritChance
                      + (caster.gearCritChance||0) + (caster.starCritChance||0);
    const isCrit = !isTrueDamage && this.rng() < totalCrit;
    const totalCritMult = Math.max(critMult, BASE_CRIT_MULT) + (caster.gearCritMult||0);
    if(isCrit) raw *= totalCritMult;
    // 4. 属性克制（真实伤害不看克制）
    const em = !isTrueDamage ? elementMultiplier(caster.data.element, target.data.element) : 1;
    raw *= em;
    // 5. 防御（真实伤害跳过）
    if(!isTrueDamage){
      // 防御软减伤：分母较大，保证高攻大招能打出 50%+ HP（肉盾）/ 80%+ HP（脆皮）
      // def=400 → 0.882；def=150 → 0.952；def=2500 → 0.455
      const effDef = target.effDef * (1 - piercePct);
      raw *= 1 - effDef/(effDef+3000);
      // 阵营微调：见 FACTION_PLAYER_MULT / FACTION_ENEMY_MULT 的说明
      raw *= caster.isPlayerSide ? FACTION_PLAYER_MULT : FACTION_ENEMY_MULT;
    }
    // 6. 格挡（被动）—— 真实伤害不吃格挡
    let blocked = false;
    if(!isTrueDamage){
      for(const p of target.passives){
        if(p.triggerType!=="OnHit") continue;
        if(this.rng() > (p.passiveTriggerChance??1)) continue;
        for(const t of p.tags||[]){
          if(t.type==="Block" && this.rng()<t.chance){ raw *= (1-t.value); blocked = true; }
        }
      }
      // 6.5 【格挡星神】的格挡：和被动格挡各自独立判一次，触发时按 starBlockValue 减伤
      //     （星神固定 50%）。这一段同样在 isTrueDamage 之外，所以【毁灭伤害】照样打满。
      if(target.starBlockChance>0 && this.rng()<target.starBlockChance){
        raw *= (1 - (target.starBlockValue||0.5));
        blocked = true;
      }
    }
    // 7. 造成伤害（真实伤害直接把减伤/护盾标记传给 takeDamage 跳过）
    const actual = target.takeDamage(raw, isTrueDamage ? {true:true} : undefined);
    // 7.5 被攻击方获得气势（受击 +50）
    if(actual > 0 && target.isAlive){
      gainEnergy(target, ENERGY_HIT_GAIN);
      this.addEvent("EnergyGain", null, target, ENERGY_HIT_GAIN, `  ${target.data.name} 受击回势 +${ENERGY_HIT_GAIN}（当前 ${Math.round(target.currentEnergy)}）`);
    }
    let msg = `  ${target.data.name} 受到 ${actual} 伤害`;
    if(isTrueDamage) msg = `  ${target.data.name} 受到 ${actual} 【毁灭伤害】（真实伤害，无视减伤与护盾）`;
    if(isCrit) msg += " [暴击]";
    if(energyMult>1) msg += ` [气势×${energyMult.toFixed(2)}]`;
    if(blocked) msg += " [格挡]";
    if(em>1) msg += " [克制]"; else if(em<1) msg += " [抵抗]";
    this.addEvent(isCrit?"CritDamage":"Damage", caster, target, actual, msg, {isCrit,blocked,em,isTrueDamage});
    // 7.8 受击后钩子（如阿瑞斯的【生息不止】：挨打回血、受击满 3 次给同排最高攻队友【连携】）。
    //     放在伤害事件之后、状态结算之前，日志读起来就是「挨了 X 伤害 → 回了 Y 血」。
    //     actual==0 说明这一下被闪避/免疫/护盾吃干净了，不算「受到伤害」，不触发。
    if(actual>0) this._processOnDamagedPassives(target, caster);
    // 8. 施加状态
    if(target.isAlive){
      for(const d of onHitDebuffs){
        let immune = false;
        for(const p of target.passives)
          if(p.triggerType==="OnHit" && (p.tags||[]).some(t=>t.type==="Immune")) immune = true;
        if(immune){ this.addEvent("Info", caster, target, 0, `  ${target.data.name} 免疫了 ${TAG_META[d.type].n}！`); continue; }
        this._applyDebuff(caster, target, d);
      }
    }
    // 9. 吸血
    if(lifestealPct>0 && actual>0){
      const healed = caster.heal(Math.trunc(actual*lifestealPct));
      if(healed>0) this.addEvent("Heal", caster, caster, healed, `  ${caster.data.name} 吸血恢复 ${healed} HP`);
    }
    // 10. 吸怒
    if(energyDrain>0 && target.isAlive){
      const drained = Math.min(Math.trunc(energyDrain), target.currentEnergy);
      target.currentEnergy -= drained; caster.currentEnergy += drained;
      if(drained>0) this.addEvent("EnergyDrain", caster, target, drained, `  ${caster.data.name} 吸取 ${target.data.name} ${drained} 点怒气`);
    }
    // 11. 反击（被动）
    if(target.isAlive){
      for(const p of target.passives){
        if(p.triggerType!=="OnHit") continue;
        if(this.rng() > (p.passiveTriggerChance??1)) continue;
        for(const t of p.tags||[]){
          if(t.type==="Counter" && this.rng()<t.chance){
            const cd = Math.trunc(target.effAtk * t.value);
            const a = caster.takeDamage(cd);
            this.addEvent("Counter", target, caster, a, `  ${target.data.name} 反击 ${caster.data.name}，造成 ${a} 伤害`);
            if(!caster.isAlive) this.addEvent("Death", caster, null, 0, `${caster.data.name} 被反击击杀！`);
          }
        }
      }
    }
    // 函数开头已经拦掉尸体，所以这里 !isAlive 一定意味着「这一击把人打死了」
    if(!target.isAlive) this.addEvent("Death", caster, target, 0, `${target.data.name} 被击败！`);
    return actual;
  }
  _resolveTargets(caster, targetType, atkGrid, defGrid){
    // 【嘲讽】统一拦截：defGrid 有【嘲讽】活人时，所有"指向敌方"的目标都强制改成嘲讽者本人。
    // 群体技能（EnemyAll/EnemyFrontRow/群攻）打到嘲讽者也只算他一个——按用户语义
    // 「群体攻击按照对单体倍率来计算伤害而不是把群体的所有倍率累加」。
    // 这里先把「指向敌方」的 targetType 列出来，Self/Ally/FallenAlly 等不拦。
    const enemyTargets = ["CurrentTarget","EnemyBehindTarget","EnemyLowestHp","EnemyLowestPower","EnemyHighestHp",
      "EnemyAll","AllEnemies","EnemyFrontRow","EnemyMiddleRow","EnemyBackRow","EnemyAdjacent","EnemyRandom"];
    if(enemyTargets.includes(targetType)){
      const t = defGrid.taunter();
      if(t) return [t];
    }
    switch(targetType){
      case "CurrentTarget": { const row=Math.trunc(caster.gridPosition/3); const t=defGrid.pickFrontTarget(row); return t?[t]:[]; }
      case "EnemyBehindTarget": {
        // 先用 CurrentTarget 拿一个 primary；再尝试 primary 后退一格（朝对手方向）
        const row=Math.trunc(caster.gridPosition/3);
        const primary = defGrid.pickFrontTarget(row);
        if(!primary) return [];
        // 视角方向：caster.isPlayerSide 时对方前排是 col=0（closest），player 朝自己 col=2；所以"身后=更远=按对方坐标往同方向多走 1"
        // 这里简化：用 primary.gridPosition 是否对 caster.isPlayerSide 不同解释
        // 一律用：secondary = primary 在 defGrid 里离 caster 最远方向的下一格 → 对玩家打对方时，secondary 应该是 primary.col+1（往对方后推进），对敌方打玩家时 secondary = primary.col-1
        const dir = caster.isPlayerSide ? +1 : -1;
        const secPos = primary.gridPosition + dir;
        if(secPos>=0 && secPos<9 && defGrid.slots[secPos] && defGrid.slots[secPos].isAlive
           && !defGrid.slots[secPos].hasStatus("Stealth")){
          return [primary, defGrid.slots[secPos]];
        }
        return [primary];
      }
      case "EnemyLowestHp": { const u=defGrid.lowestHpUnit(defGrid.targetableUnits()); return u?[u]:[]; }
      case "EnemyLowestPower": { const u=defGrid.lowestPowerUnit(defGrid.targetableUnits()); return u?[u]:[]; }
      case "EnemyHighestHp": { const u=defGrid.highestHpUnit(defGrid.targetableUnits()); return u?[u]:[]; }
      case "Self": return [caster];
      // ---- 敌方群体 / 按排 ----
      // 「排」在横板视角下是列：前排 = 靠近对手那一列（玩家 col=2，敌方 col=0）
      case "EnemyAll": case "AllEnemies": return defGrid.targetableUnits();
      case "EnemyFrontRow":  return defGrid._dropStealth(defGrid.columnByRank(0));
      case "EnemyMiddleRow": return defGrid._dropStealth(defGrid.columnByRank(1));
      case "EnemyBackRow":   return defGrid._dropStealth(defGrid.columnByRank(2));
      // 当前目标的四邻（以主目标所在格为中心）
      case "EnemyAdjacent": {
        const row=Math.trunc(caster.gridPosition/3);
        const primary = defGrid.pickFrontTarget(row);
        return primary ? defGrid._dropStealth(defGrid.adjacentUnits(primary.gridPosition)) : [];
      }
      // 随机 1 个敌方（【群攻】由 MultiTarget 单独处理，不走这里）
      case "EnemyRandom": { const p=defGrid.targetableUnits(); return p.length?[p[Math.floor(this.rng()*p.length)]]:[]; }
      // ---- 我方 ----
      case "AllyLowestHp": { const u=atkGrid.lowestHpUnit(atkGrid.aliveUnits()); return u?[u]:[]; }
      // 「横排」= 视觉上的同一行（pos/3 相同），跟选敌用的「排/列」是两套坐标，别搞混。
      // 攻击力按 effAtk 算（吃了攻↑/攻↓的实况值），不是面板原始 atk。
      case "AllyHighestAtkSameRow": {
        const row = Math.trunc(caster.gridPosition/3);
        const list = atkGrid.aliveUnits().filter(u=>Math.trunc(u.gridPosition/3)===row);
        return list.length ? [list.reduce((m,u)=>u.effAtk>m.effAtk?u:m)] : [];
      }
      case "AllyAll": return atkGrid.aliveUnits();
      case "AllAllies": return atkGrid.aliveUnits();
      case "AllyFrontRow": return atkGrid.frontRow();
      case "AllyExceptSelf": return atkGrid.aliveUnits().filter(u=>u!==caster);
      // 阵亡池：只有【复活】用得着。活着的人不在里面，所以【复活】打空目标时
      // 不会把满血队友"复活"一遍。
      case "FallenAllyRandom": {
        const fallen = atkGrid.allUnits().filter(u=>!u.isAlive);
        return fallen.length ? [fallen[Math.floor(this.rng()*fallen.length)]] : [];
      }
      // 按基础职业筛己方（英雄技/光环类词条的选人方式）
      case "AllyTank":    return atkGrid.aliveUnits().filter(u=>u.data.charClass==="tank");
      case "AllyAttack":  return atkGrid.aliveUnits().filter(u=>u.data.charClass==="attack");
      case "AllySpeed":   return atkGrid.aliveUnits().filter(u=>u.data.charClass==="speed");
      case "AllyBalance": return atkGrid.aliveUnits().filter(u=>u.data.charClass==="balance");
      // 按元素筛己方（英雄技"大地赐福"对草属性加 buff 用）
      case "AllyGrass":   return atkGrid.aliveUnits().filter(u=>u.data.element==="Grass");
      // 「敌方同横排」：caster 所在行（pos/3）对应到 defGrid 同行所有活人
      case "EnemySameRow": {
        const row = Math.trunc(caster.gridPosition/3);
        return defGrid.aliveUnits().filter(u=>Math.trunc(u.gridPosition/3)===row);
      }
      case "AllAll": return [...atkGrid.aliveUnits(), ...defGrid.targetableUnits()];
      default: return [];
    }
  }
  /** 从候选池里随机抽 n 个不重复目标（不足 n 个就有多少抽多少） */
  _pickRandomTargets(pool, n){
    const avail = pool.slice(), out = [];
    const want = Math.min(Math.max(0, Math.trunc(n)), avail.length);
    for(let i=0;i<want;i++) out.push(avail.splice(Math.floor(this.rng()*avail.length), 1)[0]);
    return out;
  }
  _applyDebuff(caster, target, tag){
    const seType = tagToStatus(tag);
    if(!seType) return;
    if((tag.chance??1)<1 && this.rng() > tag.chance) return;
    // duration 不兜底：undefined 表示「永久」（按用户 9/10 修尔禁疗设计）。
    // _applyDebuff 之前用 tag.duration||0 把 undefined 兜成 0，导致「永久禁疗」
    // 第一回合 processTurnEnd 就被 StatusExpired 干掉了。
    target.addStatus(seType, tag.value||0, tag.duration, caster);
    this.addEvent("StatusApplied", caster, target, 0,
      `  ${target.data.name} 受到 ${TAG_META[tag.type].n} 效果（${tag.duration==null?"永久":tag.duration+"回合"}）`);
  }
  _applySelfBuff(caster, tag){
    const names = {AtkUp:"攻击增益",DefUp:"防御增益",SpdUp:"速度增益",Shield:"护盾",DamageReduction:"减伤"};
    const seType = tagToStatus(tag);
    if(!seType) return;
    const atkGrid = caster.isPlayerSide ? this.playerGrid : this.enemyGrid;
    const defGrid = caster.isPlayerSide ? this.enemyGrid : this.playerGrid;
    // 增益只可能落在自己这边。老实现压根不看 tag.target，一律贴给自己——
    // 于是「圣盾壁垒」写着 AllyAll 却只给坦克一个人套盾。现在按 target 解析，
    // 并且过滤掉敌方格：万一 target 留在默认的 CurrentTarget（设计器新增词条时的默认值），
    // 我们也退回自己身上，而不是把护盾贴到敌人脸上。
    let targets = this._resolveTargets(caster, tag.target||"Self", atkGrid, defGrid)
      .filter(t=>t && t.isPlayerSide===caster.isPlayerSide);
    if(!targets.length) targets = [caster];
    for(const t of targets){
      if(!t.isAlive) continue;
      t.addStatus(seType, tag.value||0, tag.duration, caster);
      this.addEvent("StatusApplied", caster, t, 0,
        `  ${t.data.name} 获得 ${names[tag.type]||tag.type}（${tag.duration==null?"永久":tag.duration+"回合"}）`);
    }
  }
  /** 资源型词条（龙魂）：在技能执行结束时一并结算 */
  _execResourceTags(caster, skill, supportTags){
    for(const tag of supportTags){
      if(tag.type === "DragonSoulInit"){
        // 战斗开始时给 caster 加 N 点龙魂（仅生效一次，由 OnBattleStart 触发器触发，本方法通常不会被调用）
        caster.dragonSouls = Math.max(caster.dragonSouls, Math.trunc(tag.value||0));
        this.addEvent("Info", caster, null, 0, `  ${caster.data.name} 初始化【龙魂】×${caster.dragonSouls}`);
      } else if(tag.type === "DragonSoulRefillOnUlt"){
        // 大招后补充龙魂至 N 个
        if(skill.triggerType === "Ultimate"){
          const target = Math.trunc(tag.value||0);
          const old = caster.dragonSouls;
          caster.dragonSouls = Math.max(old, target);
          if(caster.dragonSouls > old){
            this.addEvent("Info", caster, null, 0, `  ${caster.data.name} 补充【龙魂】（${old} → ${caster.dragonSouls}）`);
          }
        }
      } else if(tag.type === "DragonSoulAllyRetaliate"){
        // 【龙魂追击】：**一次出手只打一发**，消耗 1 个龙魂，吸怒 75。
        //
        // 这里踩过一次坑：早先是「当前有几个魂就打几发」，于是开完大招把魂补满 3 个之后，
        // 下一次出手（哪怕只是队友平a）就把 3 发一次性全倒出去，看起来像凭空多打了一套；
        // 而且出手序里后面几个人再出手时魂已经空了，节奏全乱。
        // 龙魂是「存着、慢慢花」的资源——出手一次花一个，出手越频繁越用得上，这才对。
        // 想爆发就自己连击/连携，而不是靠一次出手把存货倒空。
        //
        // 龙魂为 0 就直接不触发（这条判断必须写在这里，不能靠外面的技能有没有伤害词条兜底；
        // 也不报幕——_processAllyActedPassives 那层已经整条静默，这里再兜一层）
        const atkGrid = caster.isPlayerSide ? this.playerGrid : this.enemyGrid;
        const defGrid = caster.isPlayerSide ? this.enemyGrid : this.playerGrid;
        if(!caster.isAlive) continue;
        if((caster.dragonSouls||0) <= 0) continue;
        // 先确认打得到人再扣魂，避免空扣
        const t = this._resolveTargets(caster, "CurrentTarget", atkGrid, defGrid).find(x=>x.isAlive)
                  || defGrid.lowestHpUnit(defGrid.targetableUnits());
        if(!t){
          this.addEvent("Info", caster, null, 0, `  【龙魂追击】敌方已无可攻击目标，中断`);
          continue;
        }
        caster.dragonSouls -= 1;
        this.addEvent("DragonSoul", caster, t, 1,
          `  ${caster.data.name} 发动【龙魂追击】→ ${t.data.name}（剩余龙魂 ${caster.dragonSouls}，吸怒 75）`);
        this._processAttack(caster, t, tag.value||1.5, 0, 0, 1, 0, [], 0, 75);
      }
      // 注：DragonSoulAllyRetaliate 的触发入口是 _processAllyActedPassives（任意单位出手后），
      // 这里只负责「真的被触发之后怎么打」。
    }
  }
  _execSupport(caster, tag, skill){
    const atkGrid = caster.isPlayerSide ? this.playerGrid : this.enemyGrid;
    const defGrid = caster.isPlayerSide ? this.enemyGrid : this.playerGrid;
    switch(tag.type){
      case "Heal":
        for(const t of this._resolveTargets(caster, tag.target||"CurrentTarget", atkGrid, defGrid)){
          if(!t.isAlive) continue;
          // 【禁疗】拦截：被禁疗目标回血直接落空（按用户要求，下次无法回血/复活）
          if(t.hasStatus("HealBlock")){
            this.addEvent("Info", caster, t, 0, `  ${t.data.name} 处于【禁疗】，治疗无效`);
            continue;
          }
          const h = t.heal(Math.trunc(tag.value));
          if(h>0) this.addEvent("Heal", caster, t, h, `  ${t.data.name} 被治疗 ${h} HP`);
        }
        break;
      case "Revive": {
        const tagId = skill_id_(caster, skill, tag);
        // once:true 时只能复活 1 次（按当前 caster 自己）
        if(tag.once && caster._triggeredOnce.has(tagId)) break;
        // useCharge：这次复活从【复活储备】里扣。储备是耗材，扣完就复活不了，
        // 所以「阿瑞斯两条命」「诺亚每回合一条命」都能靠同一个机制表达。
        // 储备记在**施法者**身上（target:Self 时施法者就是被复活的人）。
        if(tag.useCharge && (caster.reviveCharges||0) <= 0) break;
        let rt = null;
        if(tag.target === "Self"){
          // 复活自己（前提：caster 已死亡）
          if(!caster.isAlive) rt = caster;
        } else {
          const fallen = atkGrid.allUnits().filter(u=>!u.isAlive);
          if(fallen.length>0){
            rt = tag.target==="AllyLowestHp"
              ? fallen.reduce((m,u)=>u.maxHp<m.maxHp?u:m)
              : tag.target==="FallenAllyRandom"
                ? fallen[Math.floor(this.rng()*fallen.length)]   // 随机捞一个，抽的是阵亡池
                : fallen[0];
          }
        }
        if(!rt) break;
        // 【禁疗】拦截：被复活的目标身上挂着 HealBlock 时（按用户 9/10 修复）：
        //   - 有【复活储备】（tag.useCharge + caster.reviveCharges>0）→ 扣 1 层储备 + 移除 HealBlock + 复活照常
        //   - 没复活储备 → 复活失败 + 移除 HealBlock（这样下一次死亡时队友的 Revive 可以正常生效，
        //                  因为「下次死亡后被复活」是默认按「那次死亡时没有 HealBlock」走的）
        // 两种分支都消耗这次禁疗本身，区别在于：
        //   - 扣储备：复活成功，HealBlock 被「抵消」掉；
        //   - 没储备：复活失败，HealBlock 被「用」掉（无意义了，目标已经死了）。
        // 用 consumeCharge 标记避免下方 if(rt) 复活分支再扣一次储备。
        let consumeCharge = tag.useCharge;
        if(rt.hasStatus("HealBlock")){
          if(consumeCharge && (caster.reviveCharges||0) > 0){
            caster.reviveCharges -= 1;
            consumeCharge = false;  // 已被抵消分支扣过
            const idx = rt.statusEffects.findIndex(s=>s.type==="HealBlock");
            if(idx>=0) rt.statusEffects.splice(idx,1);
            this.addEvent("Info", caster, rt, 0,
              `  ${rt.data.name} 处于【禁疗】，花 1 次【复活储备】抵消（剩余 ${caster.reviveCharges}）`);
          } else {
            const idx = rt.statusEffects.findIndex(s=>s.type==="HealBlock");
            if(idx>=0) rt.statusEffects.splice(idx,1);
            this.addEvent("Info", caster, rt, 0, `  ${rt.data.name} 处于【禁疗】，复活无效`);
            break;
          }
        }
        if(rt){
          // value 是"复活后剩余 HP 占最大 HP 的比例"；不写则默认 30%。
          // 注意用 !=null 判断：value:0 是合法值（复活一滴血），不能被 || 兜底成 0.3
          const ratio = tag.value!=null ? tag.value : 0.3;
          rt.isAlive = true;
          rt.currentHp = Math.max(1, Math.trunc(rt.maxHp * ratio));
          rt.statusEffects = [];
          if(tag.once){
            if(tagId) caster._triggeredOnce.add(tagId);
          }
          if(consumeCharge){
            caster.reviveCharges = Math.max(0, (caster.reviveCharges||0) - 1);
          }
          this.addEvent("Revive", caster, rt, rt.currentHp, `  ${rt.data.name} 被复活！恢复 ${rt.currentHp} HP`);
          // 「每次被复活 → 获得【连携】」写在复活词条自己的 chain 字段上，而不是拆成
          // 一条单独的【连携】tag：只有真复活才给。拆开的话，那条 Chain 每次技能执行都跑，
          // 诺亚的回合开场被动会变成「每回合白送一个出手回合」。
          if(tag.chain && tag.chain>0) this._grantChain(rt, tag.chain);
        }
        break;
      }
      // 【隐身】：不会被选为攻击目标（全队都隐身时才重新可被打），duration<0 表示永久
      case "Stealth": {
        for(const t of this._resolveTargets(caster, tag.target||"Self", atkGrid, defGrid)){
          if(!t.isAlive) continue;
          if(t.hasStatus("Stealth")) continue;
          const turns = tag.duration!=null ? tag.duration : -1;
          t.addStatus("Stealth", tag.value||1, turns, caster);
          this.addEvent("StatusApplied", caster, t, 0,
            `  ${t.data.name} 进入【隐身】状态${turns<0?"（永久，直到己方只剩自己）":`（${turns}回合）`}`);
        }
        break;
      }
      case "Cleanse":
        for(const t of this._resolveTargets(caster, tag.target||"CurrentTarget", atkGrid, defGrid)){
          const n = t.statusEffects.filter(s=>s.isDebuff).length;
          t.cleanseDebuffs();
          if(n>0) this.addEvent("Cleanse", caster, t, n, `  ${t.data.name} 净化了 ${n} 个减益`);
        }
        break;
      case "Dispel":
        for(const t of this._resolveTargets(caster, tag.target||"CurrentTarget", atkGrid, defGrid)){
          const n = t.statusEffects.filter(s=>s.isBuff).length;
          t.dispelBuffs();
          if(n>0) this.addEvent("Dispel", caster, t, n, `  ${t.data.name} 被驱散了 ${n} 个增益`);
        }
        break;
      case "EnergyGain":
        const eg = Math.trunc(tag.value);
        gainEnergy(caster, eg);
        this.addEvent("EnergyGain", caster, null, eg, `  ${caster.data.name} 获得 ${eg} 点气势（当前 ${Math.round(caster.currentEnergy)}）`);
        break;
      // 【免疫】：给目标挂 N 层「无效化下一次直接攻击」。
      // 刻意不进 statusEffects——它按「次」消耗，混进状态列表会被回合递减顺手清掉，
      // 也会被【驱散】当成普通增益抢走。作为独立计数器存在 BattleUnit.immunityCharges。
      case "Immunity": {
        for(const t of this._resolveTargets(caster, tag.target||"Self", atkGrid, defGrid)){
          if(!t.isAlive) continue;
          const n = Math.max(1, Math.trunc(tag.value||1));
          t.immunityCharges += n;
          this.addEvent("Immunity", caster, t, n,
            `  ${t.data.name} 获得【免疫】×${n}（共 ${t.immunityCharges} 层，可无效化接下来 ${t.immunityCharges} 次直接攻击）`);
        }
        break;
      }
      // 【生命上限】：按比例抬高最大生命，同时把涨出来的血补上。永久，不可净化/驱散。
      case "MaxHpUp": {
        const ratio = tag.value||0;
        for(const t of this._resolveTargets(caster, tag.target||"AllyAll", atkGrid, defGrid)){
          if(!t.isAlive) continue;
          const delta = t.applyMaxHpBonus(ratio);
          this.addEvent("MaxHpUp", caster, t, delta,
            `  ${t.data.name} 最大生命 +${Math.round(ratio*100)}% → ${t.maxHp}（补足 ${delta} HP）`);
        }
        break;
      }
      // 【比例治疗】：按目标最大生命的比例回血。value=1.0 就是「回满血」。
      // 和【治疗】的分工：治疗给固定值，适合等级/属性偏低时救急；
      // 比例治疗跟着血量上限走，肉盾身上收益远超固定值。
      case "HealPct":
        for(const t of this._resolveTargets(caster, tag.target||"Self", atkGrid, defGrid)){
          if(!t.isAlive) continue;
          // 【禁疗】拦截：被禁疗目标按比例回血也直接落空
          if(t.hasStatus("HealBlock")){
            this.addEvent("Info", caster, t, 0, `  ${t.data.name} 处于【禁疗】，比例治疗无效`);
            continue;
          }
          const h = t.heal(Math.trunc(t.maxHp * (tag.value||0)));
          if(h>0) this.addEvent("Heal", caster, t, h,
            `  ${t.data.name} 回复 ${h} HP（${Math.round((tag.value||0)*100)}% 最大生命）`);
        }
        break;
      // 【复活储备】：给目标记 N 次「死了能满血回来」的额度（cap 是上限，防无限累积）。
      // 本身不复活任何人，只是充能；真正救人靠带 useCharge 的【复活】词条。
      // 阿瑞斯开局发 2 层（一颗心两次），诺亚每回合补 1 层（cap 1，不堆利息）。
      case "ReviveCharge": {
        for(const t of this._resolveTargets(caster, tag.target||"Self", atkGrid, defGrid)){
          if(!t.isAlive) continue;
          const cap = tag.cap!=null ? Math.trunc(tag.cap) : Infinity;
          const before = t.reviveCharges||0;
          t.reviveCharges = Math.min(cap, before + Math.max(0, Math.trunc(tag.value||0)));
          const gained = t.reviveCharges - before;
          this.addEvent("ReviveCharge", caster, t, t.reviveCharges,
            `  ${t.data.name} 获得【复活储备】×${gained}（当前 ${t.reviveCharges} 层）`);
        }
        break;
      }
      // 【连携】：目标立刻多打一个出手回合。实现见 _grantChain。
      case "Chain": {
        for(const t of this._resolveTargets(caster, tag.target||"Self", atkGrid, defGrid)){
          if(!t.isAlive) continue;
          this._grantChain(t, tag.value||1);
        }
        break;
      }
      // 【生息不止】：把「受击回血 + 满 N 次给同排最高攻队友【连携】」挂成状态。
      // 效果本身由 _processOnDamagedPassives 在每次真的掉血后结算，这里只负责挂上。
      case "VitalityOnHurt": {
        for(const t of this._resolveTargets(caster, tag.target||"Self", atkGrid, defGrid)){
          if(!t.isAlive) continue;
          const hits = Math.max(1, Math.trunc(tag.hits||3));
          t.addStatus("VitalityOnHurt", tag.value||0, tag.duration!=null?tag.duration:-1, caster, {hits});
          this.addEvent("StatusApplied", caster, t, 0,
            `  ${t.data.name} 获得【生息不止】：受击回复 ${Math.round((tag.value||0)*100)}% 生命，满 ${hits} 次给同排攻击最高的队友【连携】`);
        }
        break;
      }
      // 【气势降低】：直接扣目标气势。可负 value 表示"扣 N 点"（修尔"是非之魔"开场给敌方同横排 -20）。
      // 被【气势免疫】（草属性 + 大地赐福激活）的目标整条跳过。
      case "EnergyDown": {
        for(const t of this._resolveTargets(caster, tag.target||"CurrentTarget", atkGrid, defGrid)){
          if(!t.isAlive) continue;
          if(t.energyImmunity){
            this.addEvent("Info", caster, t, 0, `  ${t.data.name} 免疫【气势降低】`);
            continue;
          }
          const before = t.currentEnergy;
          t.currentEnergy = Math.max(0, before + (tag.value||0));
          const delta = t.currentEnergy - before;
          if(delta !== 0){
            this.addEvent("EnergyGain", caster, t, delta,
              `  ${t.data.name} 气势 ${delta>=0?"+":""}${Math.round(delta)}（当前 ${Math.round(t.currentEnergy)}）`);
          }
        }
        break;
      }
      // 【气势免疫】：标记（不带数值堆叠），给单位打 energyImmunity=true，
      // 后续 EnergyDown 走到该单位时直接跳过。
      case "EnergyImmunity": {
        for(const t of this._resolveTargets(caster, tag.target||"AllyAll", atkGrid, defGrid)){
          if(!t.isAlive) continue;
          t.energyImmunity = true;
          this.addEvent("Info", caster, t, 0, `  ${t.data.name} 获得【气势免疫】（免疫气势降低）`);
        }
        break;
      }
      default: break;
    }
  }
}

