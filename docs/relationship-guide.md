# 关系与反向链接指南

## 基本原则

关系通过 `params.relations` 维护，并且**只维护正向的一侧**。构建阶段根据稳定 ID 自动生成 `data/generated/backlinks.json`，页面再展示反向链接；不要为了展示效果在目标条目重复录入同一事实。

```yaml
params:
  relations:
    - type: "participated_in"
      target: "evt.example-war"
      note: "以观察员身份参与。"
      source_refs:
        - "rec.example-report"
```

`type` 和 `target` 必填。可选字段包括 `note`、`period`、`reliability` 与 `source_refs`。关系类型必须预先注册在 [`data/vocabularies/relation-types.yaml`](../data/vocabularies/relation-types.yaml)。

## 校验行为

`npm run wiki:validate` 会检查：

- 每项关系是否是 YAML 对象；
- `type` 是否存在且已注册；
- `target` 是否存在且指向公开实体；
- 关系来源 `source_refs` 是否存在（仅对符合稳定 ID 格式的值）；
- 实体来源 `library.source_refs` 是否存在；
- 重复 ID、无效 ID 与没有关系的实体。

关系指向自身会产生警告。无入向和出向关系的实体也会产生警告，除非显式使用 `params.allow_orphan: true`。

## 新关系类型

新增关系类型前应先判断能否使用已有语义；避免同一概念出现不同拼写或近义类型。若确需添加：

1. 在 `relation-types.yaml` 增加唯一 `id`、`label`、`reverse_label`、`symmetric` 和说明；
2. 在 Pull Request 说明使用边界、正向与反向含义；
3. 为该类型添加至少一个真实内容样本；
4. 更新本指南和必要的 ADR。

## 来源与叙事一致性

`source_refs` 用于指出“该实体或该关系依据哪份档案”，不等同于网页超链接。系统可校验目标是否存在，但不会判断标题、正文、日期和关系是否在叙事上相符；提交者和审核者必须人工核对这些信息。
