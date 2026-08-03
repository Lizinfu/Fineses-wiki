# 内容模型（当前实施规范）

本文件定义当前公开实体的最小数据契约。它以 `scripts/validate-content-model.mjs`、`scripts/lib/content-graph.mjs` 和 `scripts/lib/timeline.mjs` 的实际行为为准；架构愿景和未来字段见 [`BUILDER/PLAN.MD`](BUILDER/PLAN.MD)。

## 独立实体与子页面

独立实体必须位于按实体类型划分的 Section 中，并拥有稳定 ID。当前允许的 `params.entity_kind` 由 [`data/vocabularies/entity-kinds.yaml`](../data/vocabularies/entity-kinds.yaml) 注册：

`nation`、`person`、`event`、`concept`、`region`、`organization`、`artifact`、`record`、`species`、`subpage`。

大型实体的普通章节可以是 `subpage`，也可以是仅供导航的内容页；只有需要被关系、来源或时间线独立引用的章节才应拥有稳定 ID。不要为一个事实建立多个主档案。

## 公开实体最小契约

非草稿实体只要包含 `params.id`，就必须满足以下字段。`draft: true` 的文件不会进入正式内容模型与关系图校验。

```yaml
---
title: "显示标题"
description: "用于列表和搜索结果的简短摘要。"
keywords: []
cultures: []
eras: []
topics: []

params:
  id: "con.example"
  schema: "concept.v1"
  entity_kind: "concept"
  canon_status: "canon"

  names:
    official: "显示标题"
    short: ""
    native: []
    former: []
    aliases: []

  library:
    catalog_no: "CON-0001"
    access_level: "public"
    reliability: "verified"
    last_reviewed: 2026-08-03
    source_refs: []

  classifications:
    cultures: []
    eras: []
    regions: []
    government_forms: []
    topics: []

  relations: []
---
```

当前校验器强制：

- `id`、`schema`、`entity_kind`、`canon_status`、`names`、`classifications`、`relations`；
- `library.catalog_no`、`access_level`、`reliability`、`last_reviewed`；
- `schema` 必须严格等于 `<entity_kind>.v1`；
- `names.official` 必填；
- `classifications.cultures`、`eras`、`regions`、`government_forms`、`topics` 和 `relations` 必须为数组；
- 顶层 `cultures`、`eras`、`topics` 必须与 `params.classifications` 中的同名数组完全一致。

`description`、`keywords` 和 `library.source_refs` 是当前强烈建议字段；模板与搜索会使用它们，但最小校验尚未将前三者全部视为必填。新内容应填写 `description`，并为别名、旧称和外文名使用 `keywords` 或 `params.names`。

## 稳定 ID 与 URL

- ID 仅允许小写字母、数字、点号和连字符：`^[a-z0-9]+(?:[.-][a-z0-9]+)*$`；
- ID 一经公开不得因标题、语言、目录或 URL 变更而修改；
- 标题或路径变更时，在 Front Matter 顶层使用 Hugo `aliases` 保存旧 URL；
- 关系和来源必须引用 ID，不得引用标题或 URL。

## 分类、关系和来源

- 分类值必须使用 `data/vocabularies/` 中的受控值，详见 [分类词表](taxonomy-guide.md)；
- `relations` 的每项至少包含 `type` 与 `target`，目标必须是现有公开实体 ID，详见 [关系指南](relationship-guide.md)；
- `library.source_refs` 和关系的 `source_refs` 使用文献或其他可引用实体的稳定 ID；
- 没有任何入向或出向关系的实体会产生警告。仅在确有必要时设置 `params.allow_orphan: true`，并在 Pull Request 说明原因。

## 现实日期与世界内时间

- Hugo 顶层 `date`、`lastmod` 表示现实编辑/发布日期；
- 世界内事件使用 `params.timeline`；其 `sort_value` 只用于内部排序；
- 时间线字段和允许的状态、分类以 `data/vocabularies/timeline-categories.yaml`、`scripts/lib/timeline.mjs` 为准。新增复杂日期格式前，应先添加代表性样本并通过 `npm run wiki:validate`。

## 变更规则

修改上述必填字段、ID 格式、顶层分类同步规则或关系语义时，必须：

1. 更新本文件和相关专题文档；
2. 添加 `docs/decisions/` 架构决策记录；
3. 为存量内容提供迁移方案；
4. 在 `npm run wiki:build` 通过后合并。
