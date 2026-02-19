<div align="center">

<h1>Aura Vision</h1>

作者：Unlimited Box · 邮箱：<a href="mailto:a18577y@gmail.com">a18577y@gmail.com</a>

轻量、即开即用的视觉识别小应用：打开摄像头，自动截取画面中心区域，调用 NVIDIA 多模态模型返回结构化中文结果（名称 + 简介），并提供移动端友好的显示与底部信息栏。

</div>

---

## 项目概述

- 技术栈：React + TypeScript + Vite
- 识别模型：meta/llama-3.2-11b-vision-instruct（NVIDIA Integrate API）
- 后端接口：`/api/identify`（无状态 Serverless，读取环境变量中的 API Key）
- 主要能力：
  - 自动截图与压缩（中心区域，JPEG，0.2 品质）
  - 结构化中文输出（名称/介绍，≤80 字）
  - 多语言 OCR 友好（强调品牌名与商品类别）
  - 移动端布局与 Footer 信息栏（浏览量、访客、作者与邮箱）

## 快速开始

1. 安装依赖
   - `npm install`

2. 本地运行
   - `npm run dev`
   - 浏览器访问并允许摄像头权限

3. 构建与检查
   - `npm run lint`
   - `npm run build`

## 环境变量

- 在部署平台（例如 Vercel）设置：
  - `NVIDIA_API_KEY`：NVIDIA Integrate API 的密钥

## 使用说明

- 打开页面后，允许摄像头权限
- 应用自动截取画面中心区域并发送到后端
- 返回结果以「名称」「介绍」的结构在底部卡片显示；内容过长支持滚动查看
- Footer 显示浏览量、访客计数与作者邮箱，可点击 `mailto` 发送邮件

## 接口说明

- `POST /api/identify`
  - 请求体：由前端发送的数据 URL（`image/jpeg`，Base64），后端清洗并转为 OpenAI 视觉格式
  - 返回体：NVIDIA 原始 JSON；前端优先从 `choices[0].message.content` 提取文本
  - 回退逻辑：若模型 404，会按「带前缀 Kimi -> 不带前缀 Kimi」顺序重试

## 常见问题

- 404 或返回空内容
  - 检查 `https://integrate.api.nvidia.com/v1/chat/completions` 是否正确
  - 核对模型标识与 API Key 是否有效
  - 查看后端日志是否打印了完整请求 URL 与掩码后的 Authorization

- 摄像头不可用
  - 确认浏览器权限已允许
  - 部分移动端可能需要切换网络或关闭拦截功能

## 隐私与安全

- 不保存图片；仅将压缩后的中心区域片段用于即时识别
- 不记录用户的敏感信息；日志仅包含必要的调试字段（密钥掩码）

## 许可证

- 本项目仅供学习与演示用途，未设置开源许可证。如需复用，请联系作者确认。
