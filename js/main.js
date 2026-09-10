/* js/main.js —— 由单文件 index.html 机械拆出，逻辑零改动 */
"use strict";
/* ---------- 初始化 ---------- */
// 有本地存档就先读它——「在前端改技能/角色」刷新后还在，靠的就是这一步
let __loadedSave = false;
try{ __loadedSave = (typeof DataIO!=="undefined" && DataIO.load) ? !!DataIO.load() : false; }
catch(e){ __loadedSave = false; }
// 没有存档（或存档里没阵容）才填默认阵容：纯数据填位，UI 由 TeamUI.render() 完成
if(!__loadedSave){
  TEAMS.player.positions = ["char_light_tank","char_grass_assassin","char_fire_brave","char_fire_dps",null,"char_water_healer",null,null,null];
  TEAMS.enemy.positions = ["char_grass_warrior","char_dark_mage","char_light_dps","char_grass_assassin",null,"char_fire_brave",null,null,null];
}
try{ TeamUI.render(); }catch(e){ /* headless 无 DOM 时忽略 */ }

/* ---------- Node 测试导出（headless 验证用）---------- */
if(typeof module!=="undefined" && module.exports){
  module.exports = { BattleController, BattleGrid, BattleUnit, mulberry32,
    CHARS, SKILLS, TEAMS, GROWTH_LEVELS, MAX_LV, MAX_ENERGY, BASE_ENERGY,
    ULT_ENERGY_COST, BASE_CRIT_CHANCE, BASE_CRIT_MULT, energyMultiplier,
    STATUS_NAME, STATUS_SHORT, statusShort, normTagType, TAG_ALIAS,
    ENERGY_BASIC_GAIN, ENERGY_HIT_GAIN, statsAt, power, TeamUI,
    RosterUI, DesignerUI, GlossaryUI, SkillUI, TAG_META, TAG_CATS, TARGET_META, TRIGGER_META, ELEMENTS,
    TARGETS, CLASS_META, clsMeta, clsBadge, SPECIAL_CLASS_META, specMeta, specBadge,
    GROWTH_STYLE, GROWTH_STYLE_PRESETS, GROWTH_STYLE_LABEL, DataIO,
    STAR_GODS, STAR_GOD_ORDER, MAX_STAR_GODS, STAR_GOD_DEFAULT, ensureStarGods,
    portraitOf };
}
