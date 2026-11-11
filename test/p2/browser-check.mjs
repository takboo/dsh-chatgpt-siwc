import assert from 'node:assert/strict'
import { chromium } from 'playwright'

const browser = await chromium.launch({ args: ['--no-sandbox'] })
try {
  const desktop = await browser.newPage({ viewport: { width: 720, height: 420 } })
  const errors = []
  desktop.on('pageerror', error => errors.push(error.message))
  await desktop.goto('file:///fixture/index.html')
  await desktop.getByRole('button', { name: 'Continue with ChatGPT' }).click()
  await desktop.getByRole('button', { name: 'Got it' }).click()
  await desktop.getByRole('button', { name: 'Refresh models' }).click()
  await desktop.getByText('Browse models (2)').click()
  await desktop.getByText('Fixture Reasoning').waitFor()
  await desktop.getByRole('heading', { name: 'Plan usage' }).waitFor()
  assert.equal(await desktop.getByRole('link', { name: 'Manage usage' }).getAttribute('href'), 'https://chatgpt.com/settings/usage')
  await desktop.screenshot({ path: '/fixture/wide.png', fullPage: true })
  await desktop.getByRole('button', { name: 'Sign out' }).click()
  await desktop.getByText('Remote revocation could not be confirmed.', { exact: false }).waitFor()
  assert.deepEqual(errors, [])

  const narrow = await browser.newPage({ viewport: { width: 320, height: 460 } })
  await narrow.goto('file:///fixture/index.html?dark=1&lang=zh&quota=1')
  await narrow.getByRole('button', { name: '使用 ChatGPT 继续' }).click()
  await narrow.getByRole('button', { name: '知道了' }).click()
  const account = narrow.getByRole('region', { name: 'ChatGPT 账号' })
  const normalEdge = await account.evaluate(element => getComputedStyle(element).borderInlineStartColor)
  await narrow.getByRole('button', { name: '刷新模型' }).click()
  await narrow.getByRole('alert').getByText('已达到 ChatGPT 用量限制。').waitFor()
  const limitEdge = await account.evaluate(element => getComputedStyle(element).borderInlineStartColor)
  assert.notEqual(limitEdge, normalEdge)
  assert.equal(await narrow.getByRole('link', { name: '管理用量' }).count(), 1)
  assert.equal(await narrow.getByRole('button', { name: '刷新模型' }).isEnabled(), true)
  assert.equal(await narrow.evaluate(() => document.documentElement.scrollWidth), 320)
  await narrow.screenshot({ path: '/fixture/narrow.png', fullPage: true })

  await desktop.goto('file:///fixture/index.html?offline=1')
  await desktop.getByText('This offline build cannot connect to a real account.').waitFor()
  assert.equal(await desktop.getByRole('button', { name: 'Continue with ChatGPT' }).count(), 0)
  console.log('Fixed Chromium: sign-in, confirmation, catalog, quota, logout and offline view verified')
} finally {
  await browser.close()
}
