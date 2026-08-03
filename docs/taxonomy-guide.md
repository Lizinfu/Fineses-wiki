# 分类词表指南

分类服务于横向发现，不用于替代实体关系。公开实体在 `params.classifications` 中保存分类；Hugo 目前使用顶层 `cultures`、`eras`、`topics` 生成 taxonomy 页面，因此这三组值必须与 `params.classifications` 中对应数组完全一致。

## 当前分类字段

```yaml
cultures: ["示例文化圈"]
eras: ["示例时代"]
topics: ["示例主题"]

params:
  classifications:
    cultures: ["示例文化圈"]
    eras: ["示例时代"]
    regions: []
    government_forms: []
    topics: ["示例主题"]
```

词表位于 `data/vocabularies/`。其中实体类型、正史状态、访问等级、可信度等由内容模型校验器直接检查；关系类型见 `relation-types.yaml`。其他分类词表应在录入前查阅，以避免近义词、大小写或翻译差异造成重复分类。

## 新增分类值

1. 搜索现有词表，确认不存在语义等价的值；
2. 在对应 YAML 词表添加稳定的机器值及显示标签（遵循该文件现有结构）；
3. 更新使用该值的内容和本指南中的必要示例；
4. 在 PR 中说明其定义、适用范围和与相近分类的差异；
5. 运行 `npm run wiki:validate`。

不要把临时主题、人物关系、单一事件参与者或自由备注塞入 taxonomy；这些信息分别应写入正文、关系或受控字段。
