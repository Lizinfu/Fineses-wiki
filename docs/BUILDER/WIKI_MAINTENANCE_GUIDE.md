# 世界观 Wiki 内容维护与更新手册

> 适用版本：第一至第七阶段完成后的 Hugo + Pagefind Wiki  
> 适用对象：世界观作者、内容编辑者、资料校对者、项目管理员  
> 不要求掌握前端开发。日常维护主要是在 GitHub 网页中编辑 Markdown。

---

## 1. 这套 Wiki 是什么

本项目是一个使用以下技术生成的静态世界观知识库：

- Hugo：把 Markdown 文档生成网页；
- Pagefind：为生成后的网页建立全文搜索索引；
- GitHub：保存全部源文件和修改历史；
- GitHub Actions：自动检查文档、构建网站并更新搜索；
- GitHub Pages：发布最终网站。

编辑者日常只需要维护：

```text
content/
data/
```

绝大多数情况下不需要修改模板、CSS、JavaScript，也不需要接触生成后的
`public/`。

一次正常更新的流程是：

```text
编辑 Markdown
→ 提交到 GitHub
→ 自动检查 ID、关系和时间线
→ 自动生成反向链接
→ Hugo 构建网页
→ Pagefind 重建搜索
→ GitHub Pages 发布
```

---

# 第一部分：Wiki 当前具备的功能

## 2. 阅读与导航

当前 Wiki 支持：

- 首页阅览大厅；
- 数据驱动的馆藏门户；
- 国家与地区、人物与组织、历史、概念、生态等入口；
- Section 目录页；
- Taxonomy 与分类页面；
- 面包屑；
- 桌面端左侧导航；
- 移动端导航抽屉；
- 页面内目录；
- 上一篇与下一篇；
- 深色和浅色主题；
- 手机、平板与桌面响应式布局；
- 键盘操作；
- 减少动画模式；
- JavaScript 关闭时的基础阅读与目录回退。

门户和后台内容目录相互独立。一个读者门户可以聚合多个后台 Section，
因此不需要为了修改导航而移动实体文件。

---

## 3. 实体档案页

普通实体页面会自动显示：

- 条目标题；
- description 摘要；
- 实体类型；
- 稳定 ID；
- 馆藏编号；
- 正史状态；
- 访问等级；
- 档案可信度；
- 名称、简称、旧称和别名；
- 年代字段；
- 分类字段；
- 正文；
- 自动信息框；
- 正向关系；
- 自动反向链接；
- 来源文献；
- 修订与复核信息；
- 时间线定位；
- 子页面导航；
- GitHub 编辑入口。

Front Matter 中没有填写的字段会自动隐藏，不需要填入“无”或空白占位。

---

## 4. 大型实体与子页面

国家、组织或其他大型实体可以拥有多个章节，例如：

```text
岚原
├── 概览
├── 政体与行政
├── 历史
├── 社会与文化
├── 经济
├── 军事
└── 外交
```

大型实体根页面使用 `_index.md`，子章节使用普通 `.md` 或自己的
`index.md` Page Bundle。

页面会自动生成：

- 子档案目录；
- 返回父实体链接；
- 兄弟章节导航；
- 当前章节高亮。

---

## 5. 全文检索

搜索中心支持检索：

- 标题；
- 正文；
- description；
- 正式名称；
- 简称；
- 旧称；
- 别名；
- 稳定 ID；
- 馆藏编号；
- 实体类型；
- 所属 Section；
- 时间线日期；
- 时间线历法；
- 时间线分类。

搜索结果可以：

- 显示摘要；
- 高亮匹配内容；
- 跳转到匹配的小节；
- 按实体类型筛选；
- 按 Section 筛选；
- 通过 URL 保存搜索条件；
- 分批加载结果。

搜索索引由 GitHub Actions 自动生成。内容编辑者不需要手动运行 Pagefind，
也不要提交 `public/pagefind/`。

---

## 6. 关系与反向链接

实体可以通过稳定 ID 建立关系：

```text
人物 → 参与了 → 历史事件
国家 → 首都是 → 城市
人物 → 成员隶属于 → 组织
文献 → 记录了 → 事件
```

系统会自动生成反向链接。例如：

```text
人物页面：
参与了 → 北方战争

北方战争页面：
参与者包括 → 该人物
```

关系可以附带：

- 时间范围；
- 可信度；
- 来源文献；
- 编辑备注。

构建系统会检查：

- 关系类型是否注册；
- 目标稳定 ID 是否存在；
- 来源稳定 ID 是否存在；
- 是否出现重复 ID；
- 是否出现孤立实体。

---

## 7. 世界时间线

世界时间线支持：

- 单一日期；
- 开始与结束日期；
- 约数日期；
- 日期不详；
- 多套历法；
- 统一内部排序轴；
- 争议日期版本；
- 来源文献；
- 可信状态；
- 事件分类；
- 无 JavaScript 的静态时间线。

实体只要填写 `params.timeline`，就会自动进入全局时间线，并在自身页面显示
“年代定位”。世界时间线门户按 `sort_value` 从早到晚完整展示，不提供筛选或
搜索，以便连续阅读。

---

## 8. 图片与画廊

当前支持：

- Markdown 单图；
- 图注；
- 图片替代文字；
- Page Bundle 图片资源；
- 子页面引用父实体图片；
- 响应式 `srcset`；
- 图片宽高；
- 懒加载；
- 点击查看原图；
- 多列图片画廊；
- 手机端自动改为单列。

---

## 9. 世界内档案组件

正文可以使用以下 Shortcode：

- `entity-ref`：通过稳定 ID 引用实体；
- `archive-note`：馆藏修复或档案备注；
- `librarian-note`：馆员批注；
- `warning`：警告、剧透或风险提示；
- `redaction`：遮蔽文字；
- `gallery`：页面图片画廊；
- `figure`、`media-pair`、`map-plate`：有版式的图片、对照图和地图图版；
- `document-excerpt`：世界内文献摘录；
- `infobox`：手动信息框；
- `relation-list`：手动关系列表。

日常实体页优先使用 Front Matter 自动生成信息框与关系。手动 `infobox` 和
`relation-list` 只用于特殊页面。

---

# 第二部分：编辑前需要知道的基础概念

## 10. Markdown

正文使用 Markdown。常用语法：

```markdown
## 二级标题

### 三级标题

普通段落。

**粗体**

*斜体*

- 无序列表
- 第二项

1. 有序列表
2. 第二项

> 引用文字

[链接文字](https://example.com)

| 项目 | 内容 |
|---|---|
| 首都 | 岚京 |
```

页面标题已经由 Front Matter 的 `title` 自动生成，正文通常从 `##` 开始，
不要再写第二个一级标题 `#`。

---

## 11. Front Matter

每个 Markdown 文件顶部由 `---` 包围的 YAML 是 Front Matter：

```yaml
---
title: "岚原"
description: "位于北部盆地的联合制国家。"
draft: true

params:
  id: "nat.lanyuan"
  entity_kind: "nation"
---
```

注意：

- YAML 使用空格缩进；
- 不要使用 Tab；
- 同一层级保持相同缩进；
- 含冒号或特殊符号的文本最好加引号；
- `true` 和 `false` 不加引号；
- 列表项以 `-` 开头。

YAML 缩进错误会阻止网站发布。

---

## 12. 稳定 ID

稳定 ID 是实体之间建立关系的基础，例如：

```text
nat.lanyuan
reg.lanjing
per.example-person
org.northern-council
evt.northern-war-0187
rec.treaty-0187
```

允许字符：

```text
小写英文字母
数字
点号 .
连字符 -
```

不要使用：

- 空格；
- 大写字母；
- 下划线；
- 中文；
- 斜线。

### 最重要的规则

实体公开后，不要因为标题或文件名变化而修改稳定 ID。

页面可以改名，URL 可以调整，稳定 ID 仍然保持不变。关系、反向链接、来源和
精选馆藏都依赖它。

---

## 13. `index.md` 与 `_index.md`

### `index.md`

表示 Leaf Bundle，适合一个独立实体：

```text
content/characters/per-example/
├── index.md
├── portrait.webp
└── map.webp
```

它可以拥有图片，但不能再拥有子页面。

### `_index.md`

表示 Branch Bundle，适合大型实体或目录：

```text
content/nations/nat-lanyuan/
├── _index.md
├── history.md
├── government.md
└── media/
    └── map.webp
```

它可以拥有图片和后代页面。

### 简单判断

```text
只需要一篇正文和图片 → index.md
需要多个独立章节     → _index.md
Section 或目录根页    → _index.md
```

### 全站层级与排序约定

为保证门户、目录、实体根页和子页面采用一致的阅读结构，使用以下固定层级：

```text
门户（content/portals/<key>/_index.md）
→ 内容 Section（例如 content/nations/_index.md）
→ 实体根页（例如 content/nations/nat-example/_index.md）
→ 实体分组目录（例如 region/_index.md，可选）
→ 普通章节或地区条目（.md）
```

不要用空的 `overview.md`、`history.md` 等文件预占位置。尚未开始写的章节应当
不存在；需要时再创建带有完整 Front Matter 的页面。实体根页已经承担“概览”功能，
只有概览确实需要独立长文时才额外建立 `overview.md`。

所有同级页面使用 `weight` 排序，数值越小越靠前。建议采用每 10 一档的固定槽位：

| 层级/页面 | 推荐 `weight` |
|---|---:|
| 一级门户 | 10、20、30… |
| 内容 Section | 10、20、30… |
| 同一 Section 的实体根页 | 10、20、30… |
| 实体专题章节 | 10 概览、20 历史、30 政体、40 社会文化、50 经济、60 军事、70 外交 |
| 实体下的分组目录（如 `region/_index.md`） | 80 |
| 未指定专属顺序的同级地区/城市条目 | 全部 `weight: 10`，再按标题稳定排序 |

目录、子档案清单和相邻页面导航均按这一顺序输出。不要让一个实体的同级章节混用
`10`、`20` 与未设置 `weight`；需要手工排序时，给每页分配唯一的 10 倍数。

---

# 第三部分：如何修改现有条目

## 14. 最简单的方法：在 Wiki 页面中编辑

项目管理员配置编辑入口后，实体页底部会显示：

```text
在 GitHub 编辑本页
查看发布状态
```

修改步骤：

1. 打开需要修改的 Wiki 页面。
2. 点击“在 GitHub 编辑本页”。
3. 在 GitHub 编辑器中修改内容。
4. 点击 **Preview** 检查 Markdown。
5. 点击 **Commit changes**。
6. 根据团队规则：
   - 直接提交到 `main`；或
   - 创建分支和 Pull Request。
7. 等待 GitHub Actions 完成。
8. 打开线上页面并检查结果。

提交后搜索索引、反向链接和时间线都会自动更新。

---

## 15. 通过 GitHub 仓库修改

也可以在仓库中进入：

```text
content/
```

找到对应文件，点击铅笔图标编辑。

常见目录：

```text
content/
├── nations/
├── regions/
├── characters/
├── organizations/
├── history/
├── concepts/
├── artifacts/
├── records/
├── ecology/
├── portals/
├── timeline/
└── search/
```

实际目录以项目仓库为准。

---

## 16. 修改标题

修改：

```yaml
title: "新标题"
```

稳定 ID 不变：

```yaml
params:
  id: "nat.lanyuan"
```

如果标题变化导致 URL 也发生变化，建议在 Front Matter 顶层添加旧地址：

```yaml
aliases:
  - "/nations/old-lanyuan/"
```

这样旧链接可以跳转到新页面。

---

## 17. 修改正文

Front Matter 结束后的内容就是正文：

```markdown
---
title: "岚原"
---

## 概述

这里是新的正文。

## 地理

这里是地理内容。
```

标题层级应连续：

```text
## 主章节
### 子章节
#### 更小的章节
```

不要从 `##` 直接跳到 `####`。

---

## 18. 暂存未完成修改

把：

```yaml
draft: true
```

保留为草稿。

草稿：

- 可以在本地预览；
- 不会进入正式 GitHub Pages；
- 不会进入正式搜索索引；
- 不会进入正式关系图和时间线。

完成审核后改为：

```yaml
draft: false
```

如果一个公开实体仍然引用某个草稿实体，正式校验会报告目标不存在。因此将
实体改成草稿前，应先处理其他公开页面对它的关系。

---

# 第四部分：如何新增条目

## 19. 选择正确的目录

常见对应关系：

| 内容类型 | 推荐目录 | ID 前缀示例 |
|---|---|---|
| 国家或政权 | `content/nations/` | `nat.` |
| 地区或城市 | `content/regions/` | `reg.` |
| 人物 | `content/characters/` | `per.` |
| 组织 | `content/organizations/` | `org.` |
| 历史事件 | `content/history/` | `evt.` |
| 概念或制度 | `content/concepts/` | `con.` |
| 物品或技术 | `content/artifacts/` | `art.` |
| 原始文献 | `content/records/` | `rec.` |
| 生态或物种 | `content/ecology/` | `eco.` |

前缀是项目约定，不是 Hugo 强制规则。建立新类型前应先由项目维护者确认命名
规范。

---

## 20. 推荐的新实体结构

```text
content/characters/per-example/
├── index.md
├── portrait.webp
└── gallery/
    ├── formal.webp
    └── expedition.webp
```

`index.md` 示例：

```yaml
---
title: "示例人物"
description: "一句话说明人物身份与重要性。"
date: "2026-07-22"
lastmod: "2026-07-22"
weight: 10
draft: true

params:
  id: "per.example-person"
  schema: "character.v1"
  entity_kind: "character"
  canon_status: "canon"

  names:
    official: "示例人物"
    short: ""
    native: []
    former: []
    aliases: []

  library:
    catalog_no: "PER-0001"
    access_level: "public"
    reliability: "verified"
    last_reviewed: "2026-07-22"
    source_refs: []

  chronology: {}

  classifications:
    cultures: []
    eras: []
    regions: []
    topics: []

  relations: []

  display:
    hero: "portrait.webp"
---

## 概述

在这里填写人物概述。

## 生平

在这里填写人物生平。

## 关系

关系数据请优先填写在 Front Matter 的 `relations` 中。
```

### 当前最小实体契约

所有公开实体必须保留以下 `params` 字段：

```text
id、schema、entity_kind、canon_status、names、classifications、relations、library
```

其中 `library` 必须包含 `catalog_no`、`access_level`、`reliability` 和
`last_reviewed`。`schema` 固定采用 `<entity_kind>.v1`，例如人物为
`person.v1`、国家为 `nation.v1`。顶层的 `cultures`、`eras`、`topics` 保留
给 Hugo Taxonomy，且必须与 `params.classifications` 中的同名数组一致。

项目在提交与发布前会运行：

```text
npm run content:model:validate
npm run wiki:validate
```

第一条命令检查最小契约与受控枚举；第二条会进一步检查稳定 ID、关系目标、
关系类型与时间线。不要删除空数组：没有关系时写 `relations: []`；确实尚无
语义关系的独立实体，写 `allow_orphan: true` 并在补充真实关联后移除它。

新建时先保持：

```yaml
draft: true
```

确认页面、关系、图片和时间线无误后再发布。

---

## 21. 新建大型国家

目录：

```text
content/nations/nat-lanyuan/
├── _index.md
├── overview.md
├── government.md
├── history.md
├── society-and-culture.md
├── economy.md
└── media/
    ├── flag.svg
    └── map.webp
```

根页面 `_index.md`：

```yaml
---
title: "岚原"
description: "位于北部盆地的联合制国家。"
weight: 10
draft: true

params:
  id: "nat.lanyuan"
  schema: "nation.v1"
  entity_kind: "nation"
  canon_status: "canon"

  library:
    catalog_no: "NAT-0001"
    access_level: "public"
    reliability: "verified"
    source_refs: []

  relations: []

  display:
    hero: "media/map.webp"
---
```

子页面 `government.md`：

```yaml
---
title: "政体与行政"
description: "岚原的国家制度、中央机构和行政区划。"
weight: 20
draft: true

params:
  entity_kind: "nation-chapter"
---
```

### 子页面是否需要稳定 ID

普通章节通常不需要自己的稳定 ID。

只有当该子页面本身需要：

- 被其他实体关系引用；
- 独立进入关系图；
- 作为独立来源；
- 拥有独立时间线记录；

才应将其建模为独立实体并分配稳定 ID。

---

# 第五部分：名称、馆藏与分类字段

## 22. 名称

```yaml
params:
  names:
    official: "岚原联合国"
    short: "岚原"
    native:
      - "本地语言名称"
    former:
      - "旧国名"
    aliases:
      - "北方联合体"
      - "岚原共和国"
```

这些字段会进入：

- 自动信息框；
- 搜索索引；
- 实体识别信息。

---

## 23. 馆藏信息

```yaml
params:
  library:
    catalog_no: "NAT-0001"
    access_level: "public"
    reliability: "verified"
    last_reviewed: "2026-07-22"
    source_refs:
      - "rec.archive-report-0042"
```

常见可信度建议值：

```text
verified
reliable
uncertain
disputed
damaged
unknown
```

实际允许值应以项目 Schema 和词表为准。

`source_refs` 必须使用已存在实体的稳定 ID。

---

## 24. 分类

```yaml
params:
  classifications:
    cultures:
      - "north-basin"
    eras:
      - "third-era"
    regions:
      - "northern-continent"
    government_forms:
      - "federation"
    topics:
      - "diplomacy"
      - "industry"
```

分类值应尽量使用项目已经存在的词表，不要因为大小写或拼写不同创建多个相似
分类。

---

# 第六部分：关系与来源

## 25. 添加关系

```yaml
params:
  relations:
    - type: "allied_with"
      target: "nat.example-ally"

      period:
        start: "第三纪元187年"
        end: "第三纪元241年"

      reliability: "verified"

      source_refs:
        - "rec.treaty-0187"

      note: "双方在北方战争结束后签订正式同盟。"
```

必填：

```text
type
target
```

可选：

```text
period
reliability
source_refs
note
```

---

## 26. 关系目标

`target` 必须填写稳定 ID：

```yaml
target: "nat.example-ally"
```

不要填写：

```yaml
target: "示例盟国"
target: "/nations/example/"
```

构建程序会用稳定 ID 查找目标。

---

## 27. 关系类型

关系类型在这里注册：

```text
data/vocabularies/relation-types.yaml
```

示例：

```yaml
relation_types:
  - id: "participated_in"
    label: "参与了"
    reverse_label: "参与者包括"
    symmetric: false
    description: "人物、组织或国家参与目标历史事件。"
```

字段：

- `id`：Front Matter 中使用；
- `label`：正向显示名称；
- `reverse_label`：目标页上的反向名称；
- `symmetric`：是否为对等关系；
- `description`：编辑说明。

新增关系类型前，先确认现有词表中没有语义重复的类型。

---

## 28. 自动反向链接

编辑者只维护一侧关系。

例如：

```yaml
# 人物页面
relations:
  - type: "participated_in"
    target: "evt.northern-war"
```

构建后：

```text
人物页面：
参与了 → 北方战争

北方战争页面：
参与者包括 → 人物
```

不要为了显示反向链接，在战争页面再手工创建一条重复关系。

---

## 29. 馆藏来源与关系来源

### 整个实体的来源

```yaml
params:
  library:
    source_refs:
      - "rec.archive-report-0042"
```

### 某一条关系的来源

```yaml
relations:
  - type: "allied_with"
    target: "nat.example"
    source_refs:
      - "rec.treaty-0187"
```

来源文献本身应是具有稳定 ID 的 `records` 实体。

---

## 30. 允许孤立实体

构建系统会警告没有任何正向或反向关系的实体。

确实需要独立存在时：

```yaml
params:
  allow_orphan: true
```

不要为了消除警告创建没有语义价值的假关系。

---

# 第七部分：世界时间线

## 31. 单一日期

```yaml
params:
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

    # 控制年表上的视觉权重；不填写时默认为 standard。
    presentation: "major"

    # 可选：年表上的标题；不填写时使用页面 title。
    title: "北方战争爆发"

    # 可选：连续长年表中的时代章节标记。
    era_label: "第三纪元 · 北方扩张期"

    source_refs:
      - "rec.military-report-0187"
```

`display` 是页面显示值。

`sort_value` 是项目内部排序值，必须能与其他历法的记录在同一条时间轴上比较。

### 年表中的显示方式

世界时间线是一份从早到晚连续阅读的年表，不需要搜索或筛选。条目仍然只由
`start.sort_value` 排序；以下字段只改变读者看到的排版，不改变发生先后。

```yaml
timeline:
  presentation: "standard"
  summary_mode: "full"
  era_label: "第三纪元 · 重建期"
```

`presentation` 可填：

| 值 | 适用内容 | 年表效果 |
|---|---|---|
| `major` | 建国、灭国、重大战争、世界灾害、时代转折 | 大节点和更醒目的标题 |
| `standard` | 重要改革、条约、区域事件 | 默认的普通记录 |
| `minor` | 人物生卒、小发现、局部事件 | 更紧凑的小节点 |
| `document` | 法令、书信、报告、档案 | 圆形文献节点 |

`summary_mode` 可填：

- `full`：显示完整摘要，默认值；
- `compact`：最多显示约两行摘要；
- `title_only`：只显示日期、标题与标签。

`era_label` 是可选的时代小标题。它只会在内容从一个时代进入另一个时代时显示，
不会打断时间排序。相邻同一时代的条目只需填写相同文字即可。

---

## 32. 时间范围

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

结束值不能早于开始值。

---

## 33. 约数日期

```yaml
start:
  display: "第三纪元约187年"
  sort_value: 187000
  circa: true
```

---

## 34. 日期不详

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

`order_hint` 只控制“日期不详”分组内部的顺序。

---

## 35. 争议日期

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
      note: "北部抄本使用这一日期。"
      source_refs:
        - "rec.northern-copy"

    - display: "第三纪元189年"
      sort_value: 189000
      note: "王室年表使用这一日期。"
      source_refs:
        - "rec.royal-chronicle"
```

主 `start` 决定时间线排序，`variants` 向读者显示不同观点。

---

## 36. 历法与分类词表

历法：

```text
data/vocabularies/calendars.yaml
```

时间线分类：

```text
data/vocabularies/timeline-categories.yaml
```

新增值前先检查是否已经存在。

---

# 第八部分：图片与媒体

## 37. 插入普通图片

页面目录：

```text
content/nations/nat-lanyuan/
├── _index.md
└── media/
    └── map.webp
```

Markdown：

```markdown
![岚原行政地图](media/map.webp "第三次修订版行政地图")
```

其中：

- `岚原行政地图` 是替代文字，必须描述图片；
- 引号中的内容是图注，可省略；
- 图片会自动懒加载；
- 可处理位图会生成响应式尺寸。

---

## 38. 子页面引用父实体图片

目录：

```text
content/nations/nat-lanyuan/
├── _index.md
├── government.md
└── media/
    └── flag.svg
```

在 `government.md` 中：

```markdown
![岚原国旗](media/flag.svg "现行国旗")
```

渲染系统会先查当前页面资源，再查父级 Branch Bundle。

---

## 39. 子页面自己的图片

```text
content/nations/nat-lanyuan/government/
├── index.md
├── parliament.webp
└── gallery/
    ├── chamber.webp
    └── archive.webp
```

在 `government/index.md` 中：

```markdown
![中央议政厅](parliament.webp "议政厅南侧立面")
```

---

## 40. 图片画廊

```go-html-template
{{< gallery match="gallery/*" columns="3" ratio="4 / 3" >}}
```

响应式行为：

```text
桌面：配置的列数
平板：最多 2 列
手机：1 列
```

图片文件名会被用作默认标题。需要更清晰的显示名称时，可调整图片资源元数据或
文件名。

---

## 41. 可控制版式的单图

普通 Markdown 图片适合大多数情况。需要肖像环绕、档案相框或全宽地图时，使用
`figure`：

```go-html-template
{{< figure
  src="media/portrait.webp"
  alt="洛砚的正式肖像，身着深色档案制服"
  caption="新历 316 年档案室登记肖像。"
  credit="FAS 视觉档案室"
  layout="float-end"
  size="medium"
  frame="portrait"
>}}
```

常用值：

| 参数 | 可用值 | 作用 |
|---|---|---|
| `layout` | `block`、`float-start`、`float-end`、`bleed` | 正文位置；手机会自动改为整行图片 |
| `size` | `small`、`medium`、`large`、`full` | 图片最大宽度 |
| `frame` | `plain`、`archive`、`document`、`map`、`portrait` | 图片外框样式 |

`alt` 必填，用文字描述图片本身；`caption` 和 `credit` 推荐填写。点击图片会打开
原图。实体图片仍优先放入当前或父级 Page Bundle。

---

## 42. 双图对照

用于旧图与新图、两种地图、原件与复原等需要并列阅读的内容：

```go-html-template
{{< media-pair title="北岸边界变化" layout="wide-start" >}}
  {{< media-item
    src="media/border-0280.webp"
    alt="新历 280 年的北岸边界地图"
    label="旧制边界"
    caption="新历 280 年"
  >}}
  {{< media-item
    src="media/border-0316.webp"
    alt="新历 316 年的北岸边界地图"
    label="现行边界"
    caption="新历 316 年"
  >}}
{{< /media-pair >}}
```

`layout="equal"` 为两张等宽图片，`layout="wide-start"` 使左图更宽。小屏幕会
自动转为单列。每张 `media-item` 都必须有独立的 `alt`。

---

## 43. 地图图版

地图应说明适用年代、图例和来源；不要只放一张没有上下文的图片：

```go-html-template
{{< map-plate
  src="media/political-map-0312.webp"
  alt="新历 312 年北部海岸各政权、港口与主航道地图"
  title="北部海岸行政图"
  caption="边界按白潮事件发生时的行政区划绘制。"
  legend="实线：国界；圆点：首府；虚线：主要航道"
  scale="约 1 : 2,000,000"
  source="北海岸测绘院，第七次修订"
>}}
```

地图推荐使用 SVG；位图推荐宽度至少 2400px。点击可查看原始尺寸，便于阅读细节。

---

## 44. `static/` 图片

也可以使用：

```text
static/images/world-map.webp
```

Markdown：

```markdown
![世界地图](/images/world-map.webp)
```

这种方式可以显示，但不会获得与 Page Bundle 图片相同的资源处理能力。实体专属
图片优先放入页面 Bundle。

---

# 第九部分：正文组件

## 45. 实体引用

```go-html-template
{{< entity-ref target="nat.lanyuan" >}}
```

自定义文字：

```go-html-template
{{< entity-ref
  target="nat.lanyuan"
  label="岚原"
  show-id="true"
>}}
```

优先使用稳定 ID 引用实体，避免标题或 URL 改变后链接失效。

---

## 43. 馆藏备注

```go-html-template
{{< archive-note title="修复记录" status="warning" >}}
该段文字来自受损抄本。
{{< /archive-note >}}
```

---

## 44. 馆员批注

```go-html-template
{{< librarian-note author="第三修复组" >}}
该结论仍需交叉验证。
{{< /librarian-note >}}
```

---

## 45. 警告

```go-html-template
{{< warning level="danger" title="剧透警告" >}}
以下内容涉及主线结局。
{{< /warning >}}
```

---

## 46. 遮蔽文本

始终遮蔽：

```go-html-template
{{< redaction >}}机密内容{{< /redaction >}}
```

允许悬停或键盘聚焦查看：

```go-html-template
{{< redaction reveal="true" >}}
可查看的遮蔽内容
{{< /redaction >}}
```

不要使用前端遮蔽保护真正不能公开的内容。网页源码和生成文件仍可能包含这些文字。
未公开设定应留在私有仓库或不进入公开构建。

---

## 49. 世界内文献摘录

用于法令、书信、报告、新闻、日记或铭文。它是可阅读的正文组件，不应用来隐藏
真正机密的设定：

```go-html-template
{{< document-excerpt
  type="decree"
  title="关于北岸航道管制的临时告示"
  date="新历 312 年 7 月"
  issuer="北海岸联合港务局"
  source="REC-NORTH-0312"
  condition="partial"
>}}
第一条：自即日起，所有离岸船只必须在日落前完成登记。

第二条：未经许可的航线变更，将移交港务审查庭处理。
{{< /document-excerpt >}}
```

| 参数 | 说明 |
|---|---|
| `type` | 如 `decree`、`letter`、`report`、`newspaper`、`diary`、`inscription` |
| `condition` | `complete`、`partial`、`damaged`、`translated`、`disputed` |
| `title` | 文献标题，推荐填写 |
| `date`、`issuer`、`source` | 日期、发布者和来源编号，可选但推荐填写 |

文献中的段落、列表、强调和实体引用仍可使用正常 Markdown 与已有 Shortcode。

---

# 第十部分：门户与导航

## 47. 修改门户

文件：

```text
data/navigation/portals.yaml
```

门户可以聚合多个 Section：

```yaml
- key: "geography"
  code: "P01"
  title: "国家与地区"
  description: "国家、政权、城市与地理区域。"
  page_ref: "/portals/geography"
  weight: 10

  sections:
    - key: "nations"
      label: "国家与政权"
      page_ref: "/nations"
      description: "政治实体与国家历史。"

    - key: "regions"
      label: "地区与城市"
      page_ref: "/regions"
      description: "区域、城市与地理环境。"

  featured_ids:
    - "nat.lanyuan"
```

`featured_ids` 使用稳定 ID。

---

## 48. 修改一级导航

文件：

```text
config/_default/menus.toml
```

示例：

```toml
[[main]]
identifier = "timeline"
name = "世界时间线"
pageRef = "/timeline"
weight = 70

  [main.params]
  code = "06"
  sections = ["timeline"]
```

一般内容编辑者不需要修改菜单。新增整个内容门户时再由项目维护者调整。

---

# 第十一部分：如何更新和发布

## 49. 推荐的网页更新流程

### 修改现有条目

```text
打开线上页面
→ 在 GitHub 编辑本页
→ 修改
→ Preview
→ Commit changes
→ 等待 Actions
→ 检查线上页面
```

### 新增文件

在 GitHub 中进入目标目录：

```text
Add file
→ Create new file
```

### 上传图片

进入页面 Bundle：

```text
Add file
→ Upload files
```

### 推荐使用 Pull Request

多人协作时：

1. 创建新分支；
2. 提交修改；
3. 创建 Pull Request；
4. 等待自动检查；
5. 由另一位成员校对；
6. 合并到 `main`；
7. 自动部署。

---

## 50. GitHub Actions 会自动做什么

正式发布工作流：

```text
npm ci
→ 校验内容
→ 生成稳定 ID 索引
→ 生成反向链接
→ 生成实体统计
→ 生成时间线
→ Hugo 构建
→ Pagefind 建立搜索索引
→ 验证搜索文件
→ 上传 public/
→ 部署 GitHub Pages
```

编辑者不需要：

- 手动生成 `public/`；
- 手动运行 Pagefind；
- 上传搜索数据库；
- 修改 Pages artifact；
- 把 `node_modules/` 提交到仓库。

---

## 51. 查看发布状态

进入仓库：

```text
Actions
→ Build and deploy Hugo Wiki
```

状态：

- 绿色勾：构建成功并已发布；
- 黄色圆点：正在构建；
- 红色叉：校验或构建失败；
- 灰色：任务被取消或跳过。

打开失败步骤可以看到：

- 文件路径；
- 错误代码；
- 错误说明。

---

## 52. 搜索如何自动更新

Pagefind 只能在 Hugo 生成 HTML 后建立索引。因此线上流程必须是：

```text
Hugo → Pagefind → 上传 public/
```

当前 GitHub Actions 已按这个顺序配置。

每次 Markdown 合并到 `main` 后：

1. Hugo 重新生成网页；
2. Pagefind 扫描新的 `public/`；
3. 新建、修改或删除的条目会同步进搜索；
4. 整个 `public/` 连同 `public/pagefind/` 一起发布。

内容编辑者不需要对搜索执行任何额外操作。

---

# 第十二部分：本地预览

## 53. 环境要求

本地维护建议安装：

- Node.js 22；
- npm 10 或更高；
- Hugo Extended 0.155.3；
- Git，可选但推荐。

首次安装依赖：

```powershell
npm install
```

不要手工修改：

```text
package-lock.json
```

依赖变化后运行 `npm install`，让 npm 自动更新它。

---

## 54. Windows 一键工具

首次设置：

```text
tools/setup-wiki.cmd
```

普通本地预览：

```text
tools/preview-wiki.cmd
```

只检查内容：

```text
tools/check-wiki.cmd
```

---

## 55. 常用 npm 命令

普通开发预览：

```powershell
npm run dev
```

它会：

```text
检查草稿和正式内容
→ 生成关系与时间线数据
→ 启动 hugo server -D
```

包含真实搜索的预览：

```powershell
npm run wiki:preview-search
```

它会执行静态 Hugo 构建、Pagefind，然后启动搜索预览服务器。

只检查内容：

```powershell
npm run check
```

重新生成数据：

```powershell
npm run wiki:prepare
```

查看关系报告：

```powershell
npm run content:report
```

查看时间线报告：

```powershell
npm run timeline:report
```

完整生产构建：

```powershell
npm run build
```

---

## 56. 为什么 `hugo server -D` 中搜索可能不可用

直接执行：

```powershell
hugo server -D
```

不会自动运行 Pagefind。

此时搜索页显示：

```text
搜索索引尚未生成
```

是正常状态。

需要测试真实搜索时使用：

```powershell
npm run wiki:preview-search
```

---

# 第十三部分：文件维护边界

## 57. 内容编辑者可以安全修改

```text
content/
data/navigation/portals.yaml
data/vocabularies/
config/_default/menus.toml
config/_default/params.toml
EDITOR_GUIDE.md
```

其中词表、菜单和门户属于全站配置，修改前应与项目维护者确认。

---

## 58. 不要直接修改

```text
public/
resources/_gen/
node_modules/
data/generated/
package-lock.json
```

说明：

- `public/`：Hugo 和 Pagefind 的生成结果；
- `resources/_gen/`：Hugo 资源缓存；
- `node_modules/`：npm 安装结果；
- `data/generated/`：脚本生成的 ID、反向链接和时间线数据；
- `package-lock.json`：由 npm 自动维护。

`data/generated/` 可以提交到仓库，但不要手工编辑。应运行：

```powershell
npm run wiki:prepare
```

重新生成。

---

## 59. 只有开发人员应修改

```text
layouts/
assets/styles/
assets/scripts/
scripts/
.github/workflows/
package.json
```

这些文件控制：

- 页面模板；
- 视觉样式；
- 浏览器交互；
- 内容校验；
- 自动部署；
- npm 工具链。

---

# 第十四部分：常见错误与处理

## 60. YAML 解析失败

错误：

```text
FRONT_MATTER_PARSE_FAILED
```

常见原因：

- 缩进不一致；
- 使用 Tab；
- 冒号后缺少空格；
- 引号没有闭合；
- 列表格式错误；
- 重复的 YAML 键。

处理：

1. 打开错误信息指向的文件；
2. 检查 `---` 之间的内容；
3. 对照相邻正常条目；
4. 再次提交或运行 `npm run check`。

---

## 61. 稳定 ID 重复

错误：

```text
ENTITY_ID_DUPLICATE
```

两个实体使用了同一 ID。

处理：

- 保留已经公开使用的 ID；
- 给新条目分配新的唯一 ID；
- 不要随意修改旧实体 ID。

---

## 62. 稳定 ID 格式错误

错误：

```text
ENTITY_ID_INVALID
```

检查是否包含：

- 大写；
- 中文；
- 空格；
- 下划线；
- 斜线。

---

## 63. 关系类型未注册

错误：

```text
RELATION_TYPE_UNREGISTERED
```

处理：

1. 检查是否拼写错误；
2. 查看 `data/vocabularies/relation-types.yaml`；
3. 优先使用已有类型；
4. 确实需要新类型时，再注册正向与反向名称。

---

## 64. 关系目标不存在

错误：

```text
RELATION_TARGET_NOT_FOUND
```

处理：

- 检查 `target` 拼写；
- 确认目标条目有 `params.id`；
- 确认目标不是正式构建中被排除的草稿；
- 确认目标文件已经提交。

---

## 65. 来源不存在

错误：

```text
ENTITY_SOURCE_NOT_FOUND
RELATION_SOURCE_NOT_FOUND
```

检查 `source_refs` 中的文献稳定 ID。

---

## 66. 时间线日期错误

常见问题：

- `start.display` 缺失；
- `start.sort_value` 缺失；
- `end.sort_value` 早于开始；
- `calendar` 未注册；
- `categories` 未注册；
- `status: disputed` 但没有 `variants`。

运行：

```powershell
npm run timeline:report
```

查看完整说明。

---

## 67. 页面图片不显示

检查：

1. 文件名和大小写是否完全一致；
2. 图片是否与页面位于同一个 Bundle；
3. 子页面引用父资源时路径是否正确；
4. 是否误把 Windows 反斜线 `\` 写进 Markdown；
5. 图片是否已经提交到 GitHub。

推荐路径：

```markdown
![说明](media/map.webp "图注")
```

---

## 68. 线上搜索不可用

检查 GitHub Actions 中是否依次成功：

```text
Build Hugo site
Build Pagefind search index
Verify Pagefind bundle
Upload GitHub Pages artifact
```

如果只上传 Hugo 的 `public/`，但在上传后才运行 Pagefind，线上不会包含搜索
索引。

当前工作流已经使用正确顺序，不要把 Pagefind 步骤移动到上传 artifact 之后。

---

## 69. 页面样式整体消失

如果：

- 三栏布局消失；
- 卡片没有边框；
- 标题异常巨大；
- 按钮变成普通文字；

通常表示第一阶段基础 CSS 文件缺失。

样式入口已经改为严格模式，缺少必要文件时 Hugo 应直接报错：

```text
Required stylesheet not found
```

不要删除：

```text
assets/styles/tokens.css
assets/styles/reset.css
assets/styles/base.css
assets/styles/typography.css
assets/styles/layout.css
assets/styles/utilities.css
```

---

## 70. GitHub Pages 没有更新

检查：

1. 修改是否已经进入 `main`；
2. Actions 是否成功；
3. Pages Source 是否为 GitHub Actions；
4. 浏览器是否缓存旧页面；
5. 使用 `Ctrl + Shift + R` 强制刷新；
6. 检查部署任务给出的实际 URL。

---

# 第十五部分：删除、移动与恢复

## 71. 删除条目

删除实体前：

1. 搜索其稳定 ID；
2. 查阅页面上的反向链接；
3. 删除或替换其他页面对它的关系；
4. 检查来源引用；
5. 检查门户精选列表；
6. 检查时间线；
7. 再删除文件。

否则构建会因为目标不存在而失败。

如果内容只是暂时不公开，可以先设置：

```yaml
draft: true
```

但仍需处理公开实体对它的关系。

---

## 72. 移动或重命名文件

移动文件会改变 URL，但不应改变稳定 ID。

添加旧 URL：

```yaml
aliases:
  - "/old/path/"
```

完成后检查：

- 内部普通 Markdown 链接；
- 菜单 `pageRef`；
- 门户 `page_ref`；
- 图片相对路径。

使用 `entity-ref` 和关系稳定 ID 的链接通常无需修改。

---

## 73. 恢复误操作

GitHub 保存全部提交历史。

恢复方法：

- 打开文件 History；
- 找到正确版本；
- 查看旧内容；
- 创建恢复提交；
- 或在 Pull Request 中 Revert。

不要通过重新上传整个旧 `public/` 恢复网站。应恢复源文件，让自动构建重新发布。

---

# 第十六部分：更新项目本身

## 74. 内容更新与系统更新的区别

### 内容更新

修改：

```text
content/
data/navigation/
data/vocabularies/
```

可由内容团队完成。

### 系统更新

修改：

```text
layouts/
assets/
scripts/
.github/
package.json
```

应由项目开发维护者完成，并通过 Pull Request 测试。

---

## 75. 安装新的阶段更新包

当前 UI 是增量实现：

```text
第一阶段
＋ 第二阶段
＋ 第三阶段
＋ 第四阶段
＋ 第五阶段
＋ 第六阶段
＋ 第七阶段
＝ 当前完整系统
```

安装新阶段时：

1. 创建备份分支；
2. 阅读该阶段安装说明；
3. 合并新增文件；
4. 手工处理已有自定义文件；
5. 不删除早期阶段仍被依赖的文件；
6. 合并 `package.json`；
7. 运行 `npm install`；
8. 运行 `npm run check`；
9. 运行 `npm run build`；
10. 创建 Pull Request；
11. 检查预览和 Actions；
12. 合并后检查线上页面。

---

## 76. 更新 npm 依赖

普通内容编辑者不要自行升级 Pagefind 或 YAML 解析器。

由维护者执行：

```powershell
npm install pagefind@指定版本 --save-dev
npm install yaml@指定版本 --save-dev
npm run check
npm run build
```

然后同时提交：

```text
package.json
package-lock.json
```

升级前应查看兼容性，避免搜索 API 或 YAML 行为改变。

---

# 第十七部分：发布前检查清单

## 77. 单个条目

提交前确认：

- [ ] `title` 正确；
- [ ] `description` 简洁；
- [ ] `draft` 状态正确；
- [ ] 稳定 ID 唯一且格式正确；
- [ ] 稳定 ID 没有因改名而改变；
- [ ] 馆藏编号无重复；
- [ ] 正文标题层级正确；
- [ ] 图片有替代文字；
- [ ] 图片路径正确；
- [ ] 关系目标使用稳定 ID；
- [ ] 关系类型已注册；
- [ ] 来源 ID 已存在；
- [ ] 时间线 `sort_value` 正确；
- [ ] 旧 URL 已加入 `aliases`；
- [ ] 没有把秘密设定放进前端遮蔽组件。

---

## 78. 一次版本更新

- [ ] `npm run check` 成功；
- [ ] `npm run build` 成功；
- [ ] 本地页面无明显排版错误；
- [ ] 搜索能找到新条目；
- [ ] 搜索不能找到已删除或草稿条目；
- [ ] 反向链接正确；
- [ ] 时间线顺序正确；
- [ ] 移动端可浏览；
- [ ] 图片加载正常；
- [ ] GitHub Actions 成功；
- [ ] 线上页面已更新。

---

# 第十八部分：快速参考

## 79. 日常更新

```text
编辑页面
→ Preview
→ Commit
→ 等待 Actions
→ 检查线上页面
```

## 80. 本地预览

```powershell
npm run dev
```

## 81. 真实搜索预览

```powershell
npm run wiki:preview-search
```

## 82. 内容检查

```powershell
npm run check
```

## 83. 生产构建

```powershell
npm run build
```

## 84. 关系报告

```powershell
npm run content:report
```

## 85. 时间线报告

```powershell
npm run timeline:report
```

## 86. 不要手工编辑

```text
public/
resources/_gen/
node_modules/
data/generated/
package-lock.json
```

---

# 附录 A：推荐的最小实体模板

```yaml
---
title: "条目标题"
description: "一句话摘要。"
date: "2026-07-22"
lastmod: "2026-07-22"
draft: true

params:
  id: "type.unique-id"
  schema: "type.v1"
  entity_kind: "type"
  canon_status: "canon"

  names:
    official: "正式名称"
    aliases: []

  library:
    catalog_no: ""
    access_level: "public"
    reliability: "verified"
    last_reviewed: ""
    source_refs: []

  classifications:
    topics: []

  relations: []
---

## 概述

在这里填写正文。
```

---

# 附录 B：推荐的完整关系模板

```yaml
params:
  relations:
    - type: "related_to"
      target: "type.target-id"

      period:
        start: "开始时间"
        end: "结束时间"

      reliability: "verified"

      source_refs:
        - "rec.source-id"

      note: "解释这条关系的性质。"
```

---

# 附录 C：编辑入口配置

把以下内容写入或合并到：

```text
config/_default/params.toml
```

```toml
[editor]
enabled = true
repository = "YOUR-ACCOUNT/YOUR-REPOSITORY"
branch = "main"
content_dir = "content"
```

将 `repository` 替换为真实 GitHub 仓库，例如：

```toml
repository = "example-studio/worldbuilding-wiki"
```

配置完成后，实体页和时间线页面会提供 GitHub 编辑入口。
