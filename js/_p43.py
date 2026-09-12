# -*- coding: utf-8 -*-
# 次元龙尊 + 法纳斯 + 白龙兜底（H5 引擎部分）
import io

p = 'D:/aoqichuanshuo/h5_test/js/engine.js'
s = io.open(p, encoding='utf-8').read()

# 1. DefBreak 路由（onHitDebuffs：每段伤害各结算一次）
old = """        case "HealBlock": case "StrongHealBlock":
          onHitDebuffs.push(tag); break;"""
new = """        case "HealBlock": case "StrongHealBlock": case "DefBreak":
          onHitDebuffs.push(tag); break;
        case "AllyHighestAtkChain":
          supportTags.push(tag); break;"""
assert old in s, 'route'
s = s.replace(old, new)

# 2. CritVsShield：目标有护盾 → 必定暴击（次元锋刃）
old = """    const isCrit = !isTrueDamage && this.rng() < totalCrit;"""
new = """    // 【次元锋刃】目标有护盾 → 攻击必定暴击
    if(!isTrueDamage && target.statusEffects.some(s=>s.type==="Shield")
       && caster.passives.some(p=>(p.tags||[]).some(t=>t.type==="CritVsShield"))) totalCrit = 1;
    const isCrit = !isTrueDamage && this.rng() < totalCrit;"""
assert old in s, 'crit shield'
s = s.replace(old, new)

# 3. Dodged 处：闪避衰减被动 + 毁灭神谕回灵
old = """    if(!isTrueDamage && dodgeChance>0 && this.rng()<dodgeChance){
      this.addEvent("Dodged", caster, target, 0, `  ${target.data.name} 闪避了攻击！`, {dodged:true});
      return 0;
    }"""
new = """    if(!isTrueDamage && dodgeChance>0 && this.rng()<dodgeChance){
      this.addEvent("Dodged", caster, target, 0, `  ${target.data.name} 闪避了攻击！`, {dodged:true});
      // 【闪避衰减】被动：每次成功闪避自身闪避率 -30%（基础 20% 是下限，bonus 归零即触底）
      for(const p of target.passives){
        if(!(p.tags||[]).some(t=>t.type==="DodgeDecay")) continue;
        target.bonusDodgeChance = Math.max(0, (target.bonusDodgeChance||0) - 0.3);
        this.addEvent("Info", null, target, target.bonusDodgeChance,
          `  【暗影衰减】${target.data.name} 闪避率 -30%（当前附加 +${Math.round((target.bonusDodgeChance||0)*100)}%）`);
      }
      // 【毁灭神谕】法纳斯：队友每次闪避 → 通灵点 +3
      const fSide = target.isPlayerSide ? "player" : "enemy";
      const fSp = this._spiritistPreferredBySide && this._spiritistPreferredBySide[fSide];
      if(fSp && fSp !== target && fSp.data.spiritGain === "fanusi" && target.isAlive){
        fSp.spiritPoints = (fSp.spiritPoints||0) + 3;
        this.addEvent("Info", target, fSp, fSp.spiritPoints,
          `  【毁灭神谕】${target.data.name} 闪避 → ${fSp.data.name} 通灵点 +3（${fSp.spiritPoints}/${fSp.spiritThreshold}）`);
        if(fSp.spiritPoints >= fSp.spiritThreshold) this._triggerSpiritTransform(fSp);
      }
      return 0;
    }"""
assert old in s, 'dodge hook'
s = s.replace(old, new)

# 4. DefBreak 结算（_applyDebuff）
old = """  _applyDebuff(caster, target, d){"""
i = s.find(old)
assert i >= 0, 'applydebuff'
brace = s.find('{', i)
insert_at = s.find('\n', brace) + 1
newcase = """    if(d.type==="DefBreak"){
      // 【次元破甲】：DefDown 累计叠加，总削减封顶 80%（防御最低降到 20% 基础防御）
      const cur = target.statusEffects.find(x=>x.type==="DefDown");
      const add = d.value||0.3;
      let total = Math.min(0.8, (cur?cur.value:0) + add);
      if(cur) cur.value = total;
      else target.statusEffects.push(new StatusEffect("DefDown", total, -1, caster));
      this.addEvent("StatusApplied", caster, target, total,
        `  ${target.data.name} 防御力降低 ${Math.round(total*100)}%（下限 20%）`);
      return;
    }
"""
s = s[:insert_at] + newcase + s[insert_at:]
print('defbreak ok')

# 5. AllyHighestAtkChain 执行（放 AtkStack case 前）
old = """      case "AtkStack": {"""
new = """      case "AllyHighestAtkChain": {
        // 法纳斯：队伍中存活的攻击最高队友（隐身也算存活）获得立即出手；只剩自己则不给
        const allies = atkGrid.aliveUnits().filter(u=>u!==caster);
        if(allies.length===0){
          this.addEvent("Info", caster, caster, 0, `  ${caster.data.name} 身边没有可以传递出手的队友`);
          break;
        }
        const t = allies.reduce((m,u)=>u.effAtk>m.effAtk?u:m);
        this._grantChain(t, Math.trunc(tag.value||1));
        this.addEvent("Info", caster, t, Math.trunc(t.effAtk),
          `  ${t.data.name}（存活攻击最高${t.stealth?"，隐身中":""}）获得立即出手机会`);
        break;
      }
      case "AtkStack": {"""
assert old in s, 'chain case'
s = s.replace(old, new, 1)

# 6. getSpiritPointGain：fanusi 规则
old = """    if(this.data.spiritGain === "lightdark"){
      const el = caster.data.element;
      return (el === "Light" || el === "Dark") ? 2 : 0;
    }
    return hitCount;"""
new = """    if(this.data.spiritGain === "lightdark"){
      const el = caster.data.element;
      return (el === "Light" || el === "Dark") ? 2 : 0;
    }
    if(this.data.spiritGain === "fanusi"){
      if(caster === this) return 0;   // 自己出手不给（队友出手才给）
      const el = caster.data.element;
      return (el === "Light" || el === "Dark") ? 1 : 0;
    }
    return hitCount;"""
assert old in s, 'fanusi gain'
s = s.replace(old, new)

# 7. 白龙兜底：无人可复活 → 战力最高存活单位回气 + 连携
old = """            if(!rt) break;"""
new = """            if(!rt && tag.target==="FallenAllyHighestPower"){
              // 【顶级复活】没有阵亡队友 → 战力最高的存活队友回满气势 + 立即出手
              const alive = atkGrid.aliveUnits().filter(u=>u!==caster);
              if(alive.length){
                const w = alive.reduce((m,u)=>(u.maxHp/10+u.effAtk*2+u.effDef*2+u.data.spd*1.5) > (m.maxHp/10+m.effAtk*2+m.effDef*2+m.data.spd*1.5)?u:m);
                if(tag.fullEnergy){ w.currentEnergy = w.maxEnergy; this.addEvent("EnergyGain", w, w, w.maxEnergy, `  ${w.data.name} 气势回满（${w.maxEnergy}）`); }
                if(tag.chain>0) this._grantChain(w, Math.trunc(tag.chain));
                this.addEvent("Info", caster, w, w.effAtk, `  【顶级复活】无人可复活 → ${w.data.name}（战力最高）获得气势与立即出手机会`);
              }
              break;
            }
            if(!rt) break;"""
assert old in s, 'bai fallback'
s = s.replace(old, new)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('h5 engine ok')
