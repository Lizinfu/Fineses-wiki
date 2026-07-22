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

之后系统会自动完成：

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
  entity_kind: "nation-chapter"
---
```

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
