# Aura-Vision Worker

生产链路的 Cloudflare Worker 源码：NVIDIA 视觉模型转发 + 站点访问统计。此前它以闭源形式部署在 `square-bread-b238.a18577y.workers.dev`，现已开进仓库。

## 接口

| 方法 | 路径 | 说明 |
| --- | --- | --- |
| `POST /` | `{ "imageDataUrl": "<纯 Base64>", "prompt": "<中文提示词>" }` | 转发 NVIDIA `/v1/chat/completions`，返回原始结构；提示词 5–500 字生效 |
| `GET /` | — | 存活探测，返回 `Aura Online` |
| `GET /stats` | — | `{"site_pv": N}` 站点总访问量（KV 存储） |
| `POST /stats` | `{ "site": "aura-vision" }` | 访问量 +1 |

安全限制与 Vercel 备用链路一致：CORS 仅放行白名单来源（GitHub Pages + 本地 dev/preview 端口 + `ALLOWED_ORIGINS`），图片 ≤ 4.5MB，上游 8 秒超时，模型 404 自动切换 llama-3.2-90b-vision。

## 部署

```bash
cd worker
npx wrangler login
npx wrangler kv namespace create STATS   # 把输出的 id 填入 wrangler.toml
npx wrangler secret put NVIDIA_API_KEY   # 粘贴 NVIDIA Integrate 密钥
npx wrangler deploy
```

`wrangler.toml` 的 `name` 与线上 Worker 一致，部署即无缝替换现网（URL 不变）。首次部署前请先完成 KV 与密钥两步。

> KV 是最终一致存储，并发计数可能少量坍缩；作为展示指标足够，若未来需要精确计数再换 Durable Objects。
