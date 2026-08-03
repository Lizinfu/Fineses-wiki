# 设计系统与组件边界

## 文件层次

样式位于 `assets/styles/`：

```text
tokens.css       颜色、间距、字号、边框等设计令牌
reset.css        基础重置
base.css         全局基础规则
typography.css   排版规则
layout.css       页面壳层和布局
components/      可复用组件
pages/           特定页面样式
```

新增视觉值时优先扩展 `tokens.css`，而不是在组件中散落硬编码颜色、间距和动画时长。组件样式必须只负责自身结构；页面组合方式应放在 `pages/` 或 Hugo 模板中。

## 组件原则

- 实体信息、关系、反向链接、时间线和媒体优先由 `layouts/_partials/` 中的数据组件输出；
- Markdown 特殊表现通过 `layouts/_shortcodes/` 提供，避免复制 HTML；
- 原生脚本按功能置于 `assets/scripts/`，默认增强 HTML，而不接管正文可读性；
- 新增交互必须有键盘行为、焦点样式、空状态和无 JS 回退方案。

## 视觉方向

页面应保持高信息密度、现代、克制和可长时间阅读。档案章、馆藏编号、批注和轻量材质可传递图书馆设定；不要以低对比度、噪点、仿古字体或自动播放动画作为主要氛围手段。
