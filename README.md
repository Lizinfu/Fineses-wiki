# Fineses 世界观 Wiki

这是一个使用 **Hugo + Pagefind + GitHub Pages** 构建的公开静态世界观资料库。内容以 Markdown 和 YAML Front Matter 保存；稳定 ID、实体关系、反向链接和时间线数据在构建前自动校验和生成。

> 本仓库只应包含可公开发布的内容。GitHub Pages 的所有构建产物均为公开文件；“受限访问”“涂黑”等仅是世界内叙事效果，不是权限控制。

## 当前能力

- 首页、门户、Section、实体、分类、搜索、时间线和 404 页面；
- 响应式导航、面包屑、页面目录、深浅主题和无 JavaScript 基础阅读；
- Pagefind 全文搜索及实体类型、Section、时间线等筛选元数据；
- 通过稳定 ID 构建关系与自动反向链接；
- GitHub Actions 在 Pull Request 校验内容，并在 `main` 分支自动部署到 GitHub Pages。

完整目标和长期路线见 [`docs/BUILDER/PLAN.MD`](docs/BUILDER/PLAN.MD)。该文件是架构蓝图；**日常编辑与当前实现规则以 `docs/` 下的专题文档和本 README 为准。**

## 快速开始

### 前置条件

- Node.js 22（`package.json` 要求 `>=22 <23`）；
- Hugo Extended 0.155.3（CI 使用的版本）；
- npm 10 或更高版本。

Windows 使用者可先运行 `tools/setup-wiki.cmd`。它会检查 Node 和 Hugo 是否在 `PATH` 中，再安装项目依赖。

```bash
npm ci
npm run wiki:preview-search
```

`wiki:preview-search` 会准备派生数据、构建包含草稿的 Hugo 站点，并启动带真实 Pagefind 索引的本地预览。

## 唯一命令入口

| 命令 | 用途 | 是否写入文件 |
|---|---|---|
| `npm run wiki:validate` | 校验公开实体的最小内容契约、受控枚举、关系、来源和时间线；同时检查派生数据能否由当前内容重建。 | 否 |
| `npm run wiki:prepare` | 生成 `data/generated/` 中的 ID 索引、反向链接、统计、时间线及报告。 | 是 |
| `npm run wiki:build` | 执行校验、生成派生数据、Hugo 构建、Pagefind 建索引和静态站点质量检查。 | 是（含忽略的 `public/`） |
| `npm run quality:source` | 检查源媒体的单文件/总量预算；空媒体会报告为警告。 | 否 |
| `npm run quality:site` | 检查已生成站点的页面标题、本地链接和资源目标；缺少图片替代文字会报告为警告。 | 否 |
| `npm run quality:all` | 组合运行内容校验、源媒体检查和站点输出检查（要求已有最新 `public/`）。 | 否 |
| `npm run test:browser` | 对已构建站点运行 Playwright/axe 浏览器检查；首次需运行 `npx playwright install chromium`。 | 否 |
| `npm run wiki:preview` | 包含草稿的 Hugo 开发服务器。 | 是 |
| `npm run wiki:preview-search` | 包含草稿的完整搜索预览。 | 是 |
| `npm run wiki:report` | 输出关系与时间线统计，适合内容盘点。 | 否 |

常规提交前至少运行 `npm run wiki:validate`；涉及模板、样式、搜索或发布时运行 `npm run wiki:build`。完整构建使用 `--cleanDestinationDir` 清理旧页面，避免已删除内容残留在发布产物中。

## 文档导航

- [贡献与本地工作流](CONTRIBUTING.md)
- [贡献流程与审核职责](docs/contribution-workflow.md)
- [内容模型](docs/content-model.md)
- [关系与反向链接](docs/relationship-guide.md)
- [分类词表](docs/taxonomy-guide.md)
- [信息架构](docs/information-architecture.md)
- [编辑规范](docs/editorial-style-guide.md)
- [可访问性标准](docs/accessibility-standard.md)
- [设计系统](docs/design-system.md)
- [发布流程](docs/release-process.md)
- [面向编辑者的维护手册](docs/BUILDER/WIKI_MAINTENANCE_GUIDE.md)
- [脚本职责与兼容状态](scripts/README.md)

## 目录职责

```text
content/          公开 Markdown 内容源
data/             受控词表、门户配置与生成的派生数据
layouts/          Hugo 模板、partial、shortcode、render hook
assets/           CSS 与前端脚本源
schemas/          实体 Schema 参考定义
scripts/          内容校验、派生数据生成与构建辅助脚本
.github/workflows/ PR 校验与 GitHub Pages 部署
```

不要手工编辑 `public/`，也不要手工修改 `data/generated/`。两者均是构建产物。
