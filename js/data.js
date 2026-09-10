/* js/data.js —— 由单文件 index.html 机械拆出，逻辑零改动 */
"use strict";
/* ================================================================
 * 数据层（与 C# 版 Data/*.json 同构，可互相导出）
 * ================================================================ */
// 旧 TRIGGER / TAG_META / ELEMENTS 已删除，统一在脚本顶部新版中文常量
const TARGETS = ["CurrentTarget","EnemyFrontRow","EnemyMiddleRow","EnemyBackRow","EnemyAll","AllEnemies","EnemyAdjacent","EnemyRandom","EnemyLowestHp","EnemyHighestHp","EnemyBehindTarget","EnemyLowestPower","AllAll","Self","AllyLowestHp","AllyHighestAtkSameRow","AllyAll","AllAllies","AllyFrontRow","AllyExceptSelf","FallenAllyRandom","AllyTank","AllyAttack","AllySpeed","AllyBalance"];

// 旧版「眩晕 / 冰冻」已统一为通用词条【控制】，这里做一次数据迁移，
// 让老技能数据（含从 C# 导出的 JSON）也能正常工作。
const TAG_ALIAS = {Stun:"Control", Freeze:"Control"};
function normTagType(t){ return TAG_ALIAS[t] || t; }

let SKILLS = [
  {id:"atk_fire",name:"火球术",triggerType:"NormalAttack",energyCost:0,tags:[{type:"DamageMultiplier",value:1.0,chance:1.0,duration:0,target:"CurrentTarget"}]},
  {id:"atk_water",name:"水刃斩",triggerType:"NormalAttack",tags:[{type:"DamageMultiplier",value:1.0}]},
  {id:"atk_grass",name:"叶刃",triggerType:"NormalAttack",tags:[{type:"DamageMultiplier",value:1.0}]},
  {id:"atk_light",name:"光矢",triggerType:"NormalAttack",tags:[{type:"DamageMultiplier",value:1.0}]},
  {id:"atk_dark",name:"暗影爪",triggerType:"NormalAttack",tags:[{type:"DamageMultiplier",value:1.0}]},
  // ⚠ 下面这 8 组是「初始角色」的技能，刻意压过一档。它们服务于新手阵容，
  //   早期版本里超模得厉害：地震波=全体伤害+群体眩晕、大招收尾再白送一次连击
  //   （连击额外回合会自动补 50 气势，等于大招自我循环）、圣光审判 180% 打全体。
  //   秩序龙尊 / 无烬龙尊 / 造物以撒 是三个「样例角色」，强度单独保留，不参与这轮下调。
  //   想改回去直接在「角色设计器」或「技能词条」里调，改动会存档。
  {id:"ult_fire_storm",name:"烈焰风暴",triggerType:"Ultimate",energyCost:100,tags:[
    // 火系打击手：暴击 + 灼烧，去掉连击（连击留给以撒当特色）
    {type:"DamageMultiplier",value:1.4},{type:"Crit",value:1.5,chance:0.25},
    {type:"Burn",value:0.05,chance:0.6,duration:3}]},
  {id:"ult_water_heal",name:"治愈之泉",triggerType:"Ultimate",energyCost:100,tags:[
    // 奶妈：平倍率 + 抬血最少的队友 + 全体净化。Heal 是固定值，Lv50 血线 2800~4500，450 约等于 10%~16%
    {type:"DamageMultiplier",value:1.0},{type:"Heal",value:450,target:"AllyLowestHp"},{type:"Cleanse",target:"AllyAll"}]},
  {id:"ult_grass_combo",name:"千叶连斩",triggerType:"Ultimate",energyCost:100,tags:[
    // 草刺客的多段：连击 4 → 2（只再给一个出手回合），倍率也压到 0.9
    {type:"DamageMultiplier",value:0.9},{type:"Combo",value:2},{type:"DefDown",value:0.2,chance:0.5,duration:2}]},
  {id:"ult_light_judgment",name:"圣光审判",triggerType:"Ultimate",energyCost:100,tags:[
    // 全体驱散是它的本职，伤害砍到 1.1——原来的 1.8×5 个目标总倍率 900%，直接掀桌
    {type:"DamageMultiplier",value:1.1,target:"EnemyAll"},{type:"Dispel",target:"EnemyAll"}]},
  {id:"ult_dark_assassin",name:"暗影刺杀",triggerType:"Ultimate",energyCost:100,tags:[
    {type:"DamageMultiplier",value:2.0,target:"EnemyLowestHp"},{type:"Pierce",value:0.4},{type:"Lifesteal",value:0.25}]},
  {id:"ult_aoe_slam",name:"地震波",triggerType:"Ultimate",energyCost:100,tags:[
    // 肉盾的大招：全体刮一下 + 自己减伤，**不再带群体眩晕**。
    // 控制词条是按「每个被打到的目标各自过一次概率」结算的，配全体伤害就是全队眩晕，
    // 太超模；要单体控制请把 Control 单独挂到 CurrentTarget 上。
    {type:"DamageMultiplier",value:0.95,target:"EnemyAll"},
    {type:"DamageReduction",value:0.2,target:"Self",duration:2}]},
  {id:"ult_shield_wall",name:"圣盾壁垒",triggerType:"Ultimate",energyCost:100,tags:[
    {type:"DamageMultiplier",value:0.7},{type:"Shield",value:350,target:"AllyAll",duration:3},
    {type:"DefUp",value:0.2,target:"AllyAll",duration:3}]},
  {id:"pas_dodge_30",name:"风之闪避",triggerType:"OnHit",passiveTriggerChance:1.0,tags:[{type:"Dodge",chance:0.3}]},
  {id:"pas_block_40",name:"坚韧格挡",triggerType:"OnHit",passiveTriggerChance:1.0,tags:[{type:"Block",value:0.4,chance:0.4}]},
  {id:"pas_counter_25",name:"反击本能",triggerType:"OnHit",passiveTriggerChance:1.0,tags:[{type:"Counter",value:0.8,chance:0.25}]},
  {id:"pas_immune_stun",name:"免疫眩晕",triggerType:"OnHit",passiveTriggerChance:1.0,tags:[{type:"Immune",duration:1}]},
  {id:"pas_lifesteal_turn",name:"鲜血渴求",triggerType:"OnTurnStart",passiveTriggerChance:1.0,tags:[
    // EnergyGain 原来是 1 —— 那是气势上限还是 0~5 的老数值，摆在 0~200 的体系里等于没有。
    // 顺手修正成 10，Heal 50 → 120（同样理由，Lv50 血线上 50 点就是 1%）。
    {type:"Heal",value:120,target:"Self"},{type:"EnergyGain",value:10}]},
  {id:"pas_revive",name:"不屈意志",triggerType:"OnDeath",passiveTriggerChance:1.0,tags:[{type:"Revive",value:0.3,target:"Self"}]}
  // ============ 秩序龙尊（专属样例，由 DragonSoul* 系列词条支撑） ============
  ,
  {id:"atk_dragon_sovereign",name:"龙息突袭",triggerType:"NormalAttack",tags:[
    // 平a：敌方 + 敌方身后一位（共 2 个 DamageMultiplier tag，分别指定 target）
    {type:"DamageMultiplier",value:2.0,target:"CurrentTarget"},
    {type:"DamageMultiplier",value:2.0,target:"EnemyBehindTarget"}
  ]},
  {id:"ult_dragon_judgment",name:"龙尊圣裁",triggerType:"Ultimate",energyCost:100,tags:[
    {type:"DamageMultiplier",value:3.0,target:"CurrentTarget"},
    {type:"DamageMultiplier",value:3.0,target:"EnemyLowestPower"},
    {type:"DragonSoulRefillOnUlt",value:3}
  ]},
  {id:"pas_dragon_soul_passive",name:"龙魂天威",triggerType:"OnAllyActed",passiveTriggerChance:1.0,tags:[
    // 任意单位出手后（含自己）：按当前龙魂数量连打，每轮消耗 1 个龙魂。
    // 伤害倍率 + 吸怒 75 都收进 DragonSoulAllyRetaliate 的实现里，不在这里拆成两个词条——
    // 拆开的话「龙魂为 0 就不该打」这条判据会漏掉，一魂没有照样能白打一发。
    {type:"DragonSoulAllyRetaliate",value:1.5}
  ]},
  {id:"pas_dragon_soul_init",name:"龙魂觉醒",triggerType:"OnBattleStart",passiveTriggerChance:1.0,tags:[
    {type:"DragonSoulInit",value:1}
  ]},
  {id:"pas_dragon_revive",name:"真龙不死",triggerType:"OnDeath",passiveTriggerChance:1.0,tags:[
    {type:"Revive",value:0.6,target:"Self",once:true}
  ]}
  // ============ 无烬龙尊（群攻 / 毁灭伤害 / 隐身的样例角色）============
  ,
  {id:"atk_dragon_emberless",name:"烬火斩",triggerType:"NormalAttack",tags:[
    // 平a：单体 400%
    {type:"DamageMultiplier",value:4.0,target:"CurrentTarget"}
  ]},
  {id:"ult_dragon_emberless",name:"无烬裁决",triggerType:"Ultimate",energyCost:100,tags:[
    // 大招：400% 打【群攻】*4（随机 4 个敌人），再追加一发 800% 攻击力的【毁灭伤害】打血最少的
    {type:"DamageMultiplier",value:4.0,target:"CurrentTarget"},
    {type:"MultiTarget",value:4},
    {type:"DestructionDamage",value:8.0,target:"EnemyLowestHp"}
  ]},
  {id:"pas_emberless_revive",name:"无烬不灭",triggerType:"OnDeath",passiveTriggerChance:1.0,tags:[
    // 致命伤死亡时：复活一滴血 + 进入【隐身】（永久，队友全灭后失效）
    {type:"Revive",value:0,target:"Self",once:true},
    {type:"Stealth",value:1,duration:-1,target:"Self"}
  ]}
  // ============ 造物以撒（【英雄】特殊职业 + 【免疫】 + 【复活】队友 + 连击的样例）============
  ,
  {id:"atk_isaac",name:"暗蚀之触",triggerType:"NormalAttack",tags:[
    // 平a：单体 100%
    {type:"DamageMultiplier",value:1.0,target:"CurrentTarget"}
  ]},
  {id:"ult_isaac",name:"造物·伪生",triggerType:"Ultimate",energyCost:100,tags:[
    // 大招：200% 单体，打两轮（连击*2）
    {type:"DamageMultiplier",value:2.0,target:"CurrentTarget"},
    {type:"Combo",value:2},
    // 从阵亡池里随机捞一个队友回来，回复 50% 最大生命
    {type:"Revive",value:0.5,target:"FallenAllyRandom"},
    // 给自己挂一层【免疫】，挡下一次直接攻击。放最后：Revive 会清空目标状态，但那清的是被复活的人
    {type:"Immunity",value:1,target:"Self"}
  ]},
  {id:"hero_creation_force",name:"造物之力",triggerType:"HeroSkill",tags:[
    // 英雄条件：己阵光/暗属性角色 ≥ 2 个，否则整条英雄技作废
    {type:"AuraCondition",value:2,elements:["Light","Dark"]},
    // 全队最大生命 +20%（永久，战前就结算）
    {type:"MaxHpUp",value:0.2,target:"AllyAll"},
    // 肉盾职业的队友各拿一层【免疫】
    {type:"Immunity",value:1,target:"AllyTank"}
  ]}
  // ============ 阿瑞斯（草 · 肉盾：受击回血 / 同排连携 / 两条命）============
  ,
  {id:"atk_ares",name:"藤蔓重击",triggerType:"NormalAttack",tags:[
    // 平a：单体 100%
    {type:"DamageMultiplier",value:1.0,target:"CurrentTarget"}
  ]},
  {id:"ult_ares",name:"生生不息",triggerType:"Ultimate",energyCost:100,tags:[
    // 大招：单体 200%，打完给自己挂【生息不止】（受击回 40% 生命；满 3 次把同排最高攻的队友连携出去）
    {type:"DamageMultiplier",value:2.0,target:"CurrentTarget"},
    {type:"VitalityOnHurt",value:0.4,hits:3,target:"Self"}
  ]},
  {id:"pas_ares_king",name:"生命之王",triggerType:"OnBattleStart",passiveTriggerChance:1.0,tags:[
    // 开局：生命上限 +100%（涨出来的血同步补上），并发 2 层【复活储备】
    {type:"MaxHpUp",value:1.0,target:"Self"},
    {type:"ReviveCharge",value:2,target:"Self"}
  ]},
  {id:"pas_ares_revive",name:"生命之王·不朽",triggerType:"OnDeath",passiveTriggerChance:1.0,tags:[
    // 致命伤时扣掉一层【复活储备】，满血站回来。储备是开局发的那 2 层，用完就没了
    {type:"Revive",value:1.0,target:"Self",useCharge:true}
  ]}
  // ============ 诺亚（光 · 攻击：群攻 / 每回合一条命 / 复活即连携）============
  ,
  {id:"atk_noah",name:"时之刃",triggerType:"NormalAttack",tags:[
    // 平a：【群攻】*2，每击 200%
    {type:"DamageMultiplier",value:2.0,target:"CurrentTarget"},
    {type:"MultiTarget",value:2}
  ]},
  {id:"ult_noah",name:"时间洪流",triggerType:"Ultimate",energyCost:100,tags:[
    // 大招：【群攻】*3，每击 300%
    {type:"DamageMultiplier",value:3.0,target:"CurrentTarget"},
    {type:"MultiTarget",value:3}
  ]},
  // fromRound:2 —— **第一个大回合不算数**。进场那回合诺亚必然是满血活人，
  // 开场这条跑一遍纯属白给；从第二大回合开场起才生效。
  {id:"pas_noah_time",name:"时间之子",triggerType:"OnRoundStart",fromRound:2,passiveTriggerChance:1.0,tags:[
    // 每个大回合开场只看一件事：**人是不是死了**。
    //   死了 → 满血复活（顺手给一个【连携】出手回合）
    //   活着 → 把血回满
    // 不发【复活储备】：储备是「回合内被打死、当场爬起来」的耗材，而这条被动已经保证
    // 「每个大回合开场必定满血在场」——再存一条命就是双重复活（开场回满 + 手里还攥着一条命）。
    // Revive 必须写在最前：HealPct 要求「人是活的」，顺序反了刚复活的人吃不到补血
    // （不过 value=1.0 时复活本身就是满血，留着是为了以后改小复活比例也不出错）。
    {type:"Revive",value:1.0,target:"Self",chain:1},
    {type:"HealPct",value:1.0,target:"Self"}
  ]}
  // ============ 修尔（暗 · 速度：禁疗 + 大招暴击 + 抽气势）============
  ,
  {id:"atk_schurr",name:"是非之咬",triggerType:"NormalAttack",tags:[
    // 平a：单体 200%，并给当前目标挂【禁疗】（永久，直到目标复活时抵消或下次死亡后解除）
    {type:"DamageMultiplier",value:2.0,target:"CurrentTarget"},
    {type:"HealBlock",target:"CurrentTarget"}
  ]},
  {id:"ult_schurr",name:"因果裁决",triggerType:"Ultimate",energyCost:100,tags:[
    // 大招：单体 600%，暴击率额外 +40%，再挂永久【禁疗】
    {type:"DamageMultiplier",value:6.0,target:"CurrentTarget"},
    {type:"CritBoost",value:0.4,target:"Self"},
    {type:"HealBlock",target:"CurrentTarget"}
  ]},
  {id:"pas_schurr_pursuit",name:"是非之魔",triggerType:"OnBattleStart",passiveTriggerChance:1.0,tags:[
    // 开场：敌方同横排所有单位气势 -20
    {type:"EnergyDown",value:-20,target:"EnemySameRow"}
  ]}
  // ============ 莉莉丝（草 · 平衡/英雄：嘲讽 + 群体按单体结算 + 复活阵亡 + 大地赐福）============
  ,
  {id:"atk_lilith",name:"蔓生之息",triggerType:"NormalAttack",tags:[
    // 平a：单体 200%（无禁疗，禁疗是修尔的专属）
    {type:"DamageMultiplier",value:2.0,target:"CurrentTarget"}
  ]},
  {id:"ult_lilith",name:"圣灵庇佑",triggerType:"Ultimate",energyCost:100,tags:[
    // 大招：单体 300% + 给自己挂【嘲讽】-1（永久，触发后本回合就在嘲讽）
    // + 【圣灵庇佑】被动：死后随机复活一个阵亡角色（含自己）满血在场
    {type:"DamageMultiplier",value:3.0,target:"CurrentTarget"},
    {type:"Taunt",value:-1,duration:-1,target:"Self"},
    {type:"Revive",value:1.0,target:"FallenAllyRandom",once:true}
  ]}
  // 莉莉丝的【英雄技】：大地赐福。草属性 ≥2 时：
  //   1. 全队血上限 +20%（战前结算，永久）
  //   2. 草属性角色挂【气势免疫】（在引擎里让 EnergyDown 对其无效）
  //   3. 草属性角色每次放大招后立刻回满气势（在引擎里 executeSkill 末尾检测）
  // 效果（1）走 MaxHpUp，（2）走新的 EnergyImmunity 标志，
  // （3）放在引擎里检测「招式结束 + 草属性 + aura 已激活」三件套
  ,
  {id:"hero_lilith_gift",name:"大地赐福",triggerType:"HeroSkill",tags:[
    {type:"AuraCondition",value:2,elements:["Grass"]},
    {type:"MaxHpUp",value:0.2,target:"AllyAll"},
    {type:"EnergyImmunity",value:1,target:"AllyGrass"}
  ]}

  // ============ 昆仑（草 · 攻击 / 通灵师：连攻 + 通灵点 + 通灵变身）============
  // 昆仑是"通灵师"职业（specialClass:"spirit"），靠队友出手积通灵点，满 7 触发变身：
  //   HP ×2 / ATK ×1.6 / 满血复活（无视禁疗）/ 1 连携。
  // 平 a：200% × 2（连攻 2 次）；大招：300% × 3（连攻 3 次）。
  // 被动【创界破军】：己方存活 < 敌方存活时，连攻次数 +1（由 RepeatBoost 词条承载）。
  ,
  {id:"atk_kunlun",name:"裂空三叉",triggerType:"NormalAttack",tags:[
    {type:"DamageMultiplier",value:2.0,target:"CurrentTarget"},
    {type:"Repeat",value:2},
    {type:"RepeatBoost",value:1,condition:"Outnumbered",source:"创界破军"}
  ]},
  {id:"ult_kunlun",name:"通灵·破天击",triggerType:"Ultimate",energyCost:100,tags:[
    {type:"DamageMultiplier",value:3.0,target:"CurrentTarget"},
    {type:"Repeat",value:3},
    {type:"RepeatBoost",value:1,condition:"Outnumbered",source:"创界破军"}
  ]},
  {id:"pas_kunlun_pursuit",name:"创界破军",triggerType:"OnBattleStart",passiveTriggerChance:1.0,tags:[]}
  // 创界破军的实际效果由 RepeatBoost 词条承载（在 executeSkill 解析阶段按 condition
  // 给 dmgHit.repeat 累加）。把 condition 写在词条里是为了 UI 能直接渲染出
  // 「条件连攻 +1（己方人数劣势）」这个 chip，让玩家在技能描述里看到触发条件。

  // ============ 诺雅（光 · 平衡 / 通灵师：群攻 + 通灵点 +8 / 星月同辉免气势消耗）============
  // 诺雅是"通灵师"职业（specialClass:"spirit"），靠光/暗属性队友每次出手 +2 通灵点，
  // 其他元素 +1。与昆仑的区别：
  //   ① 通灵阈值 8（昆仑 7），但加速更快——队伍里多放光暗角色就比昆仑快满。
  //   ② 平 a / 大招都是【群攻】，不是连攻——更吃阵型、走"清扫流"。
  //   ③ 被动【星月同辉】完免气势降低，包括大招消耗——本质是"无限大招"。
  ,
  {id:"atk_noya",name:"星芒·散射",triggerType:"NormalAttack",tags:[
    {type:"DamageMultiplier",value:2.0},
    {type:"MultiTarget",value:2}
  ]},
  {id:"ult_noya",name:"月华·广域",triggerType:"Ultimate",energyCost:100,tags:[
    {type:"DamageMultiplier",value:3.0},
    {type:"MultiTarget",value:3}
  ]},
  {id:"pas_noya_stellar",name:"星月同辉",triggerType:"OnBattleStart",passiveTriggerChance:1.0,tags:[
    {type:"EnergyDrainImmunity"}
  ]}
  // 星月同辉：进入战斗时设置 unit.energyDrainImmunity=true，所有气势降低路径
  // （含大招释放后的清零、敌方【气势吸取】、【气势降低】debuff 等）直接落空。
  // 注意：基线气势增长仍然走原路径，星月同辉只是"不降"而不是"无中生有"。
];

// 旧数据迁移：眩晕 / 冰冻 统一为【控制】（通用词条合并后的兼容处理）
for(const s of SKILLS) for(const t of (s.tags||[])) t.type = normTagType(t.type);

/* ================================================================
 * 【星神】—— 角色养成里的装配系统
 *   每个角色 4 个槽位，开局自动生效，不用点、不用触发、驱散不掉。
 *   效果全部落在「开局」这一个时间点上，所以实现上不挂状态、不进战斗管线，
 *   直接在 BattleUnit 构造时结算（见构造函数里的 star* 字段）。
 *   为什么不复用 bonusCritChance / bonusDodgeChance：那两个在 processTurnEnd
 *   里每回合都被清零，是留给【暴击加成】【闪避加成】这类单回合 buff 的，
 *   星神塞进去只能爽一个回合。所以暴击/闪避/格挡各自单开字段。
 * ================================================================ */
const STAR_GODS = {
  energy: {id:"energy", n:"气势星神", s:"势", c:"#e67e22", icon:"☄",
    v:"开局气势 +50",
    desc:"开局增加 50 点气势。基础开局是 50，装上它刚好 100 —— 第一个大回合就能放大招。",
    apply:{energy:50}},
  atk:    {id:"atk",    n:"攻击星神", s:"攻", c:"#d0453c", icon:"⚔",
    v:"攻击力 +20%",
    desc:"开局增加 20% 攻击力。直接乘进伤害公式，不占状态位、不会被【驱散】扒掉。",
    apply:{atkPct:0.20}},
  crit:   {id:"crit",   n:"暴击星神", s:"暴", c:"#e74c3c", icon:"✹",
    v:"暴击率 +30%",
    desc:"开局增加 30% 暴击率。和角色自带的 20% 基础暴击率相加，装上就是 50%。",
    apply:{critChance:0.30}},
  dodge:  {id:"dodge",  n:"闪避星神", s:"闪", c:"#3498db", icon:"✦",
    v:"闪避概率 +20%",
    desc:"开局增加 20% 闪避概率。闪避成功本次伤害直接归零，判定顺序在暴击之前。",
    apply:{dodgeChance:0.20}},
  block:  {id:"block",  n:"格挡星神", s:"挡", c:"#2f6fb5", icon:"◈",
    v:"格挡率 +20%，格挡减伤 50%",
    desc:"开局增加 20% 格挡率。格挡触发时本次受伤降低 50%；【毁灭伤害】不吃格挡，照样打满。",
    apply:{blockChance:0.20, blockValue:0.5}},
};
const STAR_GOD_ORDER = ["energy","atk","crit","dodge","block"];
const MAX_STAR_GODS = 4;
// 新角色的默认装配：一个【气势星神】，开局 50 + 50 = 100 气势
const STAR_GOD_DEFAULT = "energy";

/**
 * 把每个角色的 starGods 规范化成 4 个槽位（空槽为 null），顺手丢掉不认识的星神 id。
 *
 * 必须在两处调用：CHARS 定义之后、以及 DataIO.load 之后。
 * 漏掉第二次的话，老存档里的角色对象（没有 starGods 字段，而 mergeById 是整条替换）
 * 加载后就不带星神了 —— 用户刷新一下，默认加成凭空消失。
 */
function ensureStarGods(){
  for(const c of CHARS){
    const src = Array.isArray(c.starGods) ? c.starGods : [STAR_GOD_DEFAULT];
    const fixed = [];
    for(let i=0;i<MAX_STAR_GODS;i++){
      const k = src[i];
      fixed.push(k && STAR_GODS[k] ? k : null);
    }
    c.starGods = fixed;
  }
}

let CHARS = [
  {id:"char_fire_dps",name:"烈焰精灵",charClass:"attack",maxHp:3200,atk:850,def:200,spd:120,element:"Fire",normalAttackId:"atk_fire",ultimateId:"ult_fire_storm",passiveIds:["pas_counter_25"],startingEnergy:50},
  {id:"char_water_healer",name:"水灵仙子",charClass:"balance",maxHp:2800,atk:600,def:250,spd:100,element:"Water",normalAttackId:"atk_water",ultimateId:"ult_water_heal",passiveIds:["pas_dodge_30"],startingEnergy:50},
  {id:"char_grass_assassin",name:"草影刺客",charClass:"attack",maxHp:2600,atk:900,def:150,spd:140,element:"Grass",normalAttackId:"atk_grass",ultimateId:"ult_grass_combo",passiveIds:["pas_counter_25"],startingEnergy:50},
  {id:"char_light_tank",name:"光辉守卫",charClass:"tank",maxHp:4500,atk:500,def:400,spd:80,element:"Light",normalAttackId:"atk_light",ultimateId:"ult_shield_wall",passiveIds:["pas_block_40","pas_immune_stun"],startingEnergy:50},
  {id:"char_dark_mage",name:"暗影法师",charClass:"attack",maxHp:3000,atk:780,def:180,spd:110,element:"Dark",normalAttackId:"atk_dark",ultimateId:"ult_dark_assassin",passiveIds:["pas_lifesteal_turn"],startingEnergy:50},
  {id:"char_grass_warrior",name:"翠叶战士",charClass:"tank",maxHp:3500,atk:700,def:280,spd:95,element:"Grass",normalAttackId:"atk_grass",ultimateId:"ult_aoe_slam",passiveIds:["pas_block_40"],startingEnergy:50},
  {id:"char_light_dps",name:"光明祭司",charClass:"balance",maxHp:2900,atk:820,def:190,spd:105,element:"Light",normalAttackId:"atk_light",ultimateId:"ult_light_judgment",passiveIds:["pas_dodge_30"],startingEnergy:50},
  {id:"char_fire_brave",name:"火焰勇者",charClass:"balance",maxHp:3800,atk:750,def:300,spd:90,element:"Fire",normalAttackId:"atk_fire",ultimateId:"ult_aoe_slam",passiveIds:["pas_revive"],startingEnergy:50}
  ,
  {id:"char_dragon_sovereign",name:"秩序龙尊",charClass:"speed",maxHp:4200,atk:920,def:260,spd:115,element:"Light",normalAttackId:"atk_dragon_sovereign",ultimateId:"ult_dragon_judgment",passiveIds:["pas_dragon_soul_init","pas_dragon_soul_passive","pas_dragon_revive"],startingEnergy:50,portrait:"assets/img/char_dragon_sovereign.webp"}
  ,
  {id:"char_dragon_emberless",name:"无烬龙尊",charClass:"attack",maxHp:3800,atk:1000,def:230,spd:112,element:"Fire",normalAttackId:"atk_dragon_emberless",ultimateId:"ult_dragon_emberless",passiveIds:["pas_emberless_revive"],startingEnergy:50,portrait:"assets/img/char_dragon_emberless.webp"}
  ,
  // 造物以撒：平衡职业决定属性曲线，英雄是叠加在上面的特殊职业（见 SPECIAL_CLASS_META）
  {id:"char_isaac",name:"造物以撒",charClass:"balance",specialClass:"hero",maxHp:3400,atk:760,def:260,spd:108,element:"Dark",normalAttackId:"atk_isaac",ultimateId:"ult_isaac",heroSkillId:"hero_creation_force",passiveIds:[],startingEnergy:50,portrait:"assets/img/char_isaac.webp"}
  ,
  // 阿瑞斯：草系肉盾。靠大招挂的【生息不止】站桩（挨打回 40% 血），挨满 3 次把同排攻击最高的
  // 队友连携出去；被动「生命之王」开局双倍血上限 + 两条满血命。慢速、低攻，纯前排。
  {id:"char_ares",name:"阿瑞斯",charClass:"tank",maxHp:4400,atk:520,def:380,spd:85,element:"Grass",normalAttackId:"atk_ares",ultimateId:"ult_ares",passiveIds:["pas_ares_king","pas_ares_revive"],startingEnergy:50,portrait:"assets/img/char_ares.webp"}
  ,
  // 诺亚：光系攻击手。平a【群攻】*2、大招【群攻】*3，清场能力拉满；
  // 「时间之子」每个大回合开场结算一次——死了就满血复活（附带一个出手回合），
  // 活着就回满血。不攒复活储备，靠的是"每回合必然满血在场"。血薄但极难打死。
  {id:"char_noah",name:"诺亚",charClass:"attack",maxHp:3100,atk:880,def:190,spd:115,element:"Light",normalAttackId:"atk_noah",ultimateId:"ult_noah",passiveIds:["pas_noah_time"],startingEnergy:50,portrait:"assets/img/char_noah.webp"}
  ,
  // 修尔：暗系速度。靠【禁疗】让敌方核心回血/复活位一回合沉默，
  // 大招自带暴击加成 + 双回合禁疗；被动"是非之魔"开场把敌方同横排气势拉低 20。
  {id:"char_schurr",name:"修尔",charClass:"speed",maxHp:2900,atk:720,def:170,spd:135,element:"Dark",normalAttackId:"atk_schurr",ultimateId:"ult_schurr",passiveIds:["pas_schurr_pursuit"],startingEnergy:50,portrait:"assets/img/char_schurr.webp"}
  ,
  // 莉莉丝：草系平衡 + 英雄。大招后自带嘲讽 + 死亡复活阵亡角色；
  // 英雄技"大地赐福"：草属性≥2时全队血 +20%、草属性免疫气势降低、草属性大招后回满气势。
  {id:"char_lilith",name:"莉莉丝",charClass:"balance",specialClass:"hero",maxHp:4200,atk:560,def:360,spd:100,element:"Grass",normalAttackId:"atk_lilith",ultimateId:"ult_lilith",heroSkillId:"hero_lilith_gift",passiveIds:[],startingEnergy:50,portrait:"assets/img/char_lilith.webp"}
  ,
  // 昆仑：草属性 / 攻击型 / 通灵师。数值定位"半肉输出"：比修尔肉、比修尔高攻，
  // 通灵点满 7 之后 HP×2 / ATK×1.6，整场变成主 T + 主输出。
  {id:"char_kunlun",name:"昆仑",charClass:"attack",specialClass:"spirit",maxHp:3800,atk:780,def:160,spd:110,element:"Grass",normalAttackId:"atk_kunlun",ultimateId:"ult_kunlun",passiveIds:["pas_kunlun_pursuit"],startingEnergy:50,portrait:"assets/img/char_kunlun.webp"},
  // 诺雅：光属性 / 平衡型 / 通灵师。数值定位"脆皮爆发"：高攻低防，满 8 触发变身。
  // 通灵规则：只有光/暗属性的队友**主动攻击出手**才给她 +2 通灵点（固定值，不乘攻击次数），
  // 其他属性出手不给点。被动【星月同辉】完全免疫气势降低——放完大招气势不归零；
  // 且气势**无上限**（infiniteEnergy），开大还会额外 +50 气势，越打越多、大招越放越疼。
  {id:"char_noya",name:"诺雅",charClass:"balance",specialClass:"spirit",maxHp:3000,atk:820,def:180,spd:120,element:"Light",normalAttackId:"atk_noya",ultimateId:"ult_noya",passiveIds:["pas_noya_stellar"],startingEnergy:50,spiritThreshold:8,spiritGain:"lightdark",infiniteEnergy:true,portrait:"assets/img/char_noya.webp"}
];
// 【星神】槽位规范化（默认每人一个【气势星神】）。注意 DataIO.load 之后还要再跑一次，
// 因为存档里的角色是整条替换进来的，不带 starGods 字段。
ensureStarGods();

// 队伍阵地：9 个位置槽，索引 0-2 前排 / 3-5 中排 / 6-8 后排
// 索引与 gridPosition 一致，对应单元格 HTML data-pos
let TEAMS = {
  player:{name:"我方",positions:[null,null,null,null,null,null,null,null,null]},
  enemy:{name:"敌方",positions:[null,null,null,null,null,null,null,null,null]}
};

// 平衡常数：通过对战胜率反推得出，避免开局满势大招秒杀
// 玩家阵容较弱（4/9 位置），敌方满员（5/9）
const PLAYER_LV_OFFSET = -3;  // 玩家全员比敌方低 3 级，平衡高气势带来的优势
const ENEMY_LV_OFFSET  = +3;

// ===== 职业系统 =====
// 4 种基础职业：速度 / 肉盾 / 攻击 / 平衡
//   cls  —— 战斗时的默认站位倾向建议（front 承伤 / mid 输出 / back 后排）
//   grow —— 该职业推荐的成长倾向 key（对应 GROWTH_STYLE_PRESETS）
//   tag  —— 职业定位标签，展示用
const CLASS_META = {
  speed:  {n:"速度", c:"#0aa3a3", icon:"⚡", cls:"mid",
           tag:"抢手 / 先手爆发",
           grow:"support",
           desc:"速度成长最高，靠提前出手压制。抢在对手前排站稳前完成第一轮输出或控制，适合带眩晕、气势吸取、连击类词条。血防偏低，被集火容易倒。",
           pick:"优先上攻击型或控制型词条；站位建议中排，让前排先扛住第一波。"},
  tank:   {n:"肉盾", c:"#2f6fb5", icon:"🛡", cls:"front",
           tag:"承伤 / 保护后排",
           grow:"tank",
           desc:"生命与防御成长最高，攻击偏低。作用是站前排吸收伤害、用嘲讽把敌方火力拉到自己身上，为后排争取出手时间。",
           pick:"优先上格挡、护盾、减伤、嘲讽、复活类词条；必站前排。"},
  attack: {n:"攻击", c:"#d0453c", icon:"⚔", cls:"mid",
           tag:"高倍率 / 收割",
           grow:"assassin",
           desc:"攻击成长最高，血防最低。单体高倍率与暴击、穿透、连击吃得最多，是主要输出来源。生存靠队友或闪避兜底。",
           pick:"优先上倍率、暴击、穿透、连击、吸血类词条；站位中排或后排。"},
  balance:{n:"平衡", c:"#6b5bd2", icon:"⚖", cls:"mid",
           tag:"全能 / 补位",
           grow:"warrior",
           desc:"四项属性都不冒尖也不拖后腿。既能补一点输出，也能扛一点伤害，适合当队伍的第二顺位补位，或用来带功能性技能（治疗、净化、驱散）。",
           pick:"按队伍缺什么补什么；既能站前排也能站中排。"},
};
function clsMeta(k){ return CLASS_META[k] || {n:"未定", c:"#95a5a6", icon:"?", tag:"—", desc:"未分配职业", pick:"—"}; }
// 职业徽章小标签
function clsBadge(k, big){
  const m = clsMeta(k);
  const r = big ? "border-radius:12px;padding:3px 12px;font-size:12px" : "border-radius:8px;padding:1px 7px;font-size:10px";
  return `<span style="background:${m.c};color:#fff;${r};display:inline-block;white-space:nowrap">${m.icon} ${m.n}</span>`;
}

// ===== 特殊职业 =====
// 和基础职业是**两层并行**的标签：基础职业决定属性成长倾向与站位建议，特殊职业决定
// 这个角色额外背了什么独有机制。一个角色可以两者都有（造物以撒 = 平衡 + 英雄）。
// 目前只有【英雄】一种，但结构留成通用的（多一种特殊职业只需往这里加一项）。
const SPECIAL_CLASS_META = {
  hero: {n:"英雄", c:"#c9a227", icon:"★",
    tag:"英雄技 / 全队光环",
    desc:"英雄背的是「英雄技」——一件在战斗开始前就结算完的团队级效果，通常带条件（比如阵容里必须有 N 个指定属性的角色），条件满足整队吃 buff，不满足就白带。英雄本身不靠英雄技打输出，它改变的是整场战斗的起点。",
    pick:"配队时优先凑齐英雄技的属性条件，否则这个位置等于少一条被动。英雄技给的 buff 是永久且战前生效的，越早满编收益越大。"},
};
function specMeta(k){ return SPECIAL_CLASS_META[k] || null; }
// 特殊职业徽章：金色描边 + 实心金底，和基础职业徽章一眼区分
function specBadge(k, big){
  const m = specMeta(k);
  if(!m) return "";
  const r = big ? "border-radius:12px;padding:3px 12px;font-size:12px" : "border-radius:8px;padding:1px 7px;font-size:10px";
  return `<span style="background:${m.c};color:#fff;${r};display:inline-block;white-space:nowrap;box-shadow:0 0 0 1px #fff inset">${m.icon} ${m.n}</span>`;
}

// ===== 词条/触发/目标/元素 中文化（仅展示层，运行时枚举仍为英文）=====
// 每项字段：
//   n    中文名
//   s    短名（战斗日志/紧凑徽章用）
//   c    颜色
//   cat  分类：dmg=伤害 / def=防御 / st=状态 / fn=功能 / own=专属资源
//   v    数值含义提示（词条表里展示「value 代表什么」）
//   tgt  是否用得上 target 字段
//   desc 基本含义（一句话讲清这词条干什么）
const TAG_META = {
  // ---------- 伤害类 ----------
  DamageMultiplier:{n:"倍击",     s:"倍",   c:"#e74c3c", cat:"dmg", v:"倍率（200% 填 2.0）", tgt:1,
    desc:"本次攻击的基础伤害倍率。伤害 = 施法者攻击 × 倍率，经过防御减免后落到目标身上。是所有输出技能的核心词条。"},
  MultiTarget:   {n:"群攻",      s:"群",   c:"#d0453c", cat:"dmg", v:"随机选取的目标个数 n", tgt:0,
    desc:"【群攻】*n：本次出手的攻击范围改成「随机 n 个敌方目标」，这几个目标是**同时**结算的——伤害一起跳、血条一起掉，回放里整组一帧播完，不会一个一个慢慢演。活着的敌人不足 n 个时有多少打多少，同一个目标不会重复结算。和【连击】的分工：连击是同一个目标挨好几次、逐次播放；群攻是一批目标同时挨打、一次播完。"},
  DestructionDamage:{n:"毁灭伤害", s:"灭",  c:"#8e44ad", cat:"dmg", v:"自身攻击力倍率（8.0=800%）", tgt:1,
    desc:"真实伤害的正式名：按「施法者攻击力 × 倍率」算出，无视防御 / 减伤 / 护盾 / 格挡 / 元素克制，直接扣血，也不参与暴击判定。目标在**主体伤害结算完之后**才挑，且只挑存活单位——所以「对血量最低单位造成毁灭伤害」是补刀语义，不会落到刚被打死的单位身上。【毁灭伤害】同时是本作持续伤害的统一度量：中毒 / 灼烧 / 流血每回合扣的血都按它结算，所以这几类减伤和护盾都挡不住。"},
  Combo:         {n:"连击",      s:"连",   c:"#e74c3c", cat:"dmg", v:"总出手次数（2 = 本体 1 次 + 额外 1 个回合）", tgt:1,
    desc:"【连击】是**再给一个出手回合**，不是同一个技能多打几下。每个额外回合按当时的气势重新决定放什么：气势够就再放一次大招，气势不够就自动执行一次平a并回气势 +50。额外回合不再派生额外回合。表现上逐次播放、伤害一个一个跳（这正是它和【群攻】同时结算的区别）。和【连携】的关系：都由同一套「额外出手回合」逻辑执行，区别在谁发起——连击是施法者自己放完接着打，连携是别人点名你、你立刻动。"},
  Chain:         {n:"连携",      s:"携",   c:"#e74c3c", cat:"dmg", v:"立刻获得的出手回合数", tgt:1,
    desc:"【连携】是**别的效果发给你的一个立刻出手回合**。和【连击】共用同一套额外回合逻辑（按当时气势决定再放大招还是平a，平a 回 50 气势），差别只在于发起方：连击写在技能自己的词条里、施法者放完本体接着打；连携由外部点名触发——阿瑞斯受击满 3 次把同排攻击最高的队友连携出去、诺亚每次被复活给自己补一个回合。连携打出的那个回合里不会再触发连锁携（有递归守卫），否则能互相点到自己转死。"},
  Repeat:        {n:"连攻",      s:"连攻", c:"#e74c3c", cat:"dmg", v:"重复释放次数（绑定到上一个 dmgHit 上）", tgt:1,
    desc:"【连攻】让上一个 dmgHit 对同一个 target 连续释放 N 次。语义是「单体连打」，不是【群攻】的一次打 N 个、也不是【连击】的额外出手回合——同 target 挨 N 下 200% = 等效 200% × N。昆仑的平 a / 大招都走这条路：平 a 200% × 2 = 一次出手合计 400%；大招 300% × 3 = 一次出手合计 900%。溅射 / 真伤只在最后一次打完后再算一次，不会被连攻带成 N 倍。创界破军（昆仑被动）动态 +1 不通过这个词条，直接在引擎里把 dmgHit.repeat 累加。"},
  RepeatBoost:   {n:"条件连攻",  s:"+连攻",c:"#e74c3c", cat:"dmg", v:"条件触发时累加的连攻次数", tgt:0,
    desc:"【条件连攻】给当前技能的所有 dmgHit.repeat 累加 value。条件由 condition 字段决定（Outnumbered = 己方存活 < 敌方存活）。昆仑的创界破军就是这条：己方人数劣势时，平 a / 大招的连攻次数再多 1。和【连攻】的区别是条件触发，不是每次都加。"},
  Crit:          {n:"暴击",      s:"暴",   c:"#e74c3c", cat:"dmg", v:"暴击倍率（1.5=150%）", tgt:0,
    desc:"所有角色自带 20% 基础暴击率、150% 基础暴击伤害。这个词条在其上追加暴击概率（看 chance），并可把暴击倍率换成 value。chance=1 表示必定暴击。"},
  TrueDamage:    {n:"真实伤害",  s:"真",   c:"#e74c3c", cat:"dmg", v:"自身攻击力倍率（8.0=800%）", tgt:1,
    desc:"无视防御、护盾、减伤、格挡与元素克制，直接按「自身攻击力 × 倍率」扣血。【毁灭伤害】是同一条结算路径的正式名，写哪个都一样。"},
  Pierce:        {n:"穿透",      s:"穿",   c:"#e74c3c", cat:"dmg", v:"无视防御百分比（0.3=30%）", tgt:0,
    desc:"结算防御减免时，按比例无视目标的防御值。对高防单位收益最大。"},
  Splash:        {n:"溅射",      s:"溅",   c:"#e74c3c", cat:"dmg", v:"溅射倍率", tgt:1,
    desc:"主目标之外的相邻单位受到额外伤害，倍率按 value 计算。用来同时清理同排多个敌人。"},
  FollowUp:      {n:"追击",      s:"追",   c:"#e74c3c", cat:"dmg", v:"追击倍率", tgt:1,
    desc:"主伤害结算完后，再对指定目标补一次攻击。与连击的区别是追击可以换目标。"},
  Counter:       {n:"反击",      s:"反",   c:"#e74c3c", cat:"dmg", v:"反击倍率", tgt:0,
    desc:"受到攻击后按概率回击攻击者一次。反击不额外获得气势，避免形成滚雪球。"},
  Lifesteal:     {n:"吸血",      s:"嗜",   c:"#e74c3c", cat:"dmg", v:"吸血比例（0.3=30%）", tgt:0,
    desc:"按本次造成伤害的比例回复自身生命。续航类词条，配合高倍率技能收益明显。"},
  // ---------- 防御类 ----------
  Dodge:         {n:"闪避",      s:"闪",   c:"#3498db", cat:"def", v:"闪避概率（0.3=30%）", tgt:0,
    desc:"受到攻击时按概率完全躲开，本次伤害归零。判定顺序在暴击之前，闪避成功则对方后续所有伤害结算全部跳过。"},
  Block:         {n:"格挡",      s:"挡",   c:"#3498db", cat:"def", v:"格挡概率（value 是触发时的减伤比例）", tgt:0,
    desc:"受到攻击时按概率触发，触发时按 value 削减本次伤害——【格挡星神】给的【格挡】固定减 50%。判定在防御减免之后、护盾之前，是肉盾的基础抗压手段。【毁灭伤害】不吃格挡，真实伤害照样打满。"},
  // 注意：这条是「免疫负面状态」，和下面新增的【免疫】（挡一次伤害）不是一回事。
  // 中文名特意改成「状态免疫」，避免和 Immunity 撞名。
  Immune:        {n:"状态免疫",  s:"免控", c:"#3498db", cat:"def", v:"1=免疫负面状态", tgt:0,
    desc:"免疫负面状态（控制、中毒、灼烧、各类减益）。让角色不吃控制链，保持稳定出手和气势循环。注意它只对「状态」生效——伤害照吃。要挡伤害请用【免疫】（Immunity）。"},
  Immunity:      {n:"免疫",      s:"免伤", c:"#2f6fb5", cat:"def", v:"免疫次数（1 = 挡下一次直接攻击）", tgt:1,
    desc:"【免疫】持有者可以无效化接下来 value 次**直接攻击伤害**——那几次攻击的伤害直接归零，闪避/暴击/防御/护盾全部跳过。次数型资源：不用就一直留着，用一次扣一层。唯一挡不住的是【毁灭伤害】——真实伤害走 takeDamage({true:true})，从【免疫】判定旁边绕过去，所以毒伤/灼烧/毁灭伤害照样吃满。溢出保护：闪避成功的那次攻击不算「直接命中」，不消耗免疫层数。"},
  MaxHpUp:       {n:"生命上限",  s:"生↑",  c:"#27ae60", cat:"def", v:"提升比例（0.2 = +20%）", tgt:1,
    desc:"按比例提升目标的最大生命值，并同步补上等量的当前生命（不会出现「上限涨了但血没回」）。永久生效，是英雄技/光环类效果的主力词条。加成会同时影响按最大生命比例结算的东西——比如灼烧伤害会跟着变高。"},
  Shield:        {n:"护盾",      s:"盾",   c:"#3498db", cat:"def", v:"护盾值", tgt:1,
    desc:"获得一层可吸收伤害的护盾。多个护盾按层依次抵扣，全部耗尽后才扣真实血量。"},
  DamageReduction:{n:"减伤",     s:"减",   c:"#3498db", cat:"def", v:"减伤比例（0.3=30%）", tgt:0,
    desc:"按比例削减最终受到的伤害。与防御减免是乘法叠加，是承伤角色的关键属性。"},
  Taunt:         {n:"嘲讽",      s:"嘲",   c:"#3498db", cat:"def", v:"持续回合", tgt:0,
    desc:"强制敌方把攻击目标改为自己。用来保护后排脆皮，把火力集中到坦克身上。"},
  Cleanse:       {n:"净化",      s:"净",   c:"#3498db", cat:"def", v:"1=净化", tgt:1,
    desc:"移除目标身上的负面状态。反制中毒、流血、眩晕等持续效果。"},
  // ---------- 控制 / 状态类 ----------
  Control:       {n:"控制",      s:"控",   c:"#e67e22", cat:"st", v:"控制次数（1 = 让目标下一次攻击放空）", tgt:1,
    desc:"【控制】目标的下一次攻击无法出手，这一次行动直接被跳过。如果它本该放大招，大招同样放不出来，而且不消耗气势——所以控制本质上是在拖慢对方的气势循环。多次控制按次数累加，不会互相覆盖。"},
  Stealth:       {n:"隐身",      s:"隐",   c:"#8e44ad", cat:"own", v:"1=进入隐身（永久，无回合数）", tgt:1,
    desc:"【隐身】只要己方还有别的单位活着，持有者就不会被敌方选为攻击目标（普攻索敌、血量最低、战力最低、群攻随机全部跳过它）。等队友全灭后隐身自动失效。用来拖时间、保核心输出。"},
  Poison:        {n:"中毒",      s:"毒",   c:"#e67e22", cat:"st", v:"每回合伤害", tgt:1,
    desc:"目标每个回合开始损失固定生命，持续若干回合。伤害按【毁灭伤害】结算，无视防御与护盾，适合磨高血量的肉盾。"},
  Burn:          {n:"灼烧",      s:"烧",   c:"#e67e22", cat:"st", v:"每回合伤害（按最大生命比例）", tgt:1,
    desc:"持续伤害状态，按目标最大生命的比例扣血，同样按【毁灭伤害】结算。血越厚的目标烧得越狠。"},
  Bleed:         {n:"流血",      s:"血",   c:"#e67e22", cat:"st", v:"每回合伤害", tgt:1,
    desc:"持续伤害状态，每回合开始固定扣血，按【毁灭伤害】结算。多段叠加时收益递增。"},
  AtkUp:         {n:"攻击增益",  s:"攻↑",  c:"#27ae60", cat:"st", v:"提升比例 + 持续回合", tgt:1,
    desc:"临时提升目标攻击力，持续指定回合数。用于爆发前的自我强化或给主力加 buff。"},
  AtkDown:       {n:"攻击减益",  s:"攻↓",  c:"#e67e22", cat:"st", v:"降低比例 + 持续回合", tgt:1,
    desc:"临时降低目标攻击力。削弱敌方主力的输出，等于变相提升己方生存。"},
  DefUp:         {n:"防御增益",  s:"防↑",  c:"#27ae60", cat:"st", v:"提升比例 + 持续回合", tgt:1,
    desc:"临时提升目标防御，减少受到的伤害。开局给前排挂上收益最明显。"},
  DefDown:       {n:"防御减益",  s:"防↓",  c:"#e67e22", cat:"st", v:"降低比例 + 持续回合", tgt:1,
    desc:"扒掉目标一部分防御，让高倍率爆发能真正打穿肉盾。"},
  SpdUp:         {n:"速度增益",  s:"速↑",  c:"#27ae60", cat:"st", v:"提升比例 + 持续回合", tgt:1,
    desc:"提升目标速度，改变出手顺序。速度是本作决定先手的关键属性，抢到先手往往决定胜负。"},
  SpdDown:       {n:"速度减益",  s:"速↓",  c:"#e67e22", cat:"st", v:"降低比例 + 持续回合", tgt:1,
    desc:"压低目标速度，把它推到出手序列后面。配合控制链能让对方整轮无法行动。"},
  // ---------- 功能类 ----------
  Heal:          {n:"治疗",      s:"愈",   c:"#27ae60", cat:"fn", v:"治疗量", tgt:1,
    desc:"回复目标生命值，不超过其最大生命。数值是**固定值**，不跟着血量上限走——低等级时看着很够用，到了百级血线上就显得杯水车薪。要按血量比例回血用【比例治疗】。"},
  HealPct:       {n:"比例治疗",  s:"愈%",  c:"#27ae60", cat:"fn", v:"按最大生命回复的比例（1.0 = 回满）", tgt:1,
    desc:"按目标**最大生命**的比例回血，value=1.0 就是直接回满。相比固定值的【治疗】，它跟着血上限走，越肉的队友吃这一口越赚；缺点是奶脆皮时会溢出。"},
  Revive:        {n:"复活",      s:"生",   c:"#27ae60", cat:"fn", v:"复活时回复的生命比例（0.6=60%）", tgt:1,
    desc:"单位阵亡时将其救回战场，并回复一定比例生命。填 once=1 表示整场战斗只生效一次；填 useCharge=1 则改成消耗【复活储备】，储备扣完就复活不了（阿瑞斯的「生命之王」、诺亚的「时间之子」都走这条）；再填 chain=1 可以做到「每次被复活顺手给一个【连携】出手回合」。"},
  ReviveCharge:  {n:"复活储备",  s:"备生", c:"#27ae60", cat:"fn", v:"发放的复活次数（cap = 囤积上限）", tgt:1,
    desc:"给目标记若干次「死了能满血回来」的额度。它本身不复活任何人，只是充能；真正救人靠带 useCharge 的【复活】词条，每复活一次扣 1 层。cap 用来封顶，防止每回合都发、越攒越多——诺亚就是每回合补 1 层、上限 1 层，即「每个大回合手里刚好攥着一条命」。"},
  Dispel:        {n:"驱散",      s:"驱",   c:"#27ae60", cat:"fn", v:"1=驱散", tgt:1,
    desc:"移除目标身上的增益状态。针对敌方核心 buff，是攻破护盾/强化阵容的手段。"},
  EnergyGain:    {n:"气势获得",  s:"势↑",  c:"#9b59b6", cat:"fn", v:"获得气势点数", tgt:1,
    desc:"直接增加气势值。气势到 100 就会自动放大招，而且气势越高大招伤害越高（175 气势开大 = 1.75 倍），所以充能词条的实际收益比看上去更大。"},
  EnergyDrain:   {n:"气势吸取",  s:"势吸", c:"#9b59b6", cat:"fn", v:"吸取气势点数", tgt:1,
    desc:"降低目标气势值，把它的大招往后拖。秩序龙尊的龙魂反击就带这个效果。"},
  EnergyDown:    {n:"气势降低",  s:"势↓", c:"#9b59b6", cat:"fn", v:"降低气势点数（可负）", tgt:1,
    desc:"直接扣气势。负数（-20）就当扣 20 点用；与【气势吸取】的区别——吸取走「目标给到施法者」（用于龙魂反击），降低就是单纯地把目标气势扣下去，不转移。"},
  EnergyImmunity:{n:"气势免疫",  s:"势免", c:"#9b59b6", cat:"fn", v:"1=开启免疫", tgt:1,
    desc:"给目标打上「免疫【气势降低】」标记。本身不挡吸取、不挡加气势，只挡「让气势变低」的效果（EnergyDown）。莉莉丝的【大地赐福】会让满足条件的所有草属性角色带上这个标记。"},
  EnergyDrainImmunity:{n:"气势免疫·极",s:"势✦", c:"#9b59b6", cat:"fn", v:"1=全免气势降低（含大招消耗）", tgt:0,
    desc:"完全免疫气势降低——比【气势免疫】更强，**含大招释放后的清零**。诺雅的【星月同辉】让自己永远不消耗气势，本质是「无限大招」。基线气势增长仍然正常走，只是不会下降。"},
  HealBlock:     {n:"禁疗",      s:"禁疗", c:"#e67e22", cat:"st", v:"永久标记", tgt:1,
    desc:"永久挂上的【禁疗】标记。【治疗】/【比例治疗】只要身上有这个标记就一律落空；【复活】触发时按下面两条结算：①被复活者/施法者身上有【复活储备】→ 扣 1 层储备抵消本次禁疗，标记随之移除（复活照常生效）；②没有复活储备 → 复活失败，**标记保留**（禁疗是永久的，下次死亡被队友复活时依然无效，直到有人花【复活储备】抵消为止）。修尔的平 a / 大招都挂这个标记，没法靠时间磨掉，唯一的解法就是【复活储备】。"},
  DodgeBoost:    {n:"闪避加成",  s:"闪↑",  c:"#27ae60", cat:"fn", v:"提升比例", tgt:0,
    desc:"在基础闪避之上追加闪避概率，用于堆到高闪避的生存流派。"},
  CritBoost:     {n:"暴击加成",  s:"暴↑",  c:"#27ae60", cat:"fn", v:"提升比例", tgt:0,
    desc:"在 20% 基础暴击率之上继续追加暴击率，用来堆高暴击流派。以后出的「增加暴击率的装备」也是叠在同一个池子里。"},
  // ---------- 专属 / 资源类 ----------
  DragonSoulInit:        {n:"龙魂初始",  s:"魂初", c:"#8e44ad", cat:"own", v:"开局龙魂数量", tgt:0,
    desc:"战斗开始时给持有者发放指定数量的【龙魂】。秩序龙尊靠这一条在开局就带 1 个龙魂，第一次有人出手时就能甩出一发追击。"},
  DragonSoulRefillOnUlt: {n:"龙魂补充",  s:"魂补", c:"#8e44ad", cat:"own", v:"补充到的数量（上限）", tgt:0,
    desc:"释放大招后，把自身的龙魂数量补到指定值。注意是「补到」不是「加」——已经有 2 个时用「补到 3」只会加 1 个，不会溢出。秩序龙尊的爆发节奏就是「攒势 → 开大 → 补满 3 魂 → 自己立刻追击 3 次」，所以这条和【龙魂追击】必须成对出现。"},
  DragonSoulAllyRetaliate:{n:"龙魂追击", s:"魂追", c:"#8e44ad", cat:"own", v:"每轮追击的伤害倍率", tgt:0,
    desc:"**消耗型**词条。任意己方单位出手后（**包括持有者自己出手**），持有者按当前【龙魂】数量连续追击：每轮消耗 1 个龙魂，对当前目标打一发 value 倍率的单体攻击并吸取 75 气势，一直打到龙魂耗尽或敌方全灭。龙魂为 0 时完全不触发——所以秩序龙尊必须靠大招补魂，追击是一波爆发而不是常驻。"},
  // 阿瑞斯专属：受击回血 + 受击计数攒够就点名队友出手
  VitalityOnHurt:{n:"生息不止",  s:"生息", c:"#27ae60", cat:"own", v:"受击回复的最大生命比例（0.4 = 40%）", tgt:1,
    desc:"阿瑞斯的专属词条，由他的大招挂到自己身上（不是天生被动——大招没放出来之前挨打不触发）。每次**真的掉血**就回复 value 比例的最大生命；同时记一次受击，累计满 hits 次（默认 3）后清零，并让**同一横排里攻击力最高的存活单位**立刻获得【连携】出手回合。闪避、被【免疫】挡下、伤害被护盾吃光的那些不算受击。注意它是状态，会被【驱散】扒掉，也会在阿瑞斯自己被复活时随其它状态一起清空。"},
  // 英雄技专用：不满足条件的技能整条不生效（判定在 executeSkill 最开头，连技能名都不会打进日志）
  AuraCondition: {n:"英雄条件",  s:"英条", c:"#c9a227", cat:"own", v:"需要的同属性队友数量", tgt:0,
    desc:"光环条件的门槛：检查己阵（含自己）中元素属于 elements 列表的角色数量，达到 value 个才放行。不满足时整条技能直接作废——不是少打一点伤害，是连技能都不放。写在英雄技里就是「这套阵容能不能吃到这个英雄光环」的开关。"},
};
function tagName(t){ return (TAG_META[t] && TAG_META[t].n) || t; }
// 词条分类元信息（用于词条表分组、chip 配色）
const TAG_CATS = {
  dmg:{n:"伤害类", c:"#e74c3c", desc:"决定打出去多少伤害。倍率是基础，暴击/穿透/连击/溅射/追击是放大，吸血是回收。"},
  def:{n:"防御类", c:"#3498db", desc:"决定能扛多少。判定顺序：闪避 → 防御减免 → 格挡 → 护盾/减伤。"},
  st: {n:"状态类", c:"#e67e22", desc:"增删改目标的状态。控制（一次控制 = 放空一次攻击）+ 持续伤害（中毒/灼烧/流血，统一按毁灭伤害结算）+ 属性增减益。"},
  fn: {n:"功能类", c:"#27ae60", desc:"治疗、复活、净化/驱散、气势操作。不直接参与伤害计算，改变战局节奏。"},
  own:{n:"专属 / 资源类", c:"#8e44ad", desc:"为特定角色定制的词条：管理角色独有的战斗内资源计数器（如秩序龙尊的【龙魂】），或改变「谁能被打」（如无烬龙尊的【隐身】）。"},
};
function tagChip(t,v,d){ const m=TAG_META[t]||{s:t,c:"#999"}; let extra=""; if(v!=null) extra+=v; if(d!=null) extra+= (extra?"/":"")+d+"回"; return {s:m.s,c:m.c,extra}; }
// 给 Revive.once:按 (skill.id, tag所在index) 唯一定位
function skill_id_(caster, skill, tag){
  if(!skill || !tag) return null;
  const idx = (skill.tags||[]).indexOf(tag);
  return skill.id+"#"+(idx>=0?idx:"?");
}

// 触发类型中文表
const TRIGGER_META = {
  NormalAttack:{n:"普攻",c:"#7f8c8b"},
  Ultimate:    {n:"大招",c:"#c0392b"},
  HeroSkill:   {n:"英雄技",c:"#c9a227"},
  OnHit:       {n:"受击被动",c:"#27ae60"},
  OnTurnStart: {n:"回合开始被动",c:"#27ae60"},
  OnDeath:     {n:"死亡被动",c:"#8e44ad"},
  OnAllyActed: {n:"队友出手被动",c:"#2980b9"},
  OnBattleStart:{n:"战斗开始",c:"#16a085"},
  OnRoundStart: {n:"回合开场被动",c:"#16a085"},
};

// 目标类型中文表（键必须覆盖 TARGETS 全部条目，否则界面上会露出英文 key）
const TARGET_META = {
  CurrentTarget:{n:"当前目标"},
  Self:         {n:"自身"},
  // ---- 敌方单体 ----
  EnemyLowestHp:     {n:"敌方血量最低"},
  EnemyHighestHp:    {n:"敌方血量最高"},
  EnemyLowestPower:  {n:"敌方战力最低"},
  EnemyRandom:       {n:"敌方随机一位"},
  EnemyBehindTarget: {n:"敌方身后一位（若无则当前目标）"},
  // ---- 敌方群体 / 按排 ----
  EnemyAll:     {n:"敌方全体"},
  AllEnemies:   {n:"敌方全体（别名）"},
  EnemyFrontRow: {n:"敌方前排"},
  EnemyMiddleRow:{n:"敌方中排"},
  EnemyBackRow:  {n:"敌方后排"},
  EnemyAdjacent: {n:"当前目标的上下左右四格"},
  EnemyColumn:  {n:"敌方同列"},
  // ---- 己方 ----
  AllyAll:      {n:"己方全体"},
  AllAllies:    {n:"己方全体（别名）"},
  AllyFrontRow: {n:"己方前排"},
  AllyLowestHp: {n:"己方血量最低队友"},
  AllyHighestAtkSameRow:{n:"己方同横排攻击力最高"},
  AllyExceptSelf:{n:"己方除自己以外"},
  LowestHpAlly: {n:"血量最低队友（别名）"},
  HighestHpAlly:{n:"血量最高队友（别名）"},
  SelfColumn:   {n:"己方同列"},
  // 阵亡池：只能给【复活】用，活着的时候解析结果为空
  FallenAllyRandom:{n:"随机一位阵亡队友（【复活】专用）"},
  // 按基础职业筛己方（英雄技/光环用，只取存活单位）
  AllyTank:     {n:"己方肉盾职业"},
  AllyAttack:   {n:"己方攻击职业"},
  AllySpeed:    {n:"己方速度职业"},
  AllyBalance:  {n:"己方平衡职业"},
  // ---- 双方 ----
  AllAll:       {n:"双方全体"},
};

// 元素中文表
const ELEMENTS = {
  Fire:  {n:"火",c:"#e74c3c"},
  Water: {n:"水",c:"#3498db"},
  Grass: {n:"草",c:"#27ae60"},
  Light: {n:"光",c:"#f1c40f"},
  Dark:  {n:"暗",c:"#8e44ad"},
  None:  {n:"无",c:"#95a5a6"},
};

// 养成等级（每个角色）
let GROWTH_LEVELS = {};
CHARS.forEach(c=>GROWTH_LEVELS[c.id]=50);
const MAX_LV = 100;

/* ================================================================
 * 养成：属性随等级变化。
 *   f(50)=1 为锚点（与原始数据一致）
 *   f(1)=0.42~0.55（按职业倾向）
 *   f(60)=1.15，f(100)=1.40，分段线性
 *   50→60 段斜率 c→1.15/(60-50)=0.015 每级
 *   60→100 段斜率 0.25/40=0.00625 每级
 * ================================================================ */
const GROWTH_STYLE = {
  // 职业倾向：坦克 HP 长得快，刺客攻击长得快
  char_light_tank:{hp:0.55,atk:0.42,def:0.5,spd:0.4},
  char_grass_assassin:{hp:0.42,atk:0.55,def:0.4,spd:0.5},
  char_dark_mage:{hp:0.45,atk:0.52,def:0.42,spd:0.45},
  char_fire_dps:{hp:0.48,atk:0.53,def:0.42,spd:0.46},
  char_water_healer:{hp:0.5,atk:0.45,def:0.48,spd:0.44},
  char_grass_warrior:{hp:0.52,atk:0.48,def:0.46,spd:0.44},
  char_light_dps:{hp:0.46,atk:0.52,def:0.44,spd:0.46},
  char_fire_brave:{hp:0.52,atk:0.5,def:0.46,spd:0.44},
  char_dragon_emberless:{hp:0.46,atk:0.55,def:0.42,spd:0.48},
  // 造物以撒（平衡职业 → 用 warrior 那套曲线：攻防均衡，速度不突出）
  char_isaac:{hp:0.52,atk:0.48,def:0.46,spd:0.44},
  // 阿瑞斯（肉盾）：HP/防优先，攻速垫底
  char_ares:{hp:0.56,atk:0.42,def:0.52,spd:0.4},
  // 诺亚（攻击）：攻/速优先，血防垫底
  char_noah:{hp:0.44,atk:0.56,def:0.4,spd:0.5}
};
function growthFactor(lv, min){ // min = 1级时相对50级的比例
  if(lv<=50) return min + (1-min)*lv/50;
  if(lv<=60) return 1 + 0.15*(lv-50)/10;        // 60→1.15
  return 1.15 + 0.25*(lv-60)/40;               // 100→1.40
}
function statsAt(charId, lv){
  const c = CHARS.find(x=>x.id===charId);
  const g = GROWTH_STYLE[charId] || {hp:.5,atk:.5,def:.5,spd:.5};
  const f = s => growthFactor(lv, s);
  return {
    maxHp: Math.round(c.maxHp * f(g.hp)),
    atk: Math.round(c.atk * f(g.atk)),
    def: Math.round(c.def * f(g.def)),
    spd: Math.round(c.spd * f(g.spd))
  };
}
function expToNext(lv){ return Math.round(80 * Math.pow(lv,1.35)); }
function power(s){ return Math.round(s.maxHp/10 + s.atk*2 + s.def*2 + s.spd*1.5); }

/* 根据角色 id 查立绘路径；没配就返回 null（UI 走 fallback 文字） */
function portraitOf(charId){
  const c = CHARS.find(x=>x.id===charId);
  return c ? (c.portrait || null) : null;
}

