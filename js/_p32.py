# -*- coding: utf-8 -*-
# 双生龙尊·白/黑：H5 data + engine
import io

# ================= data.js =================
p = 'data.js'
s = io.open(p, encoding='utf-8').read()

# 1. TAG_META：攻击叠层 + 顶级复活说明（Revive desc 末尾追加）
old = """  SpiritDrain:{n:"噬神夺魂", s:"夺魂", c:"#2C5F8A", cat:"fn", v:"转移的通灵点数", tgt:0,
    desc:"己方通灵师获得 value 点通灵点；敌方通灵师若已发动通灵技则被吸取 value 点，未通灵则吸不到。"},
};"""
new = """  SpiritDrain:{n:"噬神夺魂", s:"夺魂", c:"#2C5F8A", cat:"fn", v:"转移的通灵点数", tgt:0,
    desc:"己方通灵师获得 value 点通灵点；敌方通灵师若已发动通灵技则被吸取 value 点，未通灵则吸不到。"},
  AtkStack:{n:"罪裁蓄力", s:"蓄力", c:"#8E44AD", cat:"fn", v:"每次释放增加的攻击力比例", tgt:0,
    desc:"释放该技能前，自身攻击力永久 +value%（可无限叠加，叠加进 atkMult）。双生龙尊·黑的罪裁蓄力。"},
};"""
assert old in s, 'tagmeta'
s = s.replace(old, new)


# 2. 技能（挂在 pas_boccaccio_devour 之后）
old = """  {id:"pas_boccaccio_devour",name:"噬神之力",triggerType:"OnHit",passiveTriggerChance:1.0,tags:[
    // 标记词条：引擎在受击「前」检测该标记结算噬神（层数存 devourStacks）
    {type:"DevourPower",value:1}
  ]}"""
new = old + """
  // ============ 双生龙尊·白（光 · 速度：顶级复活 / 50% 基础闪避）============
  ,
  {id:"atk_bai",name:"圣辉斩",triggerType:"NormalAttack",tags:[
    // 平a：单体 400%，吸收敌方 2 通灵点
    {type:"DamageMultiplier",value:4.0,target:"CurrentTarget"},
    {type:"SpiritDrain",value:2}
  ]},
  {id:"ult_bai",name:"神判之光",triggerType:"Ultimate",energyCost:100,tags:[
    // 大招：单体 400% + 吸灵 2 + 【顶级复活】战力最高的阵亡队友（无视一切禁疗），满血/满气势 + 立即出手
    {type:"DamageMultiplier",value:4.0,target:"CurrentTarget"},
    {type:"SpiritDrain",value:2},
    {type:"Revive",value:1.0,target:"FallenAllyHighestPower",force:true,fullEnergy:true,chain:1}
  ]},
  {id:"pas_bai_judge",name:"神判",triggerType:"OnBattleStart",passiveTriggerChance:1.0,tags:[
    // 1 次复活储备（两条命）；50% 基础闪避走角色字段 baseDodge
    {type:"ReviveCharge",value:1,target:"Self"}
  ]},
  {id:"pas_bai_revive",name:"神判·归",triggerType:"OnDeath",passiveTriggerChance:1.0,tags:[
    {type:"Revive",value:1.0,target:"Self",useCharge:true}
  ]}
  // ============ 双生龙尊·黑（暗 · 攻击：毁灭附加 / 攻击叠层 / 回合开始立即出手）============
  ,
  {id:"atk_hei",name:"暗渊斩",triggerType:"NormalAttack",tags:[
    // 平a：单体 400% + 300% 毁灭伤害打敌方血量最高
    {type:"DamageMultiplier",value:4.0,target:"CurrentTarget"},
    {type:"TrueDamage",value:3.0,target:"EnemyHighestHp"}
  ]},
  {id:"ult_hei",name:"罪裁·灭世",triggerType:"Ultimate",energyCost:100,tags:[
    // 大招：释放前攻 +50%（无限叠），400% 群攻×3，+400% 毁灭打血量最高
    {type:"AtkStack",value:0.5},
    {type:"DamageMultiplier",value:4.0,target:"CurrentTarget"},
    {type:"MultiTarget",value:3},
    {type:"TrueDamage",value:4.0,target:"EnemyHighestHp"}
  ]},
  {id:"pas_hei_judge",name:"罪裁",triggerType:"OnRoundStart",passiveTriggerChance:1.0,tags:[
    // 每个大回合开始：立即出手机会（连携）；双黑同阵时速度快者先（回合开始按速度排序）
    {type:"Chain",value:1,target:"Self"}
  ]}"""
assert old in s, 'skills'
s = s.replace(old, new)

# 3. 角色（挂在 char_boccaccio 之后）
old = """  {id:"char_boccaccio",name:"归墟·薄伽丘",charClass:"tank",maxHp:4400,atk:480,def:400,spd:80,element:"Water",normalAttackId:"atk_boccaccio",ultimateId:"ult_boccaccio",passiveIds:["pas_boccaccio_tank","pas_boccaccio_devour"],startingEnergy:50,portrait:"assets/img/char_boccaccio.webp"}"""
new = """  {id:"char_boccaccio",name:"归墟·薄伽丘",charClass:"tank",maxHp:4400,atk:480,def:400,spd:80,element:"Water",normalAttackId:"atk_boccaccio",ultimateId:"ult_boccaccio",passiveIds:["pas_boccaccio_tank","pas_boccaccio_devour"],startingEnergy:50,portrait:"assets/img/char_boccaccio.webp"}
  // ============ 双生龙尊·白（光 · 速度：顶级复活 / 50% 基础闪避）============
  ,
  {id:"char_bai",name:"双生龙尊·白",charClass:"speed",maxHp:3600,atk:900,def:250,spd:130,element:"Light",baseDodge:0.5,normalAttackId:"atk_bai",ultimateId:"ult_bai",passiveIds:["pas_bai_judge","pas_bai_revive"],startingEnergy:50,portrait:"assets/img/char_bai.webp"}
  // ============ 双生龙尊·黑（暗 · 攻击：毁灭附加 / 攻击无限叠层）============
  ,
  {id:"char_hei",name:"双生龙尊·黑",charClass:"attack",maxHp:3200,atk:950,def:200,spd:125,element:"Dark",normalAttackId:"atk_hei",ultimateId:"ult_hei",passiveIds:["pas_hei_judge"],startingEnergy:50,portrait:"assets/img/char_hei.webp"}"""
assert old in s, 'chars'
s = s.replace(old, new)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('data ok')

