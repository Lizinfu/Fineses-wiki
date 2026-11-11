# 首页推荐阅读

推荐列表位于 `config/_default/params.toml` 的 `home_recommendations`，按 `items` 的出现顺序展示。它是首页的编辑推荐，不表示档案的重要性或特殊等级，不修改实体模型。

```toml
[home_recommendations]
interval_ms = 7000

[[home_recommendations.items]]
id = 'art.maerhvan'
image = 'media/maehvan_draft.png'
alt = '人鱼的形态设定图'
summary = '为这份档案编写一段简短的推荐摘要。'
image_fit = 'contain'
image_position = '50% 50%'
```

- `id` 引用已有稳定 ID；链接与标题自动来自该页。无效 ID 或图片路径会使构建报错，避免发布失效推荐。
- `image` 相对于该页的资源；找不到时会在父页资源中查找。省略图片会显示档案编号图版。`alt` 描述图片。
- `summary` 只作为推荐预览文案，省略则从正文提取摘要。
- `image_fit` 可使用 `contain` 完整呈现设计图／肖像，或 `cover` 填满预览区域；`image_position` 指定焦点位置。
- 增加、删除或调换整个 `[[home_recommendations.items]]` 段即可调整推荐。仅剩一条时不显示轮播控件。

自动播放间隔默认 7 秒，可配置为 3–60 秒。悬停暂时暂停；焦点进入、手动切换或滑动后停止自动播放，读者可显式恢复。离屏和后台不轮播；关闭动态或系统减少动态时仅保留手动浏览。无 JavaScript 时可横向滚动查看全部推荐，普通链接仍然可用。
