# 脚本职责与兼容状态

`npm run wiki:*` 是普通内容维护的统一入口；修改地图参考图、父级派生配置或网格时使用 `npm run map:generate`，只检查同步状态时使用 `npm run map:check`。文件级操作步骤见 [`MAP_MAINTENANCE.md`](../docs/BUILDER/MAP_MAINTENANCE.md)。不要在 CI、文档或编辑教程中自行串联底层脚本。

## 当前生效的脚本

| 脚本 | 由哪个入口调用 | 职责 |
|---|---|---|
| `validate-content-model.mjs` | `wiki:validate` | 校验公开实体的最小字段契约、Schema 命名、受控枚举和顶层 taxonomy 同步。 |
| `generate-hex-map.mjs` | `map:generate`、`map:check`、`wiki:validate` | 从政治参考图生成世界、伊琳沃克掩膜；其余 12 国从世界政治掩膜派生国家细格；城市示意范围从伊琳沃克父层派生。保存来源哈希、共享边界与坐标变换。 |
| `validate-maps.mjs` | `wiki:validate` | 校验地图层级、L0 网格及 L1 国土预算、区域与地点、父子地图、专题空接口、实体引用、视觉令牌和关键拓扑关系。 |
| `prepare-wiki.mjs` | `wiki:validate`、`wiki:prepare`、预览与构建 | 构建内容关系图和时间线；检查 ID、关系目标/类型、来源和孤立实体；生成 `data/generated/`。 |
| `lib/content-graph.mjs` | `prepare-wiki.mjs` | 内容图、ID 索引、反向链接和关系报告的底层实现。 |
| `lib/timeline.mjs` | `prepare-wiki.mjs` | 时间线校验、排序与派生数据的底层实现。 |
| `verify-search-index.mjs` | `wiki:build`、CI | 验证 Hugo 正文索引的格式、唯一 URL 和页面目标。 |
| `check-media-budget.mjs` | `quality:source`、`wiki:build`、CI | 阻止单个媒体超过 5 MiB 或内容/静态媒体总量超过 300 MiB，并报告空媒体文件。 |
| `check-site-output.mjs` | `quality:site`、`wiki:build`、CI | 检查生成页面的标题与本地链接/资源目标；报告缺少图片替代文字。 |
| `serve-public.mjs` + `tests/browser/` | `test:browser`、CI | 使用 Playwright/axe 对首页、搜索、时间线、地图、实体页、404、键盘与移动交互和 WCAG A/AA 规则进行浏览器检查。 |
| `print-*-report.mjs` | `wiki:report` | 输出关系和时间线统计，不修改文件。 |

## 维护脚本

`generate-content-graph.mjs` 和 `generate-timeline.mjs` 保留为 `prepare-wiki.mjs` 调用的底层生成器；日常操作不要直接运行它们。`migrate-frontmatter-v1.mjs` 仅用于一次性内容迁移，对现有内容和 CI 都不是必需步骤。

## 已清理的旧占位入口

以下空脚本曾出现在早期规划中，但从未实现、未被 npm 或 GitHub Actions 调用，现已删除：

```text
check-internal-links.mjs
generate-backlinks.mjs
generate-catalog.mjs
validate-frontmatter.mjs
validate-ids.mjs
validate-relations.mjs
validate-taxonomies.mjs
validate-chronology.mjs
```

对应能力由 `validate-content-model.mjs`、`prepare-wiki.mjs`、`check-site-output.mjs` 和其 `lib/` 模块统一承担。新增独立脚本前，必须先明确其不能由现有入口表达的职责，并同时提供测试和命令入口。

## 派生数据规则

`data/generated/` 由 `wiki:prepare` 原子写入。需要提交这些 JSON 文件时，必须由内容变更后的生成命令产生，不能人工修订。

正文索引由 `layouts/home.searchindex.json` 在 Hugo 构建时从公开 Markdown 页面生成到 `public/search-index.json`。`assets/scripts/search-core.mjs` 定义空格分词、全部关键词同时命中和连续字符串匹配规则；检索界面只负责加载、分页与展示，不再单独运行索引器。
