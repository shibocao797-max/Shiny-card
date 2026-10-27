# 闪亮卡片

一个以个人卡片仓库为起点的本地 Web 应用。玩家可以创建并命名卡片、按名称搜索、通过粒子重组找到目标卡片，再进入卡片自己的空间记录内容。

## 启动

需要 Node.js 20.19+ 或 22.12+。

```powershell
npm install
npm run dev
```

生产构建：

```powershell
npm run build
npm run preview
```

## 当前功能

- 创建、命名、分类、编辑和删除卡片
- 为卡片添加封面；图片会压缩后保存在当前浏览器
- 按卡片名称搜索；选中时舞台粒子散开并聚合为目标卡片
- 通过 Three.js 展示支持 9:16、3:4、2:3、1:1、4:3、16:9 和图片原始比例的 3D 卡片
- 可设置卡片厚度，并选择显示或隐藏卡面名称和介绍
- 拖动卡片可在水平与垂直方向连续 360° 旋转；双击或点击翻转按钮查看背面，滚轮或缩放按钮调整大小
- 舞台提供默认影棚背景，可更换图片、即时调整透明度并保存在当前浏览器
- 卡片与粒子分层显示；舞台按屏幕可用空间适配卡片，比例变化时粒子目标同步重组
- 提供两张角色/收藏示例卡，可直接编辑或删除；卡片图片由玩家自行添加并保存在本机浏览器
- 点击卡片进入独立空间，编辑并保存文字内容
- 卡片和空间内容保存在当前浏览器的 `localStorage`，不会上传到服务器
- 提供可修改的首次体验卡片；删除后仓库会保留玩家自己的内容
- 支持键盘焦点样式、手机布局和 `prefers-reduced-motion`

## 技术

- React、TypeScript、Vite
- Three.js 圆角挤出卡片、工作室环境反射、粒子点云和 GLSL 粒子着色器
- Lucide 图标

## 参考来源

- [Claude Black - Interactive 3D Card](https://github.com/amirmushichge/claude-black-3d-card)：仓库标注 MIT。此项目借鉴其立体收藏卡片的表现方向，没有直接复制其实现代码。
- [threejs-text-particles](https://github.com/kang-byunghoon/threejs-text-particles)：仓库未附带许可证文件。此项目仅参考“粒子散开并重组文字/卡片”的交互思路，没有复制其实现代码。

3D 卡片舞台位于 `src/CardShowcase3D.tsx`，粒子重组位于 `src/ParticleField.tsx`，卡片仓库和空间流程位于 `src/App.tsx`。
