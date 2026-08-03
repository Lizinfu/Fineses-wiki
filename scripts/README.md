# 脚本职责与兼容状态

`npm run wiki:*` 是日常使用的唯一命令入口；不要在 CI、文档或编辑教程中直接串联底层脚本。

## 当前生效的脚本

| 脚本 | 由哪个入口调用 | 职责 |
|---|---|---|
| `validate-content-model.mjs` | `wiki:validate` | 校验公开实体的最小字段契约、Schema 命名、受控枚举和顶层 taxonomy 同步。 |
| `prepare-wiki.mjs` | `wiki:validate`、`wiki:prepare`、预览与构建 | 构建内容关系图和时间线；检查 ID、关系目标/类型、来源和孤立实体；生成 `data/generated/`。 |
| `lib/content-graph.mjs` | `prepare-wiki.mjs` | 内容图、ID 索引、反向链接和关系报告的底层实现。 |
| `lib/timeline.mjs` | `prepare-wiki.mjs` | 时间线校验、排序与派生数据的底层实现。 |
| `verify-search-index.mjs` | `wiki:build`、CI | 验证 Pagefind 输出存在。 |
| `check-media-budget.mjs` | `quality:source`、`wiki:build`、CI | 阻止单个媒体超过 5 MiB 或内容/静态媒体总量超过 300 MiB，并报告空媒体文件。 |
| `check-site-output.mjs` | `quality:site`、`wiki:build`、CI | 检查生成页面的标题与本地链接/资源目标；报告缺少图片替代文字。 |
| `serve-public.mjs` + `tests/browser/` | `test:browser`、`wiki:build`、CI | 使用 Playwright/axe 对首页、搜索、时间线、实体页、404、跳过链接、移动导航和 WCAG A/AA 规则进行浏览器检查。 |
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