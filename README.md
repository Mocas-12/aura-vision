<div align="center">
<h1>寰宇视界（Aura‑Vision）</h1>
<p>极简、硬核的 AI 视觉感知终端。通过精密算法与 NVIDIA 多模态模型，赋予手机「看透万物」的能力。</p>
<p>作者：Unlimited Box · 邮箱：<a href="mailto:a18577y@gmail.com">a18577y@gmail.com</a> · 在线预览：<a href="https://Mocas-12.github.io/aura-vision/">GitHub Pages</a></p>
</div>

---

## 概述

- 设计目标：即时洞察、开箱即用、移动端优先、科技感 UI
- 技术栈：React 19 · TypeScript · Vite 8 · Tailwind CSS 4
- 模型接口：NVIDIA Integrate API（`/v1/chat/completions`），默认 `meta/llama-3.2-11b-vision-instruct`
- 前后端协作：前端采样与压缩 → `/api/identify` 转发到 NVIDIA → 提取中文结构化结果

## 功能特性

- 自动识别与手动识别
  - 自动模式：每 5 秒识别一次（成功后静默 5 秒以避免打断阅读）
  - 手动模式：随时点击触发识别
- 识别结果结构化输出
  - 标准格式「名称/介绍」，介绍控制在 ~80 字
  - 更关注品牌名与商品类别，适配多语言包装文字
- 视觉与交互
  - 顶部控制栏重塑：终端控制风按钮（青色描边、硬朗小圆角）
  - 结果容器赛博风：深蓝渐变 + 网格底纹 + 霓虹边框 + 四角 L 型装饰
  - 背景扫描线：极弱横向扫描线下滑动画，模拟电子屏质感
  - 模式提示：开启/关闭自动模式时显示 2 秒淡出提示
  - 局部滚动：结果区域固定高度，自动滚到底部，滚动条极细透明
- 统计与信息
  - 浏览量与访客计数、作者与邮箱展示（青色发光）
  - 激活弹窗支持跳转「面包多」获取激活码

## 架构与关键流程

1. 采样与压缩
   - 取摄像头帧中心 60% 区域，压缩为 JPEG（质量 0.2），尺寸不超过 640px
2. 传输与转发
   - 前端将 Base64 发送到 `/api/identify`，后端进行限流与清洗
3. 模型推理
   - 后端将图片与中文提示词转发到 NVIDIA，获取 `choices[0].message.content`
4. 展示与交互
   - 前端打字机动画呈现结果，滚动容器自动滚至底部

代码参考：
- 识别流程与 UI：[App.tsx](file:///c:/Users/wangqixiu/Documents/trae_projects/Aura-Vision/src/App.tsx)
- 前端推理请求封装：[ai-service.ts](file:///c:/Users/wangqixiu/Documents/trae_projects/Aura-Vision/src/utils/ai-service.ts)
- 后端转发与安全限制：[api/identify.js](file:///c:/Users/wangqixiu/Documents/trae_projects/Aura-Vision/api/identify.js)
- 全局样式与赛博面板：[index.css](file:///c:/Users/wangqixiu/Documents/trae_projects/Aura-Vision/src/index.css)

## 快速开始

- 安装依赖
  - `npm install`
- 本地开发
  - `npm run dev`，浏览器允许摄像头权限
- 质量检查与构建
  - `npm run lint`
  - `npm run build`
- 部署到 GitHub Pages
  - `npm run deploy`

## 配置与环境变量

- 在部署平台设置：
  - `NVIDIA_API_KEY`：NVIDIA Integrate API 密钥（后端读取）
- 接口路由探测：
  - 前端启动后会请求 `GET /api/identify`，若 404 则显示「API 路由未配置」提示

## 接口说明

- `POST /api/identify`
  - 请求体：`image/jpeg` Base64（前端已清洗与压缩）
  - 后端限制：最大约 4.5MB（Base64 解码后）
  - 返回体：NVIDIA 原始 JSON；前端优先提取 `choices[0].message.content` 文本

## 额度与激活

- 免费模式：内置简易配额（本地计数），超限后弹出激活弹窗
- 激活码获取：跳转「面包多」页面
  - 链接：https://mbd.pub/o/bread/mbd-YZWblZZpZQ==

## 常见问题

- 无法识别或返回空内容
  - 核对 `https://integrate.api.nvidia.com/v1/chat/completions` 与模型标识
  - 检查 `NVIDIA_API_KEY` 是否正确配置
- 摄像头不可用
  - 确认浏览器摄像头权限已允许
  - 移动端可尝试更换网络或关闭内容拦截
- 网络/加载异常
  - 若报错包含 `Load failed`，可能与拦截器或网络环境相关

## 隐私与安全

- 不存储图片，仅在本地采样并即时传输
- 后端日志掩码密钥，仅保留必要诊断信息

## 许可证

- 项目用于学习与演示，未设置开源许可证；如需复用请联系作者。
