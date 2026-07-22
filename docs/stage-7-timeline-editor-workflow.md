# 第七阶段：世界时间线与非技术编辑流程

## 安装

把更新包中的目录和文件合并到项目根目录：

- `.github/`
- `archetypes/`
- `assets/`
- `config/`
- `content/`
- `data/`
- `docs/`
- `layouts/`
- `scripts/`
- `tools/`
- `EDITOR_GUIDE.md`

需要覆盖：

- `.github/workflows/deploy-pages.yml`
- `.github/workflows/validate.yml`
- `assets/scripts/app.ts`
- `config/_default/menus.toml`
- `layouts/page.html`
- `layouts/_partials/pages/entity-branch-view.html`
- `layouts/_partials/head/styles.html`

如果 `menus.toml` 已经有自定义菜单，请手动加入“世界时间线”条目，不要
删除现有条目。

## package.json

把 `package.stage-7.merge.json` 中的 scripts 合并到现有
`package.json`。

第六阶段加入的以下脚本钩子应删除，避免重复生成：

```json
"predev": "npm run content:generate",
"prebuild:hugo": "npm run content:validate && npm run content:generate"
```

保留 `content:*` 脚本没有问题，但日常使用统一改为：

```powershell
npm run wiki:prepare
npm run wiki:validate
npm run wiki:preview
npm run wiki:preview-search
npm run wiki:build
```

然后运行：

```powershell
npm install
```

并提交新的 `package-lock.json`。


## 草稿处理

正式构建和 GitHub Pages 会排除 `draft: true` 的实体、关系和时间线记录，
避免线上出现指向草稿页面的反向链接。

本地命令：

```powershell
npm run wiki:preview
npm run wiki:preview-search
```

会使用 `--include-drafts` 和 Hugo 的草稿模式，因此仍可预览尚未发布的
内容。

## 非技术编辑者的线上流程

维护者首先把：

```text
docs/config/editor-params.toml
```

中的内容合并到：

```text
config/_default/params.toml
```

并填写真实仓库：

```toml
[editor]
enabled = true
repository = "OWNER/REPOSITORY"
branch = "main"
content_dir = "content"
```

实体页面底部随后会出现 GitHub 编辑入口。

编辑者只需要：

```text
打开页面
→ 在 GitHub 编辑本页
→ 修改 Markdown
→ Commit changes
→ 等待 Actions
```

GitHub Actions 自动执行：

```text
wiki:validate
→ wiki:prepare
→ Hugo
→ Pagefind
→ Pages deployment
```

因此不需要提交 `public/`，也不需要手工建立搜索索引。

## 本地一键流程

Windows 首次安装：

```text
tools/setup-wiki.cmd
```

包含搜索的本地预览：

```text
tools/preview-wiki.cmd
```

内容检查：

```text
tools/check-wiki.cmd
```

命令行对应：

```powershell
npm run wiki:preview-search
npm run wiki:validate
```

## 时间线入口

页面：

```text
/timeline/
```

模板：

```text
layouts/timeline/section.html
```

数据：

```text
data/generated/timeline.json
```

生成报告：

```text
data/generated/timeline-report.json
```

## 时间线 Front Matter

基本事件：

```yaml
params:
  id: "evt.northern-war"
  entity_kind: "event"

  timeline:
    include: true
    calendar: "default"
    categories:
      - "war"
    status: "verified"

    start:
      display: "第三纪元187年"
      sort_value: 187000
      precision: "year"
      circa: false

    summary: "北方战争正式爆发。"
    source_refs:
      - "rec.military-report-0187"
```

时间范围：

```yaml
timeline:
  include: true
  calendar: "default"
  categories: ["war"]
  status: "verified"

  start:
    display: "第三纪元187年"
    sort_value: 187000

  end:
    display: "第三纪元191年"
    sort_value: 191000
```

日期不详：

```yaml
timeline:
  include: true
  undated: true
  undated_label: "发生年代不详"
  order_hint: 10
  categories: ["discovery"]
  status: "unknown"
```

争议日期：

```yaml
timeline:
  include: true
  calendar: "default"
  categories: ["politics"]
  status: "disputed"

  start:
    display: "第三纪元187年"
    sort_value: 187000

  variants:
    - display: "第三纪元185年"
      sort_value: 185000
      note: "北部抄本采用这一日期。"
      source_refs: ["rec.northern-copy"]
```

## 排序值

`display` 负责阅读，`sort_value` 负责排序。

推荐项目内部统一：

```text
年：187000
月：187050
日：187051
```

这只是示例。项目可以采用其他一致方案，但必须满足：

```text
较早记录的 sort_value
<
较晚记录的 sort_value
```

负数也允许。

## 历法

在：

```text
data/vocabularies/calendars.yaml
```

注册：

```yaml
calendars:
  - id: "third-era"
    label: "第三纪元历"
    short_label: "三纪"
    description: "第三纪元官方历法。"
```

然后在事件中使用：

```yaml
calendar: "third-era"
```

未注册历法会阻止 CI。

## 分类

在：

```text
data/vocabularies/timeline-categories.yaml
```

注册分类。

事件可属于多个分类：

```yaml
categories:
  - "war"
  - "diplomacy"
```

未注册分类会阻止 CI。

## 状态

内置状态：

```text
verified   已核实
probable   较可信
disputed   存在争议
legendary  传说记录
unknown    可信度未知
```

`disputed` 建议同时填写 `variants`。

## 校验错误

会阻止部署：

- 时间线实体没有稳定 ID；
- 缺少开始日期；
- 缺少数字排序值；
- 结束日期早于开始日期；
- 历法未注册；
- 分类未注册；
- 时间线来源 ID 不存在；
- 争议日期格式错误。

只产生警告：

- 未知状态；
- `disputed` 没有日期版本。

## 无 JavaScript

时间线由 Hugo直接输出完整静态列表。

JavaScript 只负责：

- 文本筛选；
- 历法筛选；
- 分类筛选；
- 实体类型筛选；
- 状态筛选；
- URL 参数同步。

关闭 JavaScript 后，全部时间记录和实体链接仍然可读。

## 搜索更新机制

Pagefind 不读取 Markdown，而是读取 Hugo 已生成的 HTML。因此部署顺序必须是：

```text
Markdown
→ Hugo public/
→ Pagefind public/pagefind/
→ upload-pages-artifact
→ GitHub Pages
```

本阶段工作流已经固定该顺序。编辑者提交 Markdown 后，无需执行其他搜索
操作。
