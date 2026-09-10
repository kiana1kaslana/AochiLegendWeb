# 奥奇传说·横板战棋（H5 复刻版）

一个仿奥奇传说玩法的网页游戏：九宫格布阵 + 自动回合战斗 + 通用技能词条系统。
纯原生 JS，无框架无构建，浏览器打开 `index.html` 就能玩。

**在线玩：** https://kiana1kaslana.github.io/AochiLegendWeb/

## 目录结构

```
h5_test/
├── index.html          # 页面骨架：DOM 结构 + 按序引入下面这些 js
├── css/
│   └── main.css        # 全部样式
├── js/
│   ├── data.js         # 数据层：角色/技能/星神/阵容/词条表/养成曲线
│   ├── engine.js       # 战斗引擎：BattleController / BattleUnit / BattleGrid
│   ├── ui-battle.js    # 布阵 / 战斗回放 / 胜率模拟 / 技能编辑
│   ├── ui-roster.js    # 角色仓库（含星神装配）
│   ├── ui-glossary.js  # 基础词条表（词条图鉴）
│   ├── ui-designer.js  # 角色自定义设计器
│   ├── storage.js      # localStorage 存档（DataIO）
│   └── main.js         # 启动引导 + headless 测试导出
└── assets/
    ├── img/            # 立绘 / 头像 / 图标（portraitSlot 字段留好了）
    ├── audio/          # 音效 / BGM
    └── data/           # 外部数据（角色/技能 JSON 等）
```

**给 js 加新文件时**：在 `index.html` 里按依赖顺序加 `<script src>` 标签，并且
`.workbuddy/tests/verify_battle.js` 顶部的 `JS_ORDER` 数组要同步（不同步测试会直接报错提醒）。

## 玩什么

- **布阵**：左边我方、右边敌方，各 3×3 九宫格，自己排站位
- **战斗**：自动回合制，出手顺序按列推进（前排先动），带完整战斗回放，可以单步、变速、点日志跳转
- **角色养成**：等级 1~100，属性成长曲线、战斗力、星神装配（4 槽位）
- **技能编辑**：所有角色的技能都是通用词条的组合，可以直接在网页里改，改完导出 JSON
- **角色设计器**：自己捏角色，基础属性 + 技能词条 + 大招，捏完直接进战斗
- **胜率模拟**：当前阵容自动跑 100 场，看胜率

## 加美术资源

图片丢 `assets/img/`，音频丢 `assets/audio/`，代码里相对路径引用（`assets/img/xxx.png`）。
角色的 `portraitSlot` / `modelSlot` 字段已经预留（见 `js/storage.js` 的 export），后面接立绘系统时用。

## 数据存哪

进度存在浏览器 localStorage 里，清浏览器数据会丢，导出 JSON 可以备份。

## 反馈

玩的过程中发现数值离谱的、行为不对的、界面别扭的，直接开 [Issue](https://github.com/kiana1kaslana/AochiLegendWeb/issues) 说一下：
哪个角色、哪个技能、你预期是什么、实际发生了什么。最好能带上战斗日志里的那段文字。
