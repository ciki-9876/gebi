# ThemeChip

主题周入口：首页上本周主题的开关，颜色跟随主题。

- `.theme-chip` 配 `style="--tc:<主题色>"`；内容：小圆点 + `.th-k` 眉标 + 主题名 + `.th-n`（亮灯数与剩余天数）。
- 打开主题地图时 `aria-pressed="true"`，描边与光晕变成主题色。
