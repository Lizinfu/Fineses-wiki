# 地图功能与维护指南

> 更新于 2026-11-10。本文是交互地图的统一维护入口，面向内容编辑、美术与开发维护者。所有路径相对于仓库根目录；实现细节以当前源码和校验规则为准。

## 1. 当前地图包含什么

页面入口是 `/portals/atlas/`，名称为“世界地图”。菲恩尼斯是图书馆品牌，不是世界名称。

- **世界与国家**：一个常驻的 PixiJS / WebGL2 场景，支持横向环绕；13 个现存政治区域共用世界国土，聚焦后查看对应国家专题。塔罗萨尔当前没有现行政权。
- **城市**：卡夏·欧尔莱特使用白模型城区：皇宫居中，环路与放射路网向外展开；西部工业区、东部住宅区由密到疏，西北高、东南低。河道绕皇宫形成护城河，城缘设置素面高墙与岗哨。城墙外连接不规则荒地与离散丘陵，河流延伸到已知地面片段的边缘。普通建筑以抽象体块表达，皇宫以庭院、圆塔与礼拜堂等体量细化；其他城市尚未录入。具体街坊、建筑、地形片段和河道形状仍是可编辑的美术规划。
- **城市周边**：进入城市层时，以按粗六边格组织的浅灰连续地面覆盖已知城市与荒地片段之外的整个可见区域，包括原海面与空白；默认不绘制普通拼缝，细微灰色流动纹路表达周边详图资料缺失。退出城市层后恢复国家地图；减少动态效果模式保留静态纹路。
- **特殊地理**：奥特莱斯跨卡俄斯、德诺尼塞与斯兰缇亚，以近黑深紫色凹陷呈现，关联已有档案 `reg.aotelaisi`，不另设国家。
- **导航侧栏**：收录概览、“全部 / 诸国 / 地点 / 地貌”筛选、中文与外文名检索、区域资料卡、档案入口和空结果提示。计数表示当前收录数量。
- **地图操作**：拖拽、滚轮、双指缩放、键盘与缩放按钮；可切换政治配色、沙盘视角，以及“六角网格 / 地形起伏 / 河流与水系 / 城区与建筑 / 道路”。六角网格默认关闭，主动开启时作为独立辅助线叠加。
- **缩放与环绕**：最小倍率统一为 37%，滚轮、按钮、键盘、双指缩放、重置和尺寸变化都遵循该下限。37% 至不足 50% 显示大陆名称，50% 起显示国家徽记。横向拖到世界接缝时，按照视口覆盖范围绘制相邻世界副本，放大后仍保持陆地、国界与海面连续；点击标签优先沿最近的环绕方向聚焦。
- **纵向边界**：37% 时固定在已知世界的纵向中心，不能上下拖动；放大后按已知地图南北边界、视口高度与倾斜比例逐步开放上下浏览范围。鼠标、触控、键盘、缩放、聚焦动画和尺寸变化共用约束；触边后反向拖动会立即响应。横向仍可连续环绕。
- **基础阅读**：无 JavaScript 或无 WebGL2 时，仍可阅读目录中的摘要、打开档案。窄屏将侧栏放在地图下方。

视觉方向是平整六边形顶面、显式侧壁与离散台阶。世界采用冷蓝海面、浅色陆地、彩色国界与徽记；城市建筑采用冷白色白模型，以明暗侧面和高低体块表现结构，水道使用低饱和蓝色；侧栏与 HUD 采用浅灰面板、深灰文字、细分隔线和少量琥珀强调。在深色站点主题下，地图工作区仍保持浅色；“定位地图”与“档案”入口分别表示聚焦地点和打开百科资料。

2026-11-08 的第一轮质感调整采用统一中性方向光、环境补光与基础接触阴影，只在原有底色上表达明暗，不为不同模型新增配色、材质类别或功能灯。同高连续地面内部不绘制内缩缝、侧壁、高光或接触阴影，真实台阶、海岸和国界继续保留。当前为基础光照与局部阴影近似，未实现完整的接收面投影、复杂遮挡或 PBR。

2026-11-10 的浅色迭代将城市未测绘背景从黑紫改为浅灰底与灰色细纹，并统一侧栏和 HUD 的浅色表现。该调整保留世界海陆、特殊地貌和白模型建筑的既有配色，不改变缺失资料语义、几何、地图 ID、拾取或层级进出规则。

当前没有自由三维旋转、完整 GIS、真实海拔测绘或已完成的全国行政区系统。未录入的地形、水系和城市不能据画面推断为正式设定；库库尔坎与齐黄之间的高原连接范围仍待确认。

## 2. 文本信息在哪里编辑

### 2.1 按显示位置查文件

| 需要修改的内容 | 编辑位置 | 字段或说明 |
| --- | --- | --- |
| 页面标题、页面描述 | [content/portals/atlas/index.md](../../content/portals/atlas/index.md) | `title`、`description`；画布题签的中文名也使用页面标题 |
| 国家、大陆的中文名称 | [data/maps/areas.yaml](../../data/maps/areas.yaml) | 对应世界区域记录的 `label`；国家在详图还有区域记录时，核对同名记录 |
| 国家外文名、徽记文件引用 | `data/maps/areas.yaml` | `foreign_label`、`icon_ref`；名称用于地图标签和侧栏国家列表 |
| 城市或地点名称 | [data/maps/locations.yaml](../../data/maps/locations.yaml) | `label`；`kind` 决定首都、城市等类型 |
| 详图名称、专题列表中的所属地图名称 | [data/maps/layers.yaml](../../data/maps/layers.yaml) | `title`；不要为改显示名而更换地图 `id` |
| 国家内的地形、河流、城区名称 | [data/maps/features.yaml](../../data/maps/features.yaml) | 对应要素的 `label`；`label_position` 决定是否在地图上显示标签 |
| 奥特莱斯等跨国地貌名称 | [data/maps/world-relief.yaml](../../data/maps/world-relief.yaml) | `regions` 中的 `label`、`foreign_label` |
| **侧栏资料卡、无脚本目录的地理摘要** | **[data/maps/reader.yaml](../../data/maps/reader.yaml)** | **`entries.<地图条目 ID>.category` 与 `description`**；这是读者文案的主要入口 |
| 地图与档案的关联 | `areas.yaml`、`locations.yaml`、`features.yaml` 或 `world-relief.yaml` 中的原记录 | `entity_id` 必须引用已存在的公开档案 `params.id` |
| 档案全文、正式名称、馆藏编号 | [content/](../../content/) 中对应 Markdown | 修改实体的正文、`title`、`params.names`、`params.library.catalog_no` 等；不会自动替换地图中的独立标签与摘要 |
| 侧栏标题、分类按钮、操作提示、图层名称、画布英文题签 | [layouts/portals/atlas.html](../../layouts/portals/atlas.html) | 固定界面文字；例如“地理导航”“调阅档案”“显示设置” |
| 动态计数、资料卡回退文字、地图标签附注、运行状态提示 | [assets/scripts/atlas/app.ts](../../assets/scripts/atlas/app.ts) | 动态界面文字；普通地理摘要优先放入 `reader.yaml` |

`features.yaml` 的 `description` 和 `world-relief.yaml` 的国家 `summary` 是制作来源与地理建模说明，**不再直接作为侧栏资料卡正文**。修改它们不会替代 `reader.yaml` 的读者摘要。几何确定性 `provisional` 也不代表世界内的科考结论。

### 2.2 修改一条读者摘要

在 `data/maps/reader.yaml` 的现有 `entries` 下找到条目，只修改相应字段。例如：

```yaml
entries:
  terrain.aotelaisi:
    category: 特殊地理
    description: 克里希达西南的巨大无人区，绝大部分位于卡俄斯，边缘伸入德诺尼塞与斯兰缇亚。深紫色的土地沉于海平面以下，科考记录显示其范围仍在缓慢扩大。
```

上例是字段结构，不要在文件中重复添加第二个 `entries`。文案应依据已有档案或作者设定，使用读者能理解的地理描述；格数、算法、可替换布局等制作说明留在源数据或本文。缺少专属摘要时，界面使用简短的地理记录提示和可用的档案入口。

常见 ID 的用途如下：

| ID | 含义 | 文本维护位置 |
| --- | --- | --- |
| `country.inibholc` | 伊琳沃克的世界地图区域 | `areas.yaml` 名称；`reader.yaml` 地理摘要 |
| `nation.inibholc` | 伊琳沃克的详图 ID | `layers.yaml` 登记；`features.yaml` 保存该图专题 |
| `loc.cathair` | 首都定位记录 | `locations.yaml` 名称与定位；`reader.yaml` 摘要 |
| `city.cathair` | 首都城市层 ID | `layers.yaml` 层级与网格；`features.yaml` 城市规划 |
| `settlement.cathair.plan` | 皇宫与城区的地图要素 | `features.yaml` 标题与布局；`reader.yaml` 资料卡摘要 |
| `reg.ini.col` | 卡夏·欧尔莱特百科档案 ID | [content/nations/nat-inibholc/region/cathair.md](../../content/nations/nat-inibholc/region/cathair.md) |
| `terrain.aotelaisi` | 奥特莱斯地图地貌记录 | `world-relief.yaml` 范围与名称；`reader.yaml` 摘要 |
| `reg.aotelaisi` | 奥特莱斯百科档案 ID | [content/regions/reg-aotelaisi/index.md](../../content/regions/reg-aotelaisi/index.md) |

显示名称可以修改，稳定 ID 不应随改名而更换。地图条目 ID 与档案 ID 各有职责，用 `entity_id` 建立关联。奥特莱斯地图记录应保留 `entity_id: reg.aotelaisi`；首都关联 `reg.ini.col`。

### 2.3 改名或改档案链接的检查顺序

1. 在对应 `areas`、`locations`、`features` 或 `world-relief.regions` 记录中修改 `label`；有外文名时同步核对。
2. 更新 `reader.yaml` 中摘要提及的名称，以及 `content/` 中的正式档案。
3. 检查 `entity_id` 是否仍指向正确的公开档案；新增档案按[内容模型](../content-model.md)创建。
4. 运行验证与构建，核对地图标签、侧栏、资料卡和“调阅档案”入口。

只改名称、摘要或档案关联不需要重新生成地图瓦片。不要手改 `data/generated/id-index.json` 来修补链接，应修改源档案并通过构建生成索引。

## 3. 美术资产在哪里

### 3.1 国家徽记：网站实际加载的文件

地图标签与侧栏列表均读取世界国家记录的 `icon_ref`。当前契约只接受 `static/` 根目录下的 SVG 文件名，不接受子目录；文件以站点根路径加载：

| 国家 / 地区 | 当前徽记文件 |
| --- | --- |
| 卡什莫兰 | [static/crushmora.svg](../../static/crushmora.svg) |
| 塔罗萨尔 | [static/tarusar.svg](../../static/tarusar.svg) |
| 埃萨勒 | [static/elsae.svg](../../static/elsae.svg) |
| 伊琳沃克 | [static/inibholc.svg](../../static/inibholc.svg) |
| 莫尔索斯 | [static/muocils.svg](../../static/muocils.svg) |
| 德诺尼塞 | [static/dunossai.svg](../../static/dunossai.svg) |
| 赫芙伦特 | [static/havfrentyr.svg](../../static/havfrentyr.svg) |
| 卡俄斯 | [static/khaos.svg](../../static/khaos.svg) |
| 斯兰缇亚 | [static/sivlanzio.svg](../../static/sivlanzio.svg) |
| 塞壬 | [static/sirena.svg](../../static/sirena.svg) |
| 天照 | [static/amaturasu.svg](../../static/amaturasu.svg) |
| 殷 | [static/yin.svg](../../static/yin.svg) |
| 冈穹嘉卡 | [static/gkrk.svg](../../static/gkrk.svg) |

替换徽记时可以直接覆盖同名 SVG；若更换文件名，同时修改 `icon_ref`。SVG 应保留正确的 `viewBox`，留白适中，不使用空文件占位。埃萨勒和天照的现有文件名与区域 ID 拼法不同，以引用字段为准。确实没有徽记时省略 `icon_ref`。

`content/nations/.../media/` 中的国旗、封面、徽章和地图是档案页面资源，与上述交互地图徽记独立；修改其中的 `emblem.svg` 不会自动更新 `static/` 中的地图图标。

### 3.2 政治源图与本地美术参考

| 文件 | 用途 | 是否进入网站运行时 |
| --- | --- | --- |
| [assets/map-sources/world-political.png](../../assets/map-sources/world-political.png) | 生成世界海岸、国家归属和无人区的政治源图 | 不作为地图底图加载；生成器读取 |
| [assets/map-sources/inibholc-political.png](../../assets/map-sources/inibholc-political.png) | 伊琳沃克来源及国家配准输入；城市范围也依赖该来源配置 | 不作为底图加载；生成器读取 |
| [assets/map-sources/world-overview.webp](../../assets/map-sources/world-overview.webp) | 保留的历史概览图，当前生成配置未引用 | 当前地图不加载 |
| `assets/map-references/ultimate_reference.png` | 泰拉地图参考：信息组织、国界与地名层次 | 本地参考，不构建、不发布 |
| `assets/map-references/tactical-sandbox-reference.png` | 战术沙盘参考：块体厚度、斜俯视及侧栏仪表盘风格 | 本地参考，不构建、不发布 |
| `assets/map-references/city-white-model-01.jpg`、`city-white-model-02.jpg` | 作者提供的城市白模型参考：抽象体量、密度、立体明暗与重点建筑层次 | 本地参考，不构建、不发布 |

`assets/map-references/` 已列入 `.gitignore`，新克隆不一定包含这些图；构建不依赖它们。不要把参考截图移到 `static/` 或通过 Hugo `resources.Get` 引入页面。删除旧绘制方案不等于删除仍使用的政治源图、SVG 徽记或百科图片。

### 3.3 地形、配色和界面的“美术源文件”

地图的海洋、六边形、侧壁、河流、城区与边界由代码绘制，不存在一张可替换的运行时整图或高度纹理。

| 想调整的视觉内容 | 编辑文件 |
| --- | --- |
| 每国国界色、地貌分布、各区域使用的材质、海冰、奥特莱斯等特殊地形 | [data/maps/world-relief.yaml](../../data/maps/world-relief.yaml) |
| 材质的基础颜色，例如雪、荒漠、深紫凹陷 | [assets/scripts/atlas/world-relief.mjs](../../assets/scripts/atlas/world-relief.mjs) 的 `MATERIALS` |
| 海色、政治配色混合、边线、侧壁明暗、建筑与河流绘制 | [assets/scripts/atlas/pixi-renderer.ts](../../assets/scripts/atlas/pixi-renderer.ts) |
| 统一中性方向光、环境补光与按法线计算的明暗 | [assets/scripts/atlas/lighting.mjs](../../assets/scripts/atlas/lighting.mjs)；对原底色统一缩放 RGB，不增加材质类别 |
| 六边格共享边、同高连续面的边界环与真实台阶识别 | [assets/scripts/atlas/surface.mjs](../../assets/scripts/atlas/surface.mjs)；连续面与基础接触阴影由 `pixi-renderer.ts` 静态缓存绘制 |
| 块体基础厚度、台阶高度、凹陷边壁和拾取 | [assets/scripts/atlas/blocks.mjs](../../assets/scripts/atlas/blocks.mjs) |
| 城市街坊密度、工业 / 住宅体块、皇宫各建筑、桥梁、护城河和城防几何 | [assets/scripts/atlas/city.mjs](../../assets/scripts/atlas/city.mjs)；整体参数从 `features.yaml` 的城市 `layout` 读取 |
| 城市周边浅灰未测绘背景的粗六边格范围与纹路几何 | [assets/scripts/atlas/city-context.mjs](../../assets/scripts/atlas/city-context.mjs)；浅灰底色及灰色数据流绘制在 `pixi-renderer.ts` |
| 侧栏宽度、仪表盘面板、字体、按钮、地图标签及窄屏布局 | [assets/styles/pages/atlas-pixi.css](../../assets/styles/pages/atlas-pixi.css) |
| 侧栏分组、标题条、图例和画布控件结构 | [layouts/portals/atlas.html](../../layouts/portals/atlas.html) |

当前材质名为 `temperate`、`stone`、`desert`、`rainforest`、`tundra`、`snow`、`ice`、`abyss`。例如奥特莱斯使用 `abyss`，基础颜色是 `0x21152f`。只改材质、国界显示色、CSS 或绘制样式不需要重生瓦片。

**注意两套颜色的区别**：`sources.yaml` 的 `regions.*.color` 用于识别政治源图的 RGB，决定生成归属；`world-relief.yaml` 的 `countries.*.border` 是运行时国界显示色。调整美术配色时不要误改前者。

## 4. 修改范围、位置或地形

### 4.1 世界国界、海岸与岛屿

1. 在 `assets/map-sources/world-political.png` 修改相应国家纯色范围。近黑色为海洋，白色为无人区；国家颜色对应 `data/maps/sources.yaml` 的 `sources.world.regions`。
2. 仅改变轮廓时保留原国家 ID；若更换采样 RGB，同时登记 `sources.yaml` 中的颜色。源图外围白框由 `crop` 排除，更换尺寸或边框后重新检查裁切。
3. 作者确认存在但尚未画入源图的岛屿，可在 `sources.world.schematic_islands.groups` 登记世界格号；补充格只能位于原先的空海格，不能覆盖已有国土。
4. 运行 `npm run map:generate`，核对世界与国家裁剪、海岸、地点和首都锚点。

`data/maps/tiles.yaml` 是自动生成的归属与配准数据，禁止手工编辑。国家网格或父子关系改变时，同时核对 `layers.yaml` 和 `sources.yaml`，两处网格须一致。

### 4.2 地点与标签位置

- `locations.yaml` 的 `position: {x, y}` 使用所属地图的 0–1 连续坐标，向东为 x 增加，向南为 y 增加。同步维护派生 `col`、`row`；世界 136 × 60 网格对应 `round(x × 135)`、`round(y × 59)`，其他层按各自网格计算。
- `areas.yaml` 的国家、大陆标签通常由实际陆地重心定位。岛屿或凹形范围使重心落海时自动选择最近陆地；需要人工调整时使用区内整数格 `label_anchor: [col, row]`。
- `features.yaml` 的 `label_position: [x, y]` 属于本张地图的 0–1 连续坐标。没有该字段仍保留目录入口，但不额外生成地图文字。

不要把屏幕像素、格号和 0–1 坐标混用。城市中心绑定首都的连续定位点；移动首都或改变城区配准后，应同时检查 `sources.yaml` 与 `features.yaml`，按来源变动情况重生瓦片。

### 4.3 普通地貌与跨国特殊地貌

- **世界普通地貌**：`world-relief.yaml` 的 `countries` 中，`base` 定义基础层级和材质；`zones` 按顺序覆盖，`ellipse` 为椭圆、`ridge` 为折线山带。位置基于该国世界国土包围盒的 0–1 坐标；无人区 `wilderness` 使用世界 0–1 坐标。
- **国家 / 城市专题**：`features.yaml` 按地图 ID 分组，保留 `administrative_regions`、`terrain`、`waterways`、`routes`、`settlements`。国家专题地形优先于普通世界地貌；现有河流、道路和城市布局由这些记录提供。
- **跨国特殊地貌**：`world-relief.yaml` 的 `regions` 使用 `cells_by_country` 明确列出各国世界格号；覆盖层不改变政治归属。记录包含稳定 `terrain.*` ID、名称、来源、几何状态、材质、层级和区内 `label_cell`，有档案时填写 `entity_id`，并在 `reader.yaml` 添加读者摘要。

普通世界地形和专题地形使用 0–6 整数层级；特殊地貌允许 −6 至 6。世界与国家的基础厚度为 9、每层为 5 个艺术单位，顶面低于 0 表示海平面以下；城市使用独立基座及按城区半径缩放的局部台阶，两者均不代表米数。奥特莱斯当前为连续 10 格：卡俄斯 8 格、德诺尼塞与斯兰缇亚各 1 格，层级 −4。校验会拒绝重叠格、越界格和原归属不符的特殊地貌。

专题要素的 `description`、`source` 和 `geometry_status` 仍须保留。河道以折线表达流向，城市布局有环路与放射道路；行政区多边形和专题点是预留契约，当前尚未接入绘制，不能只填数据就声称已实现。新建国家、城市层或行政区涉及多文件，应核对父级归属、实体关联和对应测试后再加入。

### 4.4 卡夏·欧尔莱特的白模型城区

城市的稳定地图 ID 为 `city.cathair`，核心规划要素为 `settlement.cathair.plan`，关联档案 `reg.ini.col`。本轮城市美术依据 2026-11-07 作者规划及两张白模型城市参考图；皇宫体量参考都柏林城堡，不直接照搬现实建筑的名称和历史。

现实建筑参考可查都柏林城堡官网的[中世纪圆塔](https://dublincastle.ie/the-medieval-tower/)与[皇家礼拜堂](https://dublincastle.ie/the-chapel-royal/)。它们用于建筑体量和轮廓参考；城区的放射规划、功能分区与河道以作者的世界观要求为准。

可从地图地点目录进入首都，或直接打开 `/portals/atlas/?loc=loc.cathair`。城市与世界、国家共用同一个 Canvas 和相机。

城市周边按粗六边格组织的浅灰地面是当前尺度的详图缺失样式，随视口补齐，保持同高平面连续；默认不绘制普通拼缝，保留灰色数据纹路。它不改变海岸、国土归属或已知地面范围，也不关联地点与档案。城市取景、拾取及进出判定跟随实际生成的城市与荒地细格片段；将相机中心拖出该片段会返回国家层。未测绘背景不扩大这一范围。城市背景遮住国家地形与专题图形，退出后完整恢复；主动开启“六角网格”可叠加灰色辅助线，关闭时保留浅灰填充与数据纹路。灰色数据流在减少动态效果模式下静止。

布局的辐射秩序与功能分区分别维护：环路和放射道路围绕皇宫布置；西部以厂房、仓库和烟囱体块为主，东部以成排住宅为主。普通建筑保留抽象白色体块，皇宫采用开放院落、殿翼、圆塔、礼拜堂、坡屋顶和立面凹部细化。建筑密度自内城向外城递减，外围为素面高墙、岗哨和通行口；城内地势由西北向东南形成清楚的离散台阶，城外连接确定性生成的不规则荒地与丘陵，宫殿与护城河周围保留中部等高小盆地。

| 要调整的内容 | 编辑位置与参数 |
| --- | --- |
| 城市整体中心与范围 | `features.yaml` → `city.cathair.settlements` → `settlement.cathair.plan.geometry.center / radius`；中心还受首都定位与父子配准约束 |
| 环路、放射道路和确定性布局 | 同一要素的 `layout.rings`、`layout.spokes`、`layout.seed`；同一份配置始终生成同一城市 |
| 城墙与岗哨高度 | `layout.wall_height`、`layout.watchtower_height`；数值是相对城区半径的比例，非米数 |
| 河道宽度与皇宫护城河范围 | `layout.river_width`、`layout.moat_radius`；具体控制点和桥梁见 `city.mjs` |
| 西北高、东南低的台阶地势 | `terrain.cathair.hill.elevation.slope`；`direction: [-1, -1]` 表示西北为高侧，`levels` 控制离散级数；台阶视觉厚度见 `blocks.mjs` |
| 城墙外不规则地面片段、荒地与丘陵 | `blocks.mjs` 的确定性细格生成与高程逻辑；`cells.outskirts` 标记荒地，河床与中部盆地结合 `city.mjs` 的共用水道生成 |
| 街坊密度、普通建筑比例与东西分区 | `city.mjs` 的确定性建筑生成逻辑；使用城市局部比例坐标，避免填写屏幕像素 |
| 皇宫的重点建筑、城防与桥梁体块 | `city.mjs` 的建筑和通行几何；轮廓、高度、屋顶均与普通建筑共用白模型渲染 |
| 白模型、屋顶、侧面、水道和地面的颜色与线条 | `pixi-renderer.ts`；颜色与造型几何分开维护 |
| 白模型与地形的中性光照、基础接触阴影和同高连续面 | `lighting.mjs` 提供光照函数，`surface.mjs` 提供共享边与平面边界环；`pixi-renderer.ts` 缓存绘制顶面、真实侧壁及基础阴影 |
| 城区读者摘要 | `reader.yaml` → `settlement.cathair.plan`、`terrain.cathair.hill` |

`city.mjs` 内的规划以皇宫为原点、城市边缘半径约为 1；返回的建筑轮廓和折线统一转换为所属地图的连续坐标。城内几何主要位于 0–1 范围，延伸城外的运行时河段可以超出原 0–1 框架，绘制时按实际已知细格裁剪；这不改变来源范围或父子配准。建筑的 `height`、`base_height`、`roofHeight` 及道路、水系的 `width` 按世界坐标中城区两个半径的较小值缩放。地势方向的坐标仍为向东 x 增加、向南 y 增加。调整建筑时同时核对轮廓、基底抬高和屋顶高度，避免把三种比例误当作屏幕像素或米数。

城市台阶与标签高度在 `blocks.mjs` 维护：`localHeight` 控制台阶厚度，`palaceHeight` 是皇宫标签的锚点抬高量。`foundationRadius` 表示不规则已知片段的包络，`contextRadius` 独立保留未测绘背景粗格尺寸，避免扩展荒地时同时放大缺失背景网格。画布中的“皇宫 / CENTRAL PALACE”由 `app.ts` 生成；修改资料卡标题使用 `features.yaml` 的 `label`，修改读者摘要使用 `reader.yaml`。

河流从西北的城外荒地进入，在皇宫外围分流环绕，再向东南汇流出城并延至已知片段边缘；这套局部河道、护城河与桥梁由城市模块一起生成，以便街道、建筑退让和水面位置保持一致。地形模块沿共用河道约束河床高程，使开放河段向下游不升高，并维持中部护城河盆地衔接。水面采用统一浅蓝色，不另加深色宽岸线。它独立于国家层 `waterway.inibholc.central` 的概览折线，不能把两者视作已经完成精确配准的水系测绘。城市不依赖单独的 JPG 底图、纹理或外部三维模型；白模型美术源文件就是上述数据和代码。

更新城市布局时保留 `geometry_status: provisional`，在作者确认前，不把新生成的街坊、桥梁、荒地片段或丘陵写成独立正式地名。只调整体块、配色、布局参数、运行时荒地与河道造型或城市周边缺失样式无需重新生成政治瓦片；改变城市来源范围、逻辑网格或父子配准时，才需要重新生成并复核首都锚点。

## 5. 文件职责与实现边界

| 文件 | 主要职责 |
| --- | --- |
| `data/maps/reader.yaml` | 读者摘要与地理分类 |
| `data/maps/areas.yaml`、`locations.yaml` | 区域、名称、政治状态、地点、徽记和档案关联 |
| `data/maps/layers.yaml`、`sources.yaml` | 地图层级、逻辑网格、来源与父子配准 |
| `data/maps/features.yaml`、`world-relief.yaml` | 详图专题与世界地貌美术配置 |
| `data/maps/topology.yaml` | 需要保持的区域拓扑关系 |
| `data/maps/tiles.yaml` | 生成掩膜、来源哈希和配准数据 |
| `assets/scripts/map-entry.ts` | 地图页面加载入口 |
| `assets/scripts/atlas/app.ts` | 相机、输入、层级切换、标签避让、筛选、资料卡和浏览器历史 |
| `assets/scripts/atlas/space.mjs` | 坐标、相机投影、父子配准与横向环绕 |
| `assets/scripts/atlas/viewport.mjs` | 最小 / 最大倍率、纵向相机边界、标签显示阈值与可见世界副本范围 |
| `assets/scripts/atlas/blocks.mjs`、`terrain.mjs` | 块体表面、侧壁、拾取、离散地形、城市与荒地片段及河床高程 |
| `assets/scripts/atlas/surface.mjs` | 共享边、同高连续面的边界环和实际高差；供绘制与几何校验共用 |
| `assets/scripts/atlas/lighting.mjs` | 固定中性方向光、环境补光及面法线；统一缩放原底色 |
| `assets/scripts/atlas/city.mjs` | 确定性的城市规划与白模型几何；与 PixiJS 绘制解耦 |
| `assets/scripts/atlas/city-context.mjs` | 城市周边可见粗六边格与数据纹路几何；不改变逻辑地图范围 |
| `assets/scripts/atlas/pixi-renderer.ts` | 单 Canvas 的 PixiJS Graphics 场景，静态缓存的连续顶面与基础接触阴影，城市周边浅灰缺失背景与灰色数据流绘制及动画调度 |
| `assets/scripts/atlas/world-relief.mjs` | 世界地貌取样、材质颜色与契约校验 |
| `scripts/generate-hex-map.mjs`、`scripts/lib/map-islands.mjs` | 政治来源、岛屿补充与地图数据生成 |
| `scripts/validate-maps.mjs`、`scripts/lib/map-features.mjs` | 地图、专题、读者摘要 ID、实体关联及结构校验 |

世界和国家共用实体国土块，国家细格保留为数据接口。城市及城外荒地组成独立的不规则细块片段，外围由仅用于显示的浅灰粗格延续地面；同高区域合并为连续顶面，内部不绘制物理拼缝或阴影。辅助六角网格独立于这些真实表面，默认关闭。政治图形、标签、河流及拾取使用同一块面坐标与相机。改变缩放或标签行为时修改 `app.ts`，不要对地图 DOM 另加 CSS 缩放。PixiJS 版本由依赖文件锁定，安装使用 `npm ci`。

决策记录用于解释选择，而不是替代本文的操作步骤：[采用 PixiJS](../decisions/0003-pixijs-atlas.md)、[离散六边形沙盘](../decisions/0004-hex-tactical-board.md)、[世界美术方向](../decisions/0006-world-atlas-art-direction.md)、[城市白模型](../decisions/0007-city-white-model.md)。

## 6. 修改后如何检查

从仓库根目录执行：

| 改动 | 是否先运行 `npm run map:generate` | 重点复核 |
| --- | --- | --- |
| 名称、摘要、档案关联、徽记、CSS、材质或国界显示色 | 否 | 标签、资料卡、档案入口、图标、深浅主题 |
| 普通地形、河流、道路、城区展示布局、特殊地貌覆盖 | 通常否 | 形状、高差、归属、标签与拾取；涉及来源或父级范围时按下一行处理 |
| 政治源图、岛屿补充、采样配置、网格、父子配准或城区来源范围 | 是 | 世界与国家共享边界、相邻区域、离岸岛屿、环绕接缝、首都对齐 |

```powershell
# 仅来源或网格等生成输入变动时先执行
npm run map:generate

# 校验数据、来源同步、TypeScript 与地图单元测试
npm run wiki:validate

# 完整站点构建、搜索索引与静态产物检查
npm run wiki:build
```

涉及交互、模板或样式时，在构建后检查桌面和窄屏：

```powershell
$env:PLAYWRIGHT_CHANNEL='chrome'
npm run test:browser -- atlas- pixi-atlas --workers=2
```

上面的两个文件名过滤条件覆盖全部地图专项：

| 文件（均位于 `tests/browser/`） | 复核范围 |
| --- | --- |
| `pixi-atlas.spec.mjs` | 实际 WebGL 绘制、地名与徽记、国家和城市导航、图层、档案及回退 |
| `atlas-directory.spec.mjs` | 侧栏检索、分类、读者摘要、资料卡和无脚本目录 |
| `atlas-viewport.spec.mjs` | 最小倍率、横向环绕接缝和环绕后的点击 |
| `atlas-vertical.spec.mjs` | 37% 纵向锁定、南北边界、触边反向拖动 |
| `atlas-city.spec.mjs` | 白模型建筑、水系和周边浅灰未测绘背景的真实像素变化，灰色纹路、城市进出恢复、视角与地形切换、城市深链和单画布 |

只复核城市显示时可运行 `npm run test:browser -- atlas-city --workers=2`；修改通用相机或渲染器时应覆盖全部地图专项。检查全站时运行 `npm run test:browser`。

上述浏览器命令使用本机 Chrome；使用 Playwright 自带 Chromium 时先按项目安装说明准备浏览器，再省略 `PLAYWRIGHT_CHANNEL`。前置版本与日常预览命令见[根目录 README](../../README.md)。Windows 如遇 Hugo 默认缓存目录权限错误，可仅为本次构建设置仓库内缓存：

```powershell
$env:HUGO_CACHEDIR = Join-Path (Get-Location) '.cache/hugo'
npm run wiki:build
```

最后人工核对一次：搜索与分类同时生效、资料卡只显示读者摘要、图标和中外文名称清楚、档案链接正确、拖拽与缩放不误触、显示设置可用、移动端无横向溢出。城市还需检查皇宫开放院落、桥梁通行、城墙开口、内外密度及东西分区，确认城外荒地片段连续、丘陵与城内台阶清楚、河道通过城墙时沿地势下降并延至片段边缘，水面无明显深色岸线；宽窄屏、两种视角及尺寸变化时，周边浅灰未测绘背景均应铺满且无大基座亮边，退出城市后原地图完整恢复。来源或地形变更还需检查邻国、凹陷边壁及拾取。自动测试通过不等于美术和地理设定已获确认。

只更新本指南等文档时，检查引用路径与描述是否符合源码即可，不必为了文案清理重新生成地图。`public/`、`resources/_gen/` 与 `data/generated/` 是生成物，不能作为源文件手改。
