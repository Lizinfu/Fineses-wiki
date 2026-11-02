# ADR 0005：冈穹嘉卡国名与技术标识迁移

- **状态**：已采纳
- **日期**：2026-11-02

## 决策

世界观负责人确认本次国名调整采用以下命名：

- 中文国名：冈穹嘉卡。
- 外文国名：གང་ཁྱོང་རྒྱལ་ཁབ；包含撇号及大小写差异的旧拉丁字母国名一并替换。
- 文件、目录、URL 和相关技术标识：使用 `gkrk`。

本次是负责人明确批准的一次性稳定 ID 迁移，不改变 [ADR 0002](0002-stable-ids.md) 中稳定 ID 默认不随标题或 URL 改动的原则。国家实体使用 `nat.gkrk`，事件实体使用 `evt.gkrk`；地图区域、地图及掩膜使用 `country.gkrk`、`country.gkrk.nation` 和 `nation.gkrk`。所有现存引用同步迁移。

## 文件与网址

- 国家：`content/nations/nat-gkrk/_index.md`。
- 人物：`content/characters/gkrk/per-lapla/index.md`。
- 事件：`content/history/events/evt-gkrk/index.md`。
- 国家徽记：`static/gkrk.svg`。

按负责人要求，不设置旧 URL 别名或跳转。旧网址不再提供内容；发布构建使用 `--cleanDestinationDir` 清理旧页面。人物 ID 保持 `per.lapla`，事件页既有藏文描述保持原文。

## 派生数据与验证

只修改权威源文件，通过 `npm run map:generate` 和 `npm run wiki:build` 重建地图掩膜、实体索引、时间线、正文检索索引及静态页面；不手工修改这些生成物。使用现有内容、地图、链接和浏览器检查验证引用与显示一致。
