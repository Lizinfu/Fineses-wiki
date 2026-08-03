# 世界观图书馆 Wiki：文件结构与实施计划

> **历史架构蓝图（非当前操作手册）**：本文件记录项目的目标结构、设计取舍和阶段性设想，目录样例与阶段描述可能包含尚未实施或已被整合的组件。当前仓库结构、命令和质量门禁以根目录 `README.md`、`scripts/README.md`、`.github/workflows/` 及 `docs/` 专题规范为准。不要根据本文件创建早期样例中的空脚本或重复命令。

## 一、总体技术方案

建议采用以下组合：

* **静态站点生成器：Hugo**
* **代码与内容管理：GitHub**
* **自动构建与发布：GitHub Actions + GitHub Pages**
* **站内全文检索：Pagefind**
* **前端交互：原生 TypeScript/JavaScript + CSS**
* **内容格式：Markdown + YAML Front Matter**
* **内容校验：JSON Schema + 自定义校验脚本**
* **大型媒体：前期随页面资源管理，达到容量阈值后迁移至独立对象存储或 CDN**

Hugo 的内容目录天然可以映射为网站逻辑结构，并支持 Section、嵌套 Section 与 Page Bundle，适合构建多层级档案库。Page Bundle 还能将人物立绘、国旗、地图、图表等资源与具体条目放在一起。

当前 Hugo 已采用新的模板目录约定。项目应按照 Hugo 0.146 之后的结构使用 `layouts/_partials`、`layouts/_shortcodes`，避免照搬旧教程中的 `layouts/_default`、`layouts/partials` 等路径；同时在项目和 CI 中锁定一个经过测试的 Hugo 版本。

GitHub Pages 应只负责发布生成后的静态 HTML、CSS 和 JavaScript。部署使用 GitHub Actions，`public/` 不进入版本库，由每次构建重新生成。

---

# 二、核心架构原则

## 1. 物理目录按照“实体类型”组织

国家、人物、历史事件、概念、地区等属于稳定的实体类型，应成为 `content/` 下的一级 Section。

不要把人物文件直接放进所属国家目录，也不要把历史事件只放在某个国家的历史目录中。一个人物可能跨越多个国家，一个事件也可能涉及多个地区和组织。

正确方式是：

* 人物只有一份主档案；
* 历史事件只有一份主档案；
* 国家页面通过关系字段自动列出相关人物和事件；
* 地区、组织、物品同样通过稳定 ID 建立联系。

这样可以避免同一设定被复制到多个页面后产生版本冲突。

## 2. 网站导航层级与文件目录相互独立

物理内容可以分成九至十种实体类型，但用户界面不需要展示九至十个同级入口。

建议用户侧一级导航保持在六项左右：

1. **阅览大厅**
2. **国家与地区**
3. **人物与组织**
4. **历史与年代**
5. **概念与档案**
6. **检索中心**

例如“国家与地区”门户可以同时聚合：

* 国家
* 行政区
* 地理区域
* 生态区
* 物种
* 地图

这样既保证后台分类严格，也避免前台导航过于碎片化。

## 3. Section、Taxonomy 和 Data 各负其责

### Section：实体本身

用于存储可以独立阅读、引用和维护的对象：

* 国家
* 人物
* 历史事件
* 地区
* 组织
* 物种
* 物品
* 概念
* 原始文献

### Taxonomy：横向分类

用于筛选多个实体共有的属性：

* 文化圈
* 历史时代
* 政体类型
* 生态类型
* 主题领域
* 档案可信度
* 公开级别
* 设定状态

Hugo 支持自定义 Taxonomy，并能自动生成分类与分类项页面。

### Data：受控词表和全局数据

用于存储不是独立文章、但需要全站统一使用的数据：

* 历法定义
* 年代排序规则
* 关系类型
* 政体类型表
* 档案可信度等级
* 图书馆机构信息
* 导航配置
* 地图图层配置

Hugo 可以从 `data/` 读取 YAML、JSON、TOML 等数据，并将其作为全站数据结构使用。

## 4. 每个实体必须拥有不可变 ID

页面标题、国家名称、人物姓名、URL 都可能修改，因此关系不能依赖标题或文件路径。

建议采用：

```text
nat.karst
per.elen-voss
evt.iron-rain-0187
reg.northern-basin
org.central-archive
con.resonance-theory
art.black-crown
rec.expedition-log-0042
```

规则：

* ID 创建后原则上永不修改；
* 显示名称可以任意修改；
* URL 修改时通过 `aliases` 保留旧地址；
* 所有关系引用 ID，不引用标题；
* 构建时检查重复 ID 和不存在的目标 ID。

## 5. “图书馆设定”应成为表现层，而不是内容障碍

沉浸感主要通过以下元素实现：

* 馆藏编号
* 档案来源
* 发现状态
* 可信度
* 修订记录
* 访问级别
* 缺失页和损坏记录
* 馆员批注
* 原始文献与二手整理的区别

但必须保证：

* 正文始终易读；
* 重要功能不依赖动画；
* 不使用难以辨认的仿旧字体承载长文本；
* “损坏”“涂黑”等效果不得破坏关键信息；
* 图书馆叙事界面可以关闭或弱化；
* 移动端保持完整功能。

---

# 三、建议文件结构

```text
world-library-wiki/
│
├── .github/
│   ├── workflows/
│   │   ├── validate.yml
│   │   ├── deploy-pages.yml
│   │   └── scheduled-audit.yml
│   ├── ISSUE_TEMPLATE/
│   │   ├── new-entry.yml
│   │   ├── correction.yml
│   │   └── feature-request.yml
│   ├── CODEOWNERS
│   └── pull_request_template.md
│
├── archetypes/
│   ├── default.md
│   ├── nation.md
│   ├── person.md
│   ├── event.md
│   ├── concept.md
│   ├── region.md
│   ├── species.md
│   ├── organization.md
│   ├── artifact.md
│   └── record.md
│
├── assets/
│   ├── styles/
│   │   ├── tokens.css
│   │   ├── reset.css
│   │   ├── base.css
│   │   ├── typography.css
│   │   ├── layout.css
│   │   ├── utilities.css
│   │   ├── components/
│   │   │   ├── navigation.css
│   │   │   ├── search.css
│   │   │   ├── infobox.css
│   │   │   ├── catalog-card.css
│   │   │   ├── timeline.css
│   │   │   ├── relation-list.css
│   │   │   ├── archive-stamp.css
│   │   │   └── modal.css
│   │   ├── pages/
│   │   │   ├── home.css
│   │   │   ├── entity.css
│   │   │   ├── portal.css
│   │   │   └── search-page.css
│   │   └── print.css
│   │
│   ├── scripts/
│   │   ├── app.ts
│   │   ├── search.ts
│   │   ├── navigation.ts
│   │   ├── table-of-contents.ts
│   │   ├── timeline.ts
│   │   ├── relation-graph.ts
│   │   ├── map-viewer.ts
│   │   └── accessibility.ts
│   │
│   ├── icons/
│   └── images/
│       └── library-interface/
│
├── config/
│   └── _default/
│       ├── hugo.toml
│       ├── params.toml
│       ├── menus.toml
│       ├── taxonomies.toml
│       ├── outputs.toml
│       └── languages.toml
│
├── content/
│   ├── _index.md
│   │
│   ├── library/
│   │   ├── _index.md
│   │   ├── about.md
│   │   ├── catalog-rules.md
│   │   ├── access-policy.md
│   │   ├── recovery-log/
│   │   │   ├── _index.md
│   │   │   └── ...
│   │   ├── notices/
│   │   │   ├── _index.md
│   │   │   └── ...
│   │   └── collections/
│   │       ├── _index.md
│   │       └── ...
│   │
│   ├── nations/
│   │   ├── _index.md
│   │   └── nat-example/
│   │       ├── _index.md
│   │       ├── overview.md
│   │       ├── government.md
│   │       ├── history.md
│   │       ├── society-and-culture.md
│   │       ├── economy.md
│   │       ├── military.md
│   │       ├── diplomacy.md
│   │       └── media/
│   │           ├── flag.svg
│   │           ├── emblem.svg
│   │           ├── map.webp
│   │           └── cover.webp
│   │
│   ├── character/
│   │   ├── _index.md
│   │   └── per-example/
│   │       ├── index.md
│   │       ├── portrait.webp
│   │       └── gallery/
│   │
│   ├── history/
│   │   ├── _index.md
│   │   ├── eras/
│   │   │   ├── _index.md
│   │   │   └── era-example/
│   │   │       └── _index.md
│   │   └── events/
│   │       ├── _index.md
│   │       └── evt-example/
│   │           ├── index.md
│   │           └── media/
│   │
│   ├── concepts/
│   │   ├── _index.md
│   │   ├── institutions/
│   │   ├── religions/
│   │   ├── languages/
│   │   ├── philosophy/
│   │   ├── science-and-technology/
│   │   ├── economy-and-trade/
│   │   ├── law-and-government/
│   │   ├── customs/
│   │   └── metaphysics/
│   │
│   ├── regions/
│   │   ├── _index.md
│   │   └── reg-example/
│   │       ├── _index.md
│   │       ├── geography.md
│   │       ├── settlements.md
│   │       ├── ecology.md
│   │       ├── history.md
│   │       ├── map.svg
│   │       └── subregions/
│   │
│   ├── ecology/
│   │   ├── _index.md
│   │   ├── biomes/
│   │   ├── species/
│   │   ├── diseases/
│   │   └── natural-phenomena/
│   │
│   ├── organizations/
│   │   ├── _index.md
│   │   ├── governments/
│   │   ├── companies/
│   │   ├── military/
│   │   ├── religious/
│   │   ├── academic/
│   │   └── factions/
│   │
│   ├── artifacts/
│   │   ├── _index.md
│   │   ├── objects/
│   │   ├── technologies/
│   │   ├── materials/
│   │   ├── weapons/
│   │   ├── vehicles/
│   │   └── artworks/
│   │
│   ├── records/
│   │   ├── _index.md
│   │   ├── reports/
│   │   ├── letters/
│   │   ├── transcripts/
│   │   ├── laws/
│   │   ├── newspapers/
│   │   └── fragments/
│   │
│   └── portals/
│       ├── _index.md
│       ├── world-catalog.md
│       ├── atlas.md
│       ├── timeline.md
│       ├── character-directory.md
│       ├── organization-directory.md
│       └── taxonomy-browser.md
│
├── data/
│   ├── vocabularies/
│   │   ├── entity-kinds.yaml
│   │   ├── relation-types.yaml
│   │   ├── canon-statuses.yaml
│   │   ├── access-levels.yaml
│   │   ├── reliability-levels.yaml
│   │   ├── government-forms.yaml
│   │   └── culture-groups.yaml
│   ├── calendars/
│   │   ├── calendar-systems.yaml
│   │   ├── eras.yaml
│   │   └── conversion-rules.yaml
│   ├── navigation/
│   │   ├── portals.yaml
│   │   └── featured-collections.yaml
│   ├── maps/
│   │   ├── layers.yaml
│   │   └── locations.yaml
│   ├── library/
│   │   ├── institution.yaml
│   │   └── interface-copy.yaml
│   └── generated/
│       ├── id-index.json
│       ├── backlinks.json
│       ├── timeline.json
│       └── entity-counts.json
│
├── i18n/
│   ├── zh-cn.yaml
│   └── en.yaml
│
├── layouts/
│   ├── baseof.html
│   ├── home.html
│   ├── page.html
│   ├── list.html
│   ├── section.html
│   ├── taxonomy.html
│   ├── term.html
│   │
│   ├── nations/
│   │   ├── page.html
│   │   └── section.html
│   ├── character/
│   │   ├── page.html
│   │   └── section.html
│   ├── history/
│   │   ├── page.html
│   │   └── section.html
│   ├── regions/
│   │   ├── page.html
│   │   └── section.html
│   ├── portals/
│   │   └── page.html
│   │
│   ├── _partials/
│   │   ├── head/
│   │   ├── shell/
│   │   ├── navigation/
│   │   ├── search/
│   │   ├── entity/
│   │   ├── library/
│   │   ├── timeline/
│   │   ├── map/
│   │   └── ui/
│   │
│   ├── _shortcodes/
│   │   ├── entity-ref.html
│   │   ├── infobox.html
│   │   ├── timeline.html
│   │   ├── relation-list.html
│   │   ├── map.html
│   │   ├── gallery.html
│   │   ├── archive-quote.html
│   │   ├── librarian-note.html
│   │   ├── warning.html
│   │   └── redaction.html
│   │
│   └── _markup/
│       ├── render-link.html
│       ├── render-image.html
│       ├── render-heading.html
│       └── render-table.html
│
├── schemas/
│   ├── common.schema.json
│   ├── nation.schema.json
│   ├── person.schema.json
│   ├── event.schema.json
│   ├── concept.schema.json
│   ├── region.schema.json
│   ├── species.schema.json
│   ├── organization.schema.json
│   ├── artifact.schema.json
│   └── record.schema.json
│
├── scripts/
│   ├── validate-frontmatter.mjs
│   ├── validate-ids.mjs
│   ├── validate-relations.mjs
│   ├── validate-taxonomies.mjs
│   ├── validate-chronology.mjs
│   ├── generate-backlinks.mjs
│   ├── generate-timeline.mjs
│   ├── generate-catalog.mjs
│   ├── check-internal-links.mjs
│   └── check-media-budget.mjs
│
├── tests/
│   ├── fixtures/
│   ├── schema/
│   ├── templates/
│   ├── accessibility/
│   ├── performance/
│   └── visual-regression/
│
├── docs/
│   ├── information-architecture.md
│   ├── content-model.md
│   ├── taxonomy-guide.md
│   ├── relationship-guide.md
│   ├── editorial-style-guide.md
│   ├── design-system.md
│   ├── accessibility-standard.md
│   ├── contribution-workflow.md
│   ├── release-process.md
│   └── decisions/
│       ├── 0001-content-model.md
│       ├── 0002-stable-ids.md
│       └── ...
│
├── static/
│   ├── favicon/
│   ├── manifest.webmanifest
│   ├── robots.txt
│   └── social/
│
├── .editorconfig
├── .gitignore
├── .markdownlint.json
├── .prettierrc
├── .tool-versions
├── package.json
├── package-lock.json
├── Makefile
├── README.md
├── CONTRIBUTING.md
└── LICENSE
```

Hugo 官方基础目录本身包括 `archetypes`、`assets`、`content`、`data`、`i18n`、`layouts`、`static` 等；构建时产生 `public` 和通常存在的 `resources` 目录。上述结构是在此基础上针对大型世界观项目进行扩展。

---

# 四、内容目录使用规则

## 1. `_index.md` 与 `index.md`

### 使用 `_index.md`

表示一个可以拥有下级页面和列表页的 Section 或 Branch Bundle，例如：

```text
content/nations/nat-example/_index.md
```

适合国家、大地区、历史时代等需要拆分多个子页面的复杂对象。

### 使用 `index.md`

表示一个 Leaf Bundle，适合人物、单个物种、单个事件、单件物品：

```text
content/character/per-example/index.md
```

其目录中可以包含图片和附件，但不再包含其他独立内容页面。

Hugo 将带有 `_index.md` 的目录视为 Section，并为其建立逻辑上的父子关系和列表页面。

## 2. 国家条目的拆分原则

当国家条目较短时，允许全部内容放进 `_index.md`。

当条目超过约五至八个主要章节时，拆分为固定子页面：

* 概览
* 政体与行政
* 历史
* 社会与文化
* 经济
* 军事
* 外交
* 地理与生态

历史页面只负责叙述与总结。具体历史事件仍然存放在：

```text
content/history/events/
```

国家历史页面通过关系数据自动列出相关事件。

## 3. 页面资源就近存放

与单个实体强相关的资源放入实体 Page Bundle：

```text
per-example/
├── index.md
├── portrait.webp
├── signature.svg
└── gallery/
```

全站共用图标、界面纹理和背景放在 `assets/`。

不建议把全部图片放进一个巨大的全局 `static/images/` 目录，否则后期难以确认图片归属、使用情况和废弃状态。

---

# 五、统一 Front Matter 模型

Hugo 的 Front Matter 可用于描述内容、建立内容关系、控制发布和选择模板。自定义字段建议统一放在 `params` 下，避免与 Hugo 保留字段冲突。

建议基础结构如下：

```yaml
---
title: "显示标题"
description: "用于列表、搜索结果和页面摘要的简短说明"
date: 2026-07-15
lastmod: 2026-07-15
draft: true
weight: 100
aliases: []

params:
  id: "nat.example"
  schema: "nation.v1"
  entity_kind: "nation"

  canon_status: "canon"
  spoiler_level: 0
  sort_key: "example"

  names:
    official: "正式名称"
    short: "简称"
    native: []
    former: []
    aliases: []

  library:
    catalog_no: "NAT-0001"
    access_level: "public"
    provenance: "recovered"
    reliability: "verified"
    last_reviewed: "2026-07-15"
    source_refs: []

  chronology:
    established:
      calendar: "cal.standard"
      display: "第三纪元187年"
      sort_value: 30187
      precision: "year"
    dissolved: null

  classifications:
    cultures: []
    eras: []
    regions: []
    government_forms: []
    topics: []

  relations:
    - type: "capital"
      target: "reg.example-capital"
    - type: "predecessor"
      target: "nat.old-example"
      period: null
      note: ""

  display:
    hero: "media/cover.webp"
    emblem: "media/emblem.svg"
    presentation: "standard"
---
```

## 字段设计注意事项

### 现实日期与世界内日期分离

* `date`、`lastmod`：现实中的网站编辑和更新时间；
* `params.chronology`：世界观内部日期。

不得把“建国于第三纪元187年”直接写进 Hugo 的 `date` 字段，否则排序、SEO 和修订记录会混乱。

### 关系使用统一数组

建议不要为每种关系建立不同字段：

```yaml
allies:
enemies:
members:
children:
teachers:
```

统一使用：

```yaml
relations:
  - type: "member_of"
    target: "org.example"
```

这样未来可以追加：

* 时间范围
* 关系可信度
* 信息来源
* 双向或单向性质
* 关系说明

并能统一生成关系网络和反向链接。

### 档案可信度独立于设定正史状态

建议区分：

* `canon_status`：该内容在创作团队内部是否属于正式设定；
* `library.reliability`：世界内图书馆认为该资料是否可信。

例如一个页面可以是正式设定，但其内容是一份不可靠叙述者写下的宣传文件。

---

# 六、建议受控分类体系

初期不要开放完全自由的标签。自由标签很容易产生：

```text
军事
军队
军事组织
军方
武装力量
```

建议先建立受控词表。

## 一级实体类型

* nation
* person
* event
* concept
* region
* biome
* species
* organization
* artifact
* record

## 横向 Taxonomy

* cultures
* eras
* government-forms
* biomes
* topics
* canon-statuses
* access-levels
* reliability-levels

## 关系类型

至少应预先定义：

* located_in
* capital_of
* part_of
* predecessor
* successor
* member_of
* founded_by
* ruled_by
* allied_with
* hostile_to
* participated_in
* caused
* affected
* created_by
* owned_by
* documented_by
* related_to

关系类型必须在 `data/vocabularies/relation-types.yaml` 注册，编辑者不得随意创造拼写变体。

---

# 七、页面层级设计

建议控制在四层以内：

```text
L0  阅览大厅
L1  门户页面
L2  分类、集合或目录
L3  实体主页面
L4  实体子页面
```

示例：

```text
阅览大厅
└── 国家与地区
    └── 北方文化圈
        └── 某国
            └── 政体与行政
```

每个正文页面应固定包含：

1. 全局导航
2. 全局搜索
3. 面包屑
4. 页面标题及档案状态
5. 摘要
6. 信息框
7. 正文
8. 当前页面目录
9. 关系与关联条目
10. 引用来源或馆藏来源
11. 修订记录
12. 上一条、下一条或同类条目

至少保证用户可以通过两种路径找到一个重要条目：

* 门户或分类目录；
* 搜索或关系链接。

---

# 八、检索系统规划

建议使用 Pagefind，而不是在浏览器启动时一次性加载全部条目的 JSON。

Pagefind 在 Hugo 完成构建后扫描静态 HTML，并将搜索索引写入生成目录；它不需要搜索服务器，并支持自定义搜索界面、过滤器、元数据和多语言索引。

## 第一阶段搜索能力

* 标题搜索
* 别名搜索
* 正文全文搜索
* 馆藏编号搜索
* 按实体类型过滤
* 按时代过滤
* 按文化圈过滤
* 按公开级别过滤
* 按可信度过滤

## 第二阶段搜索能力

* 拼音或罗马字别名
* 搜索建议
* 最近访问
* 搜索历史
* 组合筛选
* 无关键词的分类浏览
* 按时间、名称、相关度排序
* 搜索结果直接定位到正文小节

Pagefind 可以限定实际进入索引的正文区域，避免导航栏、页脚和装饰性图书馆文字干扰结果。

## 搜索质量指标

建立一套固定搜索测试集，例如：

* 搜正式名称
* 搜简称
* 搜旧称
* 搜人物所属组织
* 搜某战争参与国家
* 搜某生态区物种
* 搜馆藏编号
* 搜正文中的特定术语

验收目标：

* 核心测试词前五位命中率不低于 90%；
* 正式名称和馆藏编号应排名第一；
* 所有过滤器结果数量与实际条目一致；
* 搜索结果中不得出现导航、页脚等噪声文字；
* 搜索关闭或脚本加载失败时，分类目录仍然可用。

---

# 九、分阶段实施路径

## 阶段 0：确定项目边界和发布策略

### 任务

* 确定网站是纯公开 Wiki，还是包含未公开设定；
* 确定内容的唯一权威来源；
* 确定初期语言；
* 确定目标浏览器和移动端范围；
* 确定哪些功能属于首发版本；
* 确定编辑、审核和发布角色。

### 实现内容

形成以下决策记录：

* 公开内容与内部内容是否分库；
* 是否允许直接在 GitHub 编辑；
* 是否采用 Pull Request 审核；
* 是否保留世界内“访问级别”表现；
* 是否需要英文或其他语言；
* 是否需要真实地图交互；
* 是否需要展示版本历史。

### 验收指标

* 所有内容都有明确的发布边界；
* 所有团队成员知道哪个仓库是权威来源；
* 首发功能与后续功能有明确分界；
* 不存在“先把秘密内容放进去，之后再隐藏”的做法。

### 重要安全约束

GitHub Pages 发布的是公开可访问的静态文件。世界内的“机密”“受限访问”只能作为视觉和叙事表现，不能当作真实权限控制。任何进入公开构建产物的内容都应视为已经公开。

如果存在未发布剧情或内部设定，推荐：

```text
world-bible-private    内部设定源
world-wiki-public      经过审核后发布的公开内容
```

不要依赖 CSS 遮挡、前端密码或“涂黑效果”保护秘密内容。

---

## 阶段 1：建立信息架构与内容清单

### 任务

* 盘点现有设定文档；
* 提取实体类型；
* 识别重复信息；
* 识别实体之间的关系；
* 确定门户结构；
* 建立第一版分类词表。

### 实现内容

选取一批代表性内容作为样本，至少覆盖：

* 大型国家
* 小型政治实体
* 跨国人物
* 多方参与的历史事件
* 抽象概念
* 地区和生态
* 组织
* 物品
* 原始文献
* 存在争议或信息缺失的档案

根据样本验证文件结构，而不是先为整个世界建立大量空目录。

### 验收指标

* 100% 样本内容可以明确归入一个主实体类型；
* 同一事实只存在一个权威来源；
* 不超过 10% 的条目存在归类争议；
* 重要条目可以通过至少两条路径访问；
* 用户侧主要导航不超过七项；
* 页面逻辑深度原则上不超过四层。

---

## 阶段 2：建立仓库、Hugo 骨架和开发环境

### 任务

* 创建 GitHub 仓库；
* 初始化 Hugo；
* 建立上述基础目录；
* 锁定 Hugo 与 Node 版本；
* 配置本地开发命令；
* 配置基础 Git 规则；
* 建立最小构建流程。

### 实现内容

建议统一命令：

```text
make dev
make validate
make build
make search
make preview
```

其中：

```text
make build
  1. 校验内容
  2. 生成关系索引
  3. 执行 Hugo 构建
  4. 执行 Pagefind 索引
```

### 验收指标

* 新成员从干净仓库开始，按照 README 可以完成本地启动；
* 不需要手动修改机器上的全局配置；
* Hugo 和 CI 使用同一版本；
* `public/` 不进入版本库；
* 最小示例网站可以通过 GitHub Actions 构建；
* 本地构建和 CI 构建结果一致。

---

## 阶段 3：建立内容模型、Schema 与 Archetype

### 任务

* 编写公共字段 Schema；
* 编写各实体类型 Schema；
* 建立稳定 ID 规则；
* 建立关系类型表；
* 建立历史日期模型；
* 建立对应 Archetype；
* 建立内容编辑规范。

Hugo 的 Archetype 可以作为新内容模板，通过 `hugo new content` 自动生成预设 Front Matter 和正文结构。

### 实现内容

例如创建人物时：

```text
hugo new content character/per-example/index.md
```

应自动提供：

* ID
* Schema 版本
* 正史状态
* 档案可信度
* 名称字段
* 生卒时间
* 所属地区
* 人物关系
* 来源文献
* 标准正文标题

### 验收指标

* 所有内容文件通过 Schema 校验；
* 重复 ID 数量为零；
* 不存在指向无效 ID 的关系；
* 不存在未注册的关系类型；
* 必填字段完整率达到 100%；
* 新建条目不需要复制旧文件；
* Schema 修改具备明确版本号和迁移说明。

---

## 阶段 4：设计系统和交互原型

### 任务

* 确定视觉语义；
* 建立字体、间距、颜色和边框系统；
* 完成桌面端与移动端页面原型；
* 确定图书馆叙事层的表现强度；
* 完成导航和视线引导测试。

### 实现内容

优先设计六种页面：

1. 阅览大厅
2. 门户页
3. 列表与分类页
4. 普通实体页
5. 大型国家页
6. 搜索页

建立 CSS Token：

* 文字层级
* 页面宽度
* 间距尺度
* 背景层级
* 信息状态
* 可信度状态
* 访问级别
* 交互反馈
* 动画时长

视觉建议：

* 主体保持现代知识库布局；
* 图书馆感来自档案编号、印章、批注、材料层级和微弱的界面痕迹；
* 不以泛黄纸张、噪点和低对比度作为主要视觉手段；
* 重要导航始终具有现代界面清晰度；
* 动画只用于状态转换和视线引导。

### 验收指标

* 正文长时间阅读无明显疲劳；
* 所有功能可通过键盘操作；
* 正文文字和背景满足 WCAG AA 对比度；
* 页面在 320px 宽度下不出现横向溢出；
* 用户能在十秒内识别页面标题、条目类型和主要导航；
* 关闭动画后不影响信息获取；
* 代表页面 Lighthouse Accessibility 目标不低于 95。

---

## 阶段 5：实现模板与可复用组件

### 任务

* 实现全局页面骨架；
* 实现 Section、Taxonomy、Term 模板；
* 实现统一实体页面；
* 实现国家等复杂实体模板；
* 实现 Shortcode 和 Markdown Render Hook；
* 实现响应式媒体；
* 实现打印样式。

Hugo 的 Markdown Render Hook 可以统一控制链接、图片、标题和表格的输出，适合实现内部实体链接、图片说明、档案表格和标题锚点。

### 首批组件

* 全局顶部导航
* 折叠式侧栏
* 面包屑
* 页面目录
* 档案信息框
* 馆藏编号
* 状态标签
* 实体引用
* 关系列表
* 相关条目
* 原始文献引用
* 图片画廊
* 时间节点
* 馆员注释
* 警告和争议信息
* 世界内涂黑文本
* 移动端操作栏

### 验收指标

* 80% 以上实体类型可以复用通用实体模板；
* 新增实体类型不需要修改全局骨架；
* 页面组件不存在大段重复模板代码；
* 内部链接统一生成并验证；
* 图片具备宽高、替代文本和说明；
* 打印或导出 PDF 时正文结构仍然清晰；
* JavaScript 关闭后核心正文和导航仍可使用。

---

## 阶段 6：实现关系、时间线、分类和搜索

### 任务

* 生成全站 ID 索引；
* 生成反向链接；
* 生成时间线数据；
* 生成实体数量和分类统计；
* 集成 Pagefind；
* 实现组合过滤；
* 建立孤立条目检测。

### 实现内容

构建前脚本扫描所有内容，生成：

```text
data/generated/id-index.json
data/generated/backlinks.json
data/generated/timeline.json
data/generated/entity-counts.json
```

页面可以自动展示：

* “该人物参与的历史事件”
* “该组织影响的地区”
* “提及该概念的文献”
* “与该国家存在外交关系的政治实体”
* “引用本条目的其他档案”
* “同一时代的相关内容”

### 时间线模型要求

必须支持：

* 单一日期
* 日期范围
* 约数
* 年份不详
* 多套历法
* 世界内纪年与内部排序值分离
* 事件存在争议的多个日期版本

### 验收指标

* 反向链接与正向关系一致；
* 孤立实体数量为零，或全部有明确豁免原因；
* 时间线排序结果通过人工样本检查；
* 搜索测试集前五位命中率达到 90%；
* 搜索支持实体类型和至少三个横向分类过滤；
* 页面重命名后关系链接不受影响；
* 页面小节可以直接从搜索结果定位。

---

## 阶段 7：建立 CI、质量门禁和 GitHub Pages 部署

### 任务

* 配置 Pull Request 校验；
* 配置主分支部署；
* 配置内容和链接审计；
* 配置构建缓存；
* 配置失败报告；
* 建立回滚流程。

### Pull Request 流程

每次提交依次执行：

```text
1. Markdown 格式检查
2. Front Matter Schema 校验
3. ID 唯一性校验
4. 关系目标校验
5. Taxonomy 词表校验
6. 世界内日期校验
7. 内部链接校验
8. Hugo 构建
9. Pagefind 索引
10. HTML 与基础可访问性检查
```

### 主分支部署流程

```text
checkout
→ 安装固定版本 Hugo
→ 安装 Node 依赖
→ 执行内容校验
→ 生成派生数据
→ hugo --minify
→ pagefind --site public
→ 上传 Pages artifact
→ 部署 GitHub Pages
```

GitHub Pages 的自定义工作流支持分别构建、上传和部署静态产物。部署任务需要相应的 Pages 和身份权限。

### 验收指标

* 主分支不允许绕过必要检查；
* 所有部署均可追溯到具体提交；
* 构建失败不会覆盖上一版可用网站；
* 可以快速回滚到上一稳定提交；
* 常规构建目标控制在五分钟内；
* GitHub Pages 的硬性部署超时为十分钟，因此任何长期接近十分钟的构建都应视为需要优化。

---

## 阶段 8：代表性内容试运行

### 任务

* 用真实设定填充所有实体类型；
* 检查内容模型是否适合实际写作；
* 检查长页面和复杂关系；
* 进行编辑者测试和读者测试；
* 修订模板与 Schema。

### 试运行内容应覆盖

* 至少一个内容极长的国家；
* 至少一个历史多次更名的国家；
* 至少一个跨多个国家活动的人物；
* 至少一个多方参与的历史事件；
* 至少一个存在矛盾记载的事件；
* 至少一个拥有大量子地区的大区域；
* 至少一个拥有复杂分类的物种；
* 至少一个需要特殊表现的原始文献；
* 至少一个信息严重缺失的残缺档案。

不要求首批内容数量巨大，但每种结构必须被真实使用。

### 验收指标

* 每种实体类型至少具有若干真实条目；
* 不再依赖临时示例数据；
* 编辑者可以独立创建、修改和关联条目；
* 五个典型检索任务的完成率不低于 90%；
* 核心条目的死链数量为零；
* 不存在只有开发者才能理解的 Front Matter 字段；
* 页面平均可读宽度、标题层级和移动端布局通过人工检查。

---

## 阶段 9：公开测试与正式发布

### 任务

* 开放小范围测试；
* 收集检索失败和导航迷失记录；
* 检查各类设备；
* 优化性能和资源大小；
* 建立内容发布节奏；
* 完成正式域名和基础 SEO 配置。

### 验收指标

* 关键页面无阻断性错误；
* 404 页面可以搜索或返回上级目录；
* 所有公开图片完成压缩；
* 页面标题、描述和社交分享图完整；
* 网站地图与 robots 配置正确；
* 正式版本具备明确版本号或发布日期；
* 建立发布后问题登记与修订流程。

---

## 阶段 10：长期运营和模块扩展

### 任务

* 定期审查失效关系；
* 清理废弃媒体；
* 管理 Schema 版本；
* 维护受控词表；
* 增加地图、关系图和多语言；
* 评估是否需要迁移托管平台。

### 新模块接入标准

新增一个实体模块时，只应需要：

1. 增加一个内容 Section；
2. 增加对应 Schema；
3. 增加 Archetype；
4. 注册实体类型；
5. 配置搜索元数据；
6. 必要时增加专用模板；
7. 增加测试样本。

新增模块不应要求修改：

* 全局页面骨架；
* 全局关系系统；
* 搜索核心逻辑；
* ID 系统；
* 发布流程。

### 扩展验收指标

* 普通新模块可以在不修改核心模板的情况下接入；
* 新关系类型只需注册词表，无需重写关系系统；
* 新分类可以自动生成分类页面和筛选项；
* Schema 升级具有迁移脚本；
* 旧 URL 长期保持可访问；
* 核心内容没有因为界面升级而修改格式。

---

# 十、多语言预留

即使首发只有中文，也建议现在就完成以下预留：

* 所有界面文字进入 `i18n/`；
* 实体 ID 不包含语言；
* URL Slug 与显示名称分离；
* 名称字段支持原文、译名、旧名和别名；
* 图片替代文本可以本地化；
* 不把中文标题直接作为关系键。

Hugo 本身支持多语言内容和对应翻译页面；Pagefind 也能根据页面语言建立独立索引。

首发不必实现多语言内容，但不应建立一个未来无法翻译的内容模型。

---

# 十一、容量与媒体管理

GitHub Pages 当前建议源仓库控制在 1 GB 左右，发布站点不能超过 1 GB，并存在每月 100 GB 的软带宽限制。

因此建议内部目标更加保守：

* Git 仓库目标小于 500 MB；
* 发布产物目标小于 300 MB；
* 普通正文图片优先使用 WebP 或 AVIF；
* SVG 用于图标、国旗、徽章和简化地图；
* 不在仓库中保存无压缩 PSD、工程源文件或视频；
* 高清原图进入独立美术资产库；
* 网站只保存经过发布处理的版本；
* 每次 CI 检查新增媒体大小；
* 单个异常大文件必须阻止合并。

---

# 十二、首发版本与后续版本边界

## 首发版本必须具备

* 稳定内容模型
* 国家、人物、历史、概念、地区生态条目
* 组织、物品和文献基础类型
* 全局搜索
* 分类筛选
* 面包屑
* 页面目录
* 关系与反向链接
* 基础时间线
* 响应式布局
* 内容校验
* 自动部署
* 图书馆视觉外壳

## 首发版本不建议强求

* 大型可视化关系网络
* 完整世界地图 GIS 系统
* 用户账号
* 评论系统
* 在线可视化编辑器
* 复杂权限管理
* 自动机器翻译
* 大规模动态图表
* 离线应用
* 过度复杂的开场动画

这些功能应建立在内容模型稳定之后。否则容易出现视觉和交互已经完成，但底层资料无法维护的问题。

---

# 十三、项目总体验收标准

项目进入正式内容生产前，应至少满足：

1. 所有实体拥有稳定 ID；
2. 所有内容通过 Schema；
3. 所有关系目标有效；
4. 所有分类来自受控词表；
5. 内容、表现和派生数据分离；
6. 国家等复杂条目可以拆分；
7. 人物和事件不会因归属变化而移动文件；
8. 全局搜索和分类目录同时可用；
9. JavaScript 失效时正文仍可阅读；
10. 移动端可以完成完整检索；
11. 新模块不需要重构已有目录；
12. 未公开内容不会进入公开构建；
13. `public/` 和搜索索引均由 CI 生成；
14. 部署可以追溯和回滚；
15. 图书馆沉浸层不会牺牲可读性和可访问性。

---

# 十四、建议的实际执行顺序

正式开始实施时，不建议从首页视觉设计开始。正确顺序是：

```text
内容样本
→ 实体类型
→ ID 与关系
→ Front Matter Schema
→ 文件目录
→ Archetype
→ 基础模板
→ 搜索与反向链接
→ 设计系统
→ 沉浸式表现
→ 内容迁移
→ 发布
```

其中最关键的前三项是：

1. **确定公开内容与内部设定的边界；**
2. **用真实内容验证实体分类和关系模型；**
3. **在大量录入前冻结 ID、Schema 和目录规则。**

只要这三项稳定，后续更换视觉风格、增加地图、追加组织或物品模块，都不会迫使团队重新整理全部世界观文档。
