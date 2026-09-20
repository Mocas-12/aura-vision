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
