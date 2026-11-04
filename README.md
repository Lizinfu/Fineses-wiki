# Fineses 世界观 Wiki

这是一个使用 **Hugo + GitHub Pages** 构建的公开静态世界观资料库。内容以 Markdown 和 YAML Front Matter 保存；稳定 ID、实体关系、反向链接、时间线及正文检索索引在构建时自动生成。

> 本仓库只应包含可公开发布的内容。GitHub Pages 的所有构建产物均为公开文件；“受限访问”“涂黑”等仅是世界内叙事效果，不是权限控制。

## 当前能力

- 首页、门户、Section、实体、分类、搜索、时间线和 404 页面；
- 响应式导航、面包屑、页面目录、深浅主题和无 JavaScript 基础阅读；
- 正文关键词检索：空格分隔多个关键词，返回正文同时包含全部关键词的公开文档；
- 通过稳定 ID 构建关系与自动反向链接；
- PixiJS 六边形战术沙盘：世界、13 国与首都共用 WebGL2 场景；以平整顶面、可见侧壁和离散台阶表现地形，支持斜俯视、图层、检索、档案联动与目录回退。伊琳沃克有分层地貌与河流，卡夏·欧尔莱特有六边形基座和皇宫居中的对称城区；连续起伏着色器与旧 SVG 渲染器已撤下。
- 世界总图使用独立的地貌美术配置，概括 13 国的雪域、荒漠、雨林及高低走向；离岸岛屿补充通过生成器同步到世界与国家层。具体范围与形状均为暂定示意，详见 `docs/decisions/0006-world-atlas-art-direction.md`。
- GitHub Actions 在 Pull Request 校验内容，并在 `main` 分支自动部署到 GitHub Pages。

产品目标和后续需求见[需求基线](docs/BUILDER/WIKI_REQUIREMENTS.md)。当前实现与日常维护以本 README 和 `docs/` 下的专题指南为准；地图的功能、文本编辑与美术资产入口统一见[地图功能与维护指南](docs/BUILDER/MAP_MAINTENANCE.md)。

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

`wiki:preview-search` 会准备派生数据、构建包含草稿及正文索引的 Hugo 站点，并启动本地预览。

## 唯一命令入口

| 命令 | 用途 | 是否写入文件 |
|---|---|---|
| `npm run wiki:validate` | 校验公开实体、地图、关系、来源和时间线；同时检查地图及其他派生数据能否由当前源文件重建。 | 否 |
| `npm run wiki:prepare` | 生成 `data/generated/` 中的 ID 索引、反向链接、统计、时间线及报告。 | 是 |
| `npm run map:generate` | 从政治参考图及父级区域配置重新生成 `data/maps/tiles.yaml`；修改参考图、生成配置或网格后运行。 | 是 |
| `npm run map:check` | 检查地图生成数据是否与参考图和配置一致。 | 否 |
| `npm run wiki:build` | 执行校验、生成派生数据、Hugo 构建、正文索引检查和静态站点质量检查。 | 是（含忽略的 `public/`） |
| `npm run quality:source` | 检查源媒体的单文件/总量预算；空媒体会报告为警告。 | 否 |
| `npm run quality:site` | 检查已生成站点的页面标题、本地链接和资源目标；缺少图片替代文字会报告为警告。 | 否 |
| `npm run quality:all` | 组合运行内容校验、源媒体检查和站点输出检查（要求已有最新 `public/`）。 | 否 |
| `npm run test:browser` | 对已构建站点运行 Playwright/axe 浏览器检查；首次需运行 `npx playwright install chromium`。 | 否 |
| `npm run wiki:preview` | 包含草稿的 Hugo 开发服务器。 | 是 |
| `npm run wiki:preview-search` | 包含草稿的完整正文搜索预览。 | 是 |
| `npm run wiki:report` | 输出关系与时间线统计，适合内容盘点。 | 否 |

常规提交前至少运行 `npm run wiki:validate`；涉及模板、样式、搜索或发布时运行 `npm run wiki:build`。完整构建使用 `--cleanDestinationDir` 清理旧页面，避免已删除内容残留在发布产物中。

## 当前检索规则

检索中心只匹配公开 Markdown 文档的正文，不以标题、别名、ID、馆藏编号或目录名称作为命中依据。输入按空白字符拆成关键词；同一文档的正文必须包含每个关键词，词序和距离不限。每个关键词按连续文字匹配，英文字母忽略大小写，英数字及常用符号的全半角形式会统一。结果摘要从实际命中的正文位置截取。

Hugo 生成 `public/search-index.json`，由检索页按需加载。该文件是构建产物，不要手工编辑。类别筛选留待下一阶段实现。

## 文档导航

- [贡献与本地工作流](CONTRIBUTING.md)
- [贡献流程与审核职责](docs/contribution-workflow.md)
- [内容模型](docs/content-model.md)
- [关系与反向链接](docs/relationship-guide.md)
- [分类词表](docs/taxonomy-guide.md)
- [信息架构](docs/information-architecture.md)
- [正文检索规则与维护](docs/search-guide.md)
- [编辑规范](docs/editorial-style-guide.md)
- [可访问性标准](docs/accessibility-standard.md)
- [设计系统](docs/design-system.md)
- [发布流程](docs/release-process.md)
- [面向编辑者的维护手册](docs/BUILDER/WIKI_MAINTENANCE_GUIDE.md)
- [地图功能与维护指南：文本、档案关联、美术资产与地理配置](docs/BUILDER/MAP_MAINTENANCE.md)
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
