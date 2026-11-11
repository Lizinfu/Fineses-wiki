# 档案词条的悬停预览图

任意文档（包括 `_index.md`）都可以在自己的 Front Matter `params` 下选配 `hover_preview`。配置跟随被展示的文档，在目录、分类、子页入口、关系／反向链接、时间线、推荐阅读和搜索结果的矩形档案词条中复用。

```yaml
params:
  id: nat.ini
  hover_preview: media/cuijin.png
```

`hover_preview` 是图片路径字符串：

- `media/cuijin.png`：先从该文档的资源查找，再从父页的资源查找，与现有插图资源组织兼容。
- `/images/archive-preview.webp`：引用 `static/images/archive-preview.webp`。GitHub Pages 项目站点的路径前缀由 Hugo 自动处理。
- 不设置、设置为空字符串或删除这一行，都不会输出预览层；不会自动选择正文首图、推荐图片或父文档的预览属性。

图片只在词条内部右侧显示，以低透明度向左渐隐；鼠标移出后淡出，键盘焦点也可显示。它是装饰层，不改变标题、摘要、点击目标和布局，也不覆盖正文里的普通链接。触屏首次点击直接进入文档。

图片在首次触达词条时才加载；无 JavaScript 时仍可用 CSS 显示。关闭动态或系统减少动态时即时显隐。未配置的词条保持原样。

只接受本站现有图片，不支持远程 URL。路径不存在、格式不受支持、空静态文件或值类型错误会在构建时报告 `hover_preview` 错误。较大的栅格图片会生成最大 800px 宽的预览；GIF 和 SVG 保留原文件。

这项属性只控制表现，不参与检索匹配、分类、关系或实体身份。无需改变 `id`、`schema` 或文档位置。
