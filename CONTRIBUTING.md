# 贡献指南

本项目将内容、派生数据和页面表现分离。普通内容贡献通常只修改 `content/`，必要时再修改 `data/vocabularies/`；不要编辑 `public/` 或 `data/generated/`。

## 提交内容前的流程

1. 从 `main` 创建分支。
2. 按 [内容模型](docs/content-model.md) 修改或新增 Markdown。
3. 使用 `npm run wiki:preview-search` 预览页面、搜索和移动端布局。
4. 运行 `npm run wiki:validate`。
5. 检查 `git diff`，确认没有意外修改生成数据或无关内容。
6. 提交 Pull Request，并说明内容范围、关系/词表变更和需要人工核对的设定。

涉及模板、样式、脚本或搜索时，还必须运行 `npm run wiki:build`。

## 内容贡献规则

- 一个独立实体只能有一份主档案，目录按实体类型组织，不按所属国家或阵营复制；
- 公开实体必须满足 `docs/content-model.md` 的最小契约；
- 稳定 ID 创建后不得因改名或移动文件而变更；URL 修改时使用 Hugo 顶层 `aliases` 保留旧地址；
- 关系只在一侧维护，目标必须使用稳定 ID；
- 新分类和新关系类型必须先更新对应受控词表，并在 PR 中说明语义；
- `allow_orphan: true` 只用于确实没有语义关联的条目，PR 中必须说明原因；
- 图片应与所属 Page Bundle 放在一起，使用有意义的文件名和替代文字；
- 未公开内容不得进入此仓库。

## 变更类型

| 变更 | 需要同时更新 |
|---|---|
| 新增/修改实体 | 内容模型校验和必要的关系、来源、分类 |
| 新分类值 | `data/vocabularies/` 与 `docs/taxonomy-guide.md` |
| 新关系类型 | `relation-types.yaml` 与 `docs/relationship-guide.md` |
| 修改字段契约或 ID 规则 | 专题文档及 `docs/decisions/` ADR |
| 修改页面组件或交互 | 相关文档、键盘/移动端人工检查 |
| 修改构建与发布 | `docs/release-process.md` 和工作流 |

## 审核清单

- [ ] 现实编辑日期与世界内时间线没有混用；
- [ ] 标题、摘要、正文、时间线和关系叙述相互一致；
- [ ] 链接、图片替代文字、标题层级和表格可读；
- [ ] `npm run wiki:validate` 已通过；
- [ ] 变更说明包含必要的人工核对项。
