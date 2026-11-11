import assert from 'node:assert/strict'

export async function prepareClient(page) {
  const notice = page.getByRole('dialog').filter({
    has: page.getByRole('button', { name: /^(Continue|继续)$/ }),
  })
  const signIn = page.getByRole('dialog', { name: /^(Get started|开始使用)$/ })
  const plugins = page.getByRole('button', { name: /^(Plugins|插件)$/ }).first()
  try {
    await notice.or(signIn).first().waitFor()
    if (await notice.isVisible()) {
      await notice.getByRole('button', { name: /^(Continue|继续)$/ }).click()
      await notice.waitFor({ state: 'hidden' })
    }
    try {
      await plugins.click({ trial: true, timeout: 4000 })
    } catch {
      await signIn.getByRole('button', { name: /^(Close|关闭)$/ }).click()
      await signIn.waitFor({ state: 'hidden' })
    }
  } catch (error) {
    throw new Error(`${error.message}\nFresh Web dialogs: ${(await page.getByRole('dialog').allTextContents()).join(' | ').slice(0, 900)}`)
  }
}

export async function verifyClient(page) {
  const detail = page.locator('[data-plugin-detail="@local/dsh-chatgpt-siwc"]')
  await openInstalled(page)
  if (!await detail.isVisible()) {
    const card = page.locator('[data-plugin-package="@local/dsh-chatgpt-siwc"]')
    await card.getByText(/^(ChatGPT Plan|ChatGPT 订阅)$/).click()
  }
  const account = detail.locator('[data-plugin-config]').getByRole('region', { name: /^(ChatGPT account|ChatGPT 账号)$/ })
  try {
    await account.getByText(/This offline build cannot connect|当前为离线构建/).waitFor({ timeout: 12_000 })
  } catch (error) {
    const detailText = (await detail.allTextContents()).join(' ').slice(0, 1200)
    throw new Error(`${error.message}\nPlugin detail: ${detailText}`)
  }
  assert.equal(await account.getByRole('button', { name: /Continue with ChatGPT|使用 ChatGPT 继续/ }).count(), 0)
  return ['installed plugin detail renders the real settings slot', 'owner Typert read returned the offline Host state']
}

export async function openInstalled(page) {
  const panel = page.locator('[data-plugin-panel]')
  if (!await panel.isVisible()) await page.getByRole('button', { name: /^(Plugins|插件)$/ }).first().click()
  await panel.waitFor()
  const installed = page.getByRole('tab', { name: /^(Installed|已安装)$/ })
  if (await installed.isVisible() && await installed.getAttribute('aria-selected') !== 'true') await installed.click()
}
