# 世界观 Wiki 维护手册

> **当前操作手册**：本文件仅说明已在仓库中实现的维护方式。产品目标见 `WIKI_REQUIREMENTS.md`，历史架构蓝图见 `PLAN.MD`；两者都不替代本手册、根目录 `README.md` 和 `docs/` 下的专题规范。
>
> **适用对象**：内容编辑者、校对者与项目维护者。日常内容编辑不需要修改模板、CSS、JavaScript 或构建脚本。

## 1. 项目是什么

这是一个由 Hugo 生成、Pagefind 提供全文搜索、GitHub Actions 校验并部署到 GitHub Pages 的公开静态世界观资料库。

- 源内容：`content/` 中的 Markdown + YAML Front Matter；
- 受控配置：`data/` 中的词表、导航和页面数据；
- 派生数据：`data/generated/` 中的 ID 索引、关系、反向链接与时间线；
- 站点产物：`public/`，每次构建重新生成，不能手工编辑；
- 公开边界：仓库与 GitHub Pages 中的内容均可公开访问；世界内“受限”“涂黑”仅是叙事，不是权限控制。

## 2. 开始前

本地完整维护需要：

- Node.js 22 和 npm 10（以 `package.json` 的 `engines` 为准）；
- Hugo Extended 0.155.3（CI 使用版本）；
- 首次浏览器测试时需要 Playwright Chromium。

```powershell
npm ci
```

Windows 可运行 `tools/setup-wiki.cmd` 检查 Node、Hugo 并安装依赖。不要用 `npm install` 替代日常安装；仅在**有意修改依赖**时才运行它并提交相应的 `package-lock.json`。

## 3. 编辑内容

### 3.1 可以编辑的文件

```text
content/
data/navigation/portals.yaml
data/vocabularies/
config/_default/menus.toml
config/_default/params.toml
```

词表、菜单和门户会影响全站，请在修改前与维护者确认。新实体使用对应 archetype 创建，并遵守：

- [内容模型](../content-model.md)：Front Matter 最小契约；
- [分类词表](../taxonomy-guide.md)：受控分类；
- [关系指南](../relationship-guide.md)：稳定 ID 和单向关系；
- [编辑规范](../editorial-style-guide.md)：语言、来源、标题和图片说明。

### 3.2 不要直接编辑

```text
public/
resources/_gen/
node_modules/
data/generated/
package-lock.json
```

`data/generated/` 可以随内容提交，但必须由 `npm run wiki:prepare` 或 `npm run wiki:build` 生成；不要人工修改。`package-lock.json` 仅随依赖变更提交。

## 4. 日常命令

| 命令 | 何时使用 | 说明 |
|---|---|---|
| `npm run wiki:validate` | 每次内容提交前 | 校验内容模型、ID、关系、来源、时间线和派生数据是否最新。 |
| `npm run wiki:prepare` | 内容变更后需要更新派生数据 | 写入 `data/generated/`。 |
| `npm run wiki:report` | 内容盘点 | 输出实体、关系、反向链接和时间线统计。 |
| `npm run wiki:preview` | 本地写作预览 | 含草稿的 Hugo 服务；不生成真实搜索索引。 |
| `npm run wiki:preview-search` | 调试搜索 | 含草稿构建并启动 Pagefind 搜索预览。 |
| `npm run wiki:build` | 模板、搜索、发布前 | 完整校验、干净 Hugo 构建、Pagefind 和静态站点检查。 |
| `npm run quality:source` | 媒体变更 | 阻止单文件超过 5 MiB 或总媒体超过 300 MiB；空文件为警告。 |
| `npm run quality:site` | 已构建站点 | 阻止无标题页面、失效站内链接和本地资源；缺失 `alt` 为警告。 |
| `npm run test:browser` | 模板/交互变更 | Playwright + axe 检查关键页面、跳过链接、移动导航和 WCAG A/AA。 |

`dev`、`build` 和 `check` 分别是预览、完整构建和内容校验的简写。`content:migrate-v1` 是一次性迁移工具；没有迁移任务时不要运行。

若本机尚未安装浏览器，先执行：

```powershell
npx playwright install chromium
npm run test:browser
```

## 5. 编辑与发布流程

1. 从最新 `main` 创建分支；
2. 新增/修改 Markdown、词表或配置；
3. 运行 `npm run wiki:validate`；内容变更导致的 `data/generated/` 差异一并提交；
4. 涉及媒体时运行 `npm run quality:source`；为每张有意义的图片提供准确 `alt`；
5. 涉及模板、样式、脚本、搜索或发布时运行 `npm run wiki:build`，并在具备浏览器依赖时运行 `npm run test:browser`；
6. 提交 Pull Request，说明目的、影响页面、验证命令及有意变更的词表/关系/ID；
7. 等待 PR 校验通过，审核后合并 `main`；
8. GitHub Actions 构建并部署，线上抽查首页、实体页、搜索、时间线和 404。

CI 会强制执行内容校验、媒体预算、干净构建、Pagefind、静态链接检查和 Playwright/axe 测试。空媒体和缺失图片 `alt` 当前会报警但不阻断；修改相关内容时不得新增此类警告。

## 6. 常见问题

| 现象 | 处理 |
|---|---|
| `wiki:validate` 报 ID、关系或时间线错误 | 读取终端定位的源文件，按内容模型和关系指南修正；不要手改 `data/generated/` 规避校验。 |
| 本地预览中搜索不可用 | 使用 `npm run wiki:preview-search`，普通 Hugo 服务不生成 Pagefind 索引。 |
| 媒体预算失败 | 压缩/裁剪图片，或移除不使用的媒体；单文件限制 5 MiB。 |
| `quality:site` 报失效链接 | 使用 Hugo 的相对链接函数或修正目标路径，然后重新构建。 |
| 浏览器测试提示缺少 Chromium | 执行 `npx playwright install chromium`；CI 会自动安装。 |
| 线上发布异常 | 查看 GitHub Actions 构建日志；需要回滚时回退 `main` 到最近成功提交，再复测核心页面。 |

## 7. 文档导航

- [项目入口与命令](../../README.md)
- [贡献流程](../../CONTRIBUTING.md)
- [内容模型](../content-model.md)
- [关系指南](../relationship-guide.md)
- [分类词表](../taxonomy-guide.md)
- [信息架构](../information-architecture.md)
- [设计系统](../design-system.md)
- [可访问性标准](../accessibility-standard.md)
- [发布流程](../release-process.md)
- [脚本职责](../../scripts/README.md)
