# Porthole

舷窗：首页的窗框。画布铺满全屏，`.porthole` 用一圈很宽的外阴影把窗外刷成舱壁，只留中间一面 `r-window` 圆角玻璃。

- 窗框尺寸由 `frame-top`（上窗框，顶栏）、`frame-side`、`frame-bottom`（下窗框，控制台）三个 token 决定，手机上覆写成更窄的值。
- 玻璃内侧有上下两道暗影，外侧一圈 `bg-deep` 密封圈。
- 只在地球视图出现；进房间时隐藏，舱壁收成一条顶框。
- 地球的取景（`HOME_DIST`、`homeShift()`、视口偏移）要让整颗地球落在窗里。
