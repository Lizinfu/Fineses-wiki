# Wiki 内容编辑快速指南

本指南面向只需要更新世界观文档、不负责网站代码的编辑者。

## 最简单的更新方式：直接在网页上编辑

网站维护者完成一次编辑入口配置后，每个实体页面底部都会出现：

- “在 GitHub 编辑本页”
- “查看发布状态”

更新步骤：

1. 打开需要修改的 Wiki 页面。
2. 点击“在 GitHub 编辑本页”。
3. 在 GitHub 编辑器中修改 Markdown。
4. 点击 **Preview** 检查文本结构。
5. 点击 **Commit changes**。
6. 按团队规则直接提交到 `main`，或创建新分支和 Pull Request。
7. 等待 GitHub Actions 完成部署。

合并到 `main` 后，部署工作流会自动完成：

```text
校验稳定 ID 和关系
→ 生成反向链接
→ 生成世界时间线
→ Hugo 构建
→ Pagefind 重建搜索索引
→ 发布 GitHub Pages
```

编辑者不需要修改或提交 `public/`，也不需要手动运行 Pagefind。

## 新增普通文档

在 GitHub 仓库中进入目标目录，例如：

```text
content/history/
```

选择：

```text
Add file → Create new file
```

输入文件名，例如：

```text
northern-war.md
```

然后填写 Front Matter 和正文。

## 新增国家子页面

国家根页面必须是：

```text
content/nations/nat-lanyuan/_index.md
```

在同一目录中新建：

```text
government.md
history.md
economy.md
```

子页面示例：

```yaml
---
title: "政体与行政"
description: "国家制度、中央机构和行政区划。"
weight: 20
draft: false

params:
  id: "nat.lanyuan-government"
  schema: "subpage.v1"
  entity_kind: "subpage"
  canon_status: "canon"
  names:
    official: "政体与行政"
  library:
    catalog_no: "NAT-0001-20"
    access_level: "public"
    reliability: "verified"
    last_reviewed: 2026-08-03
  classifications:
    cultures: []
    eras: []
    regions: []
    government_forms: []
    topics: []
  relations: []
---
```

如果章节不需要被其他条目引用、没有独立来源或时间线，可不设置 `params.id`；但一旦设置 ID，就必须符合 [内容模型](docs/content-model.md) 的完整公开实体契约。

## 编辑正文：Markdown 排版速查

正文使用标准 Markdown。请按内容层级使用标题，不要为了放大文字而跳级或使用粗体代替标题；页面标题已经由 Front Matter 的 `title` 自动生成，因此正文通常从 `##` 开始。

```markdown
## 二级章节

### 三级章节

普通段落使用空行分隔。**重点**、*强调*、`术语或档案号` 都可直接使用。

- 无序列表
- 适合并列事项

1. 有序列表
2. 适合步骤或时间顺序

> 引文、口述记录或需要突出的原文。

[站内或外部链接](https://example.com)
```

代码块适合展示编年格式、术语规则或结构化数据；请标注语言以获得正确高亮：

````markdown
```yaml
name: "示例"
```
````

### 正文短代码与视觉样式

短代码必须使用 Hugo 的 `<` 写法（例如 `{{< figure ... >}}`）。有正文内容的短代码必须同时写关闭标签。属性值请使用英文双引号；文件路径相对于当前页面目录（Page Bundle）填写。

#### 信息、警告与档案文本

| 用途 | 写法与可选参数 |
| --- | --- |
| 普通信息框 | `{{< infobox title="标题" code="INFO" >}}内容支持 **Markdown**。{{< /infobox >}}`。`title` 默认“档案信息”，`code` 默认 `INFO`。 |
| 馆藏批注 | `{{< archive-note title="编者按" status="info" source="档案号" >}}内容{{< /archive-note >}}`。可选 `title`、`status`、`source`；`status` 是显示标识，可使用 `info`、`warning`、`restricted` 等项目约定词。 |
| 馆员注释 | `{{< librarian-note title="注释" author="馆员姓名" status="info" >}}内容{{< /librarian-note >}}`。可选 `title`、`author`、`status`。 |
| 警告框 | `{{< warning title="注意" level="warning" >}}内容{{< /warning >}}`。可选 `title`、`level`。 |
| 文献摘录 | `{{< document-excerpt type="record" title="档案摘录" date="第三纪元187年" issuer="发布机构" source="来源" condition="complete" >}}摘录正文{{< /document-excerpt >}}`。可选 `type`、`title`、`date`、`issuer`、`source`、`condition`。 |
| 遮蔽文本 | `{{< redaction >}}不可公开的文字{{< /redaction >}}`；添加 `reveal="true"` 后可聚焦查看，默认不可展开。短代码内只保留纯文本。 |

#### 站内引用与关系

```markdown
{{< entity-ref target="per.luo-yan" label="洛砚" >}}
{{< entity-ref target="per.luo-yan" label="洛砚" show-id="true" >}}

{{< relation-list >}}
```

- `entity-ref` 用稳定 ID 链接到公开实体；`label` 可覆盖显示名称，`show-id="true"` 可同时显示 ID。目标不存在时会显示未解析提示，提交前应修正。
- `relation-list` 自动展示当前实体在 Front Matter 中声明的关系和构建生成的反向链接；不要在正文手工复制同一份关系清单。

#### 图片、地图与图集

把媒体文件放入词条所在目录，例如 `content/history/events/evt-example/map.webp`，然后按下列方式引用。所有有意义的图片都必须提供准确的 `alt`，不要写“图片”“地图”等无信息文字。

| 用途 | 写法与可选参数 |
| --- | --- |
| 单张图片 | `{{< figure src="map.webp" alt="北境行政区地图" caption="第三纪元地图。" credit="制图：档案局" layout="block" size="large" frame="plain" >}}`。必填 `src`；可选 `alt`、`caption`、`credit`、`link`。`layout` 默认 `block`，`size` 默认 `large`，`frame` 默认 `plain`。 |
| 地图图版 | `{{< map-plate src="map.webp" alt="地图说明" title="北境图版" caption="说明" legend="颜色含义" scale="1:100000" source="来源" >}}`。必填 `src`；其余均可选。 |
| 并列媒体 | 以 `{{< media-pair title="对照图" layout="equal" >}}` 包裹多个 `media-item`，最后以 `{{< /media-pair >}}` 关闭。每项写作 `{{< media-item src="before.webp" alt="改造前" label="改造前" caption="说明" >}}`。`media-pair` 的 `title`、`layout` 可选，`media-item` 必填 `src`，其余可选。 |
| 自动图集 | `{{< gallery match="gallery/*" columns="3" ratio="4 / 3" >}}`。将图片放进当前页面的 `gallery/` 子目录；可选 `match`、`columns`、`ratio`。图片文件名或资源标题会作为图注。 |

普通 Markdown 图片同样可用：`![替代文字](map.webp "图片说明")`。但需要图注、署名、地图元数据或版式选择时，应优先使用短代码。

## Front Matter：字段选择与编辑边界

### Hugo 页面字段

以下字段写在 Front Matter 顶层，用于页面本身；它们不是 `params` 的子字段。

| 字段 | 何时使用 |
| --- | --- |
| `title` | 每页必填；页面和列表的主要显示标题。 |
| `description` | 强烈建议填写；用于列表、搜索结果和时间线摘要后备值。 |
| `draft` | `true` 时仅本地草稿预览可见，不进入正式实体、关系与时间线校验；发布前改为 `false` 或删除。 |
| `weight` | 同一栏目内的人工排序值；数值越小越靠前。它与 `timeline.order_hint` 不是同一个字段。 |
| `date` / `lastmod` | 现实世界的创建/最后编辑日期，使用 `YYYY-MM-DD`；不能代替世界内 `timeline` 日期。 |
| `aliases` | 页面移动或改名时保留旧 URL，例如 `aliases: ["/history/old-name/"]`。 |
| `keywords` | 搜索辅助词；放别名、旧称、外文名和常用检索词，不要用来代替正文。 |
| `cultures`、`eras`、`topics` | Hugo 分类页使用的数组；必须与 `params.classifications` 中同名数组完全一致。 |

### `params` 实体字段

非草稿页面只要设置了 `params.id`，就要作为可公开引用的实体完整填写其契约。新建独立实体请从对应 `archetypes/` 模板开始，不要凭空删减必填字段。

| 字段 | 选择方式 |
| --- | --- |
| `id` | 全站稳定引用键，格式为小写字母、数字、点、连字符（如 `evt.northern-war`）。公开后不要改；关系、来源和正文 `entity-ref` 都使用它。 |
| `entity_kind` / `schema` | 可选类型：`nation`、`person`、`event`、`concept`、`region`、`organization`、`artifact`、`record`、`species`、`subpage`；`schema` 必须严格写成对应的 `<entity_kind>.v1`。 |
| `canon_status` | `canon`（正式设定）、`draft`（待定设定）、`deprecated`（已废弃设定）。注意这不同于 Hugo 顶层 `draft` 发布状态。 |
| `names` | `official` 必填；`short` 用简称，`native` 用原文名数组，`former` 用旧称数组，`aliases` 用别名数组。 |
| `library` | `catalog_no`、`access_level`、`reliability`、`last_reviewed` 必填；`source_refs` 推荐填写。访问等级可选 `public`、`restricted`、`classified`；可信度可选 `verified`、`partially-verified`、`contested`、`unverified`。 |
| `classifications` | 必须包含数组 `cultures`、`eras`、`regions`、`government_forms`、`topics`。使用既有词表值；前三者中的 `cultures`、`eras`、`topics` 必须同步到顶层字段。 |
| `relations` | 数组；每项至少写 `type` 和 `target`，可选 `note`、`period`、`reliability`、`source_refs`。只维护事实的正向一侧，反向链接会自动生成。 |
| `allow_orphan` | 仅在实体暂时或确实不应关联其他公开实体时设为 `true`，用于消除孤立实体警告；应在提交说明中解释原因。 |
| `timeline` | 将实体加入世界内时间线。完整可选参数、日期格式、公元前排序与案例见 [`docs/stage-7-timeline-editor-workflow.md`](docs/stage-7-timeline-editor-workflow.md)。 |

`relations[].type` 必须使用已登记关系类型，例如 `located_in`、`part_of`、`member_of`、`founded_by`、`ruled_by`、`allied_with`、`participated_in`、`caused`、`affected`、`documented_by`、`related_to`。不确定语义时先查阅 [`docs/relationship-guide.md`](docs/relationship-guide.md)，不要临时发明类型。

分类、访问等级、可信度等受控值以 `data/vocabularies/` 为准。没有合适值时，不要先在词条中自由填写；应先按 [`docs/taxonomy-guide.md`](docs/taxonomy-guide.md) 的流程新增词表。

## 加入世界时间线

在实体 Front Matter 的 `params` 中添加：

```yaml
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

`display` 是读者看到的日期。

`sort_value` 只用于排序，可以采用项目内部统一数值，不需要等于现实年份。

## 日期范围

```yaml
timeline:
  include: true
  calendar: "default"
  categories:
    - "war"
  status: "verified"

  start:
    display: "第三纪元187年"
    sort_value: 187000

  end:
    display: "第三纪元191年"
    sort_value: 191000
```

## 约数

```yaml
start:
  display: "第三纪元约187年"
  sort_value: 187000
  circa: true
```

## 日期不详

```yaml
timeline:
  include: true
  undated: true
  undated_label: "发生年代不详"
  order_hint: 20
  categories:
    - "discovery"
  status: "unknown"
```

## 争议日期

```yaml
timeline:
  include: true
  calendar: "default"
  categories:
    - "politics"
  status: "disputed"

  start:
    display: "第三纪元187年"
    sort_value: 187000

  variants:
    - display: "第三纪元185年"
      sort_value: 185000
      note: "来自北部抄本。"
      source_refs:
        - "rec.northern-copy"

    - display: "第三纪元189年"
      sort_value: 189000
      note: "来自王室年表。"
      source_refs:
        - "rec.royal-chronicle"
```

## 上传图片

进入页面所属目录，选择：

```text
Add file → Upload files
```

把图片与页面放在同一个 Page Bundle 中，然后在 Markdown 中写：

```markdown
![图片替代文字](map.webp "图片说明")
```

## 查看发布状态

提交后进入：

```text
Actions → Build and deploy Hugo Wiki
```

绿色勾表示更新已发布。

红色叉表示内容校验或构建失败。打开失败步骤即可看到：

- 出错文件；
- 错误代码；
- 无效稳定 ID；
- 未注册关系类型；
- 不存在的关系目标；
- 无效时间线字段。

## 本地预览

首次使用双击：

```text
tools/setup-wiki.cmd
```

之后双击：

```text
tools/preview-wiki.cmd
```

该预览包含真实 Pagefind 搜索。

只检查内容：

```text
tools/check-wiki.cmd
```
