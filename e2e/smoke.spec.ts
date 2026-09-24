import { expect, test, type Page } from '@playwright/test'

const QUOTA_KEY = 'aura-vision-recognize-count'
// App path under the site base. goto('/') would replace the baseURL path
// entirely (landing on the github.io root in CI), so always use the full path.
const APP = '/aura-vision/'

// Third-party stat endpoints must not make tests flaky (or inflate counters).
test.beforeEach(async ({ page }) => {
  await page.route(/workers\.dev|busuanzi/, (route) => route.abort())
})

// The activation modal only opens from the recognition loop once the camera is
// ready; the fake camera flags in playwright.config make that happen headlessly.
async function openActivationModal(page: Page) {
  await page.addInitScript((key) => localStorage.setItem(key, '15'), QUOTA_KEY)
  await page.goto(APP)
  const dialog = page.getByRole('dialog')
  await expect(dialog).toBeVisible({ timeout: 30_000 })
  await expect(dialog.getByText('额度已用尽')).toBeVisible()
  return dialog
}

test('页面加载并进入取景状态', async ({ page }) => {
  await page.goto(APP)
  await expect(page.locator('.scan-frame')).toBeVisible()
  // Fake camera grants access → status flips from 摄像头启动中… to 待机.
  await expect(page.getByText('待机')).toBeVisible({ timeout: 15_000 })
  await expect(page.getByText('本设备浏览次数')).toBeVisible()
})

test('错误激活码被拒绝并提示', async ({ page }) => {
  const dialog = await openActivationModal(page)
  await dialog.getByLabel('激活码').fill('CYZZZS1X')
  await dialog.getByRole('button', { name: '立即激活' }).click()
  await expect(dialog.getByText('激活码无效')).toBeVisible()
})

test('正确激活码解锁设备后自动关闭', async ({ page }) => {
  const dialog = await openActivationModal(page)
  await dialog.getByLabel('激活码').fill('cytops1x')
  await dialog.getByRole('button', { name: '立即激活' }).click()
  await expect(dialog.getByText('系统已解锁')).toBeVisible()
  // Success flashes for ~1.4s, then the modal closes itself.
  await expect(dialog).toBeHidden({ timeout: 5_000 })
})

// 核心链路守护：识别请求被本地 e2e abort（保持确定性），此断言只在 CI 对真实
// 站点运行。链路故障（如密钥缺失 401）时失败态持续存在，断言失败 → 部署被拦。
test('生产识别链路：自动识别产出简体中文结果', async ({ page }) => {
  test.skip(!process.env.E2E_BASE_URL, '仅生产 e2e（E2E_BASE_URL）运行')
  test.setTimeout(120_000)
  await page.unroute(/workers\.dev|busuanzi/)
  // 识别放行；/stats 与 busuanzi 仍阻断，避免 CI 每跑一次涨一次计数。
  await page.route(/busuanzi/, (route) => route.abort())
  await page.route(/workers\.dev\/stats/, (route) => route.abort())

  await page.goto(APP)
  await expect(page.locator('.scan-frame')).toBeVisible()
  await expect(page.getByText('待机')).toBeVisible({ timeout: 15_000 })

  // 自动模式每 5s 重试：60s 内出现任意真实结果即可；持续失败则在此失败。
  const headline = page.locator('.grad-title')
  await expect(headline).not.toHaveText(/识别失败|识别超时|等待识别/, { timeout: 60_000 })
  // 正文必须是中文（system 级中文强制的落地断言）。
  await expect(page.locator('.cyber-body')).toContainText(/[\u4e00-\u9fff]/)
})
