# 时间线编辑工作流

本文件补充 [内容模型](content-model.md) 中的世界内时间字段。时间线由 `npm run wiki:prepare` 自动生成；不要手工修改 `data/generated/timeline.json`。

## 最小示例

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
    summary: "北方战争爆发。"
```

`display` 面向读者；`sort_value` 仅用于时间线内部排序。两者不必是现实日期，也不得替代 Hugo 顶层 `date` / `lastmod`。

### 公元前年份

公元前年份必须使用**负数**排序值：数值越小表示年代越早。例如“前 139 年”应为 `-139000`，“前 113 年”应为 `-113000`，因此会按“前 139 年 → 前 113 年 → 1 年”的顺序显示。不要使用补零的正数（如 `011300`），它既不能表示公元前，也可能造成不同年份排序值重复。

```yaml
start:
  display: "前139年"
  sort_value: -139000
  precision: "year"
```

若省略 `sort_value`，生成器会为 `前139年`、`公元前139年`、`139 BCE` 与 `139 BC` 这类可识别写法推导 `-139000`；为使内容含义明确，仍建议在正式条目中显式填写。若公元前显示文本配有非负排序值，内容校验会报错。

## 字段参考

所有字段均位于页面 Front Matter 的 `params.timeline` 下。字段本身都可按场景省略；但只要该条目不是 `undated: true`，就必须提供 `start`（或兼容别名 `date`）以及可显示、可排序的日期信息。

### 顶层字段

| 字段 | 类型 / 默认值 | 用法 |
| --- | --- | --- |
| `include` | 布尔值；默认 `true` | 设为 `false` 时不生成该页面的全局年表记录。适合暂时保留时间线信息而不公开。 |
| `title` | 字符串；默认页面 `title` | 覆盖年表卡片标题，不影响页面本身标题。 |
| `calendar` | 字符串；默认 `default` | 指定默认历法；必须是 `data/vocabularies/calendars.yaml` 中已登记的 ID。目前可用 `default`、`relative`。日期对象可单独覆盖。 |
| `precision` | 字符串；默认 `unknown` | 默认日期精度，如 `year`、`season`、`month`、`day` 或项目自定义文字。仅用于输出描述，不限制取值。 |
| `circa` | 布尔值；默认 `false` | 为主开始日期设置“约”的标记。若结束日期不同，请使用 `end_circa`。 |
| `start` | 数字、字符串或日期对象 | 推荐的起始日期字段；已知日期的必填字段。数字会同时作为显示值和排序值；字符串需要另给顶层 `sort_value`，但可识别的公元前年份会自动推导。推荐始终使用日期对象。 |
| `date` | 同 `start` | `start` 的兼容别名；不要与 `start` 同时填写，优先使用 `start`。 |
| `end` | 数字、字符串或日期对象 | 可选的结束日期，用于持续事件。其 `sort_value` 不得早于开始日期。 |
| `undated` | 布尔值；默认 `false` | 设为 `true` 后，记录进入“日期不详”分组，且不需要 `start`。 |
| `undated_label` | 字符串；默认 `日期不详` | `undated: true` 时展示的日期标签。 |
| `order_hint` | 数字；默认 `0` | 日期不详记录的升序人工排序值；值越小越靠前。 |
| `categories` | 字符串或字符串数组；默认 `["other"]` | 年表筛选分类。可多选；ID 必须来自 `data/vocabularies/timeline-categories.yaml`。 |
| `category` | 字符串或字符串数组 | `categories` 的兼容别名；新内容请使用 `categories`。 |
| `status` | 字符串；默认 `verified` | 史料可信度状态：`verified`（已核实）、`probable`（较可信）、`disputed`（存在争议）、`legendary`（传说记录）、`unknown`（可信度未知）。`disputed` 推荐附加 `variants`。 |
| `presentation` | 枚举；默认 `standard` | 控制卡片视觉权重：`major`（重大事件）、`standard`（标准）、`minor`（次要）、`document`（文献/档案）。 |
| `summary_mode` | 枚举；默认 `full` | 摘要展示方式：`full`（完整）、`compact`（收起为短摘要）、`title_only`（仅标题；仍建议保留摘要供数据复用）。 |
| `summary` | 字符串 | 覆盖卡片摘要；未填写时依次使用页面 `description`、正文自动摘要。 |
| `era_label` | 字符串 | 在该条目前插入年代/时期分隔标签，例如 `神代 · 消亡期`。相邻且相同的标签不会重复显示。 |
| `note` | 字符串 | 卡片底部的补充说明，适合简短限定、编年说明或编者注。 |
| `source_refs` | 字符串或字符串数组 | 本条目的来源引用。填写项目稳定 ID 时必须存在；也可填写非 ID 形式的外部引文标识。 |
| `variants` | 日期版本对象数组 | 用于争议或多个历法版本；每项独立显示，格式见下文。 |

### 日期对象：`start`、`end` 与 `variants[]`

推荐把 `start` 和 `end` 写成对象。`variants` 中的每项也使用相同日期字段，另可附带版本说明与来源。

| 字段 | 类型 / 默认值 | 用法 |
| --- | --- | --- |
| `display` | 字符串 | 给读者看的日期文本。`start` 和 `end` 有日期时必须填写。`label` 可作为兼容别名，新内容请使用 `display`。 |
| `sort_value` | 数字 | 用于从早到晚排序；主开始日期和结束日期必须有值。推荐将一年拆为 `年 × 1000 + 月/季/日序号`，以便同年内稳定排序，例如 `187200`。公元前年份必须为负数。 |
| `sort` | 数字 | `sort_value` 的兼容别名；新内容请使用 `sort_value`。 |
| `calendar` | 字符串 | 覆盖顶层默认历法；必须使用已登记历法 ID。 |
| `precision` | 字符串 | 覆盖顶层默认精度，例如 `year`、`season`、`month`、`day`、`unknown`。 |
| `circa` | 布尔值；默认继承顶层值 | 表示该日期为约数。对于 `end`，也可在顶层使用 `end_circa`。 |
| `note` | 字符串，仅 `variants[]` | 对某一争议日期版本的简短解释。 |
| `source_refs` | 字符串或字符串数组，仅 `variants[]` | 仅关联到该版本的来源引用。 |

### 兼容别名与简写

以下字段仍可被生成器读取，主要用于旧内容迁移；新条目应使用标准字段，避免同一含义重复填写。

| 标准字段 | 可用别名 / 简写 | 说明 |
| --- | --- | --- |
| `start` | `date` | 两者取其一，`start` 优先。 |
| `start.sort_value` | 顶层 `sort_value`、`sort`、`start_sort_value` | 仅当 `start` 是字符串或未含排序值时作为后备值。 |
| `end.sort_value` | 顶层 `end_sort_value` | 为结束日期提供后备排序值。 |
| `end.circa` | 顶层 `end_circa` | 为结束日期提供后备约数标记。 |
| `categories` | `category` | 支持单个字符串或数组。 |
| `source_refs` | `source_ref`、`source` | 三者均支持单值或数组。 |
| `order_hint` | `weight` | 仅用于日期不详分组的排序。 |
| 日期对象 `display` | `label` | 仅限日期对象；建议统一写 `display`。 |
| 日期对象 `sort_value` | `sort` | 建议统一写 `sort_value`。 |

## 常见形式

日期范围：

```yaml
timeline:
  include: true
  calendar: "default"
  categories: ["war"]
  status: "verified"
  start:
    display: "第三纪元187年"
    sort_value: 187000
  end:
    display: "第三纪元191年"
    sort_value: 191000
```

日期不详：

```yaml
timeline:
  include: true
  undated: true
  undated_label: "发生年代不详"
  order_hint: 10
  categories: ["discovery"]
  status: "unknown"
```

争议日期可以使用 `variants` 数组，并为每个版本提供 `display`、`sort_value`、备注和来源。

```yaml
timeline:
  include: true
  title: "王朝建立（不同编年）"
  calendar: "default"
  categories: ["politics", "society"]
  status: "disputed"
  presentation: "major"
  summary_mode: "compact"
  start:
    display: "第三纪元187年左右"
    sort_value: 187000
    precision: "year"
    circa: true
  variants:
    - display: "主历法第三纪元187年"
      sort_value: 187000
      calendar: "default"
      precision: "year"
      note: "宫廷档案采用的年份。"
      source_refs: ["rec.dynasty-annals"]
    - display: "地方历法第三纪元188年"
      sort_value: 188000
      calendar: "relative"
      precision: "year"
      note: "地方碑文的换算结果。"
  era_label: "第三纪元 · 王朝初立"
  note: "年份仍有学界争议。"
  source_refs: ["rec.dynasty-annals"]
```

## 提交前检查

- 标题、摘要、正文和时间线日期是否描述同一个事件；
- `calendar`、`categories`、`status` 是否使用既有词表值；
- 有日期范围、约数、日期不详或争议版本时，是否按 `scripts/lib/timeline.mjs` 的现有示例结构填写；
- 所有 `source_refs` 是否为已存在的稳定 ID；
- `npm run wiki:validate` 是否通过，且时间线报告没有新增警告。

新增日期模型前，请先添加真实代表样本并更新内容模型/ADR；不要为了录入个别条目绕开校验器。