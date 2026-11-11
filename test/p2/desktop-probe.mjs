import assert from 'node:assert/strict'
import { spawn } from 'node:child_process'
import { readFile, rm } from 'node:fs/promises'
import { join } from 'node:path'
import { setTimeout as delay } from 'node:timers/promises'
import { chromium } from './playwright/index.mjs'
import { openInstalled, verifyClient } from './host-probe.mjs'

const [executable, userData, artifact] = process.argv.slice(2)

async function desktopWorkspace(context) {
  for (let attempt = 0; attempt < 150; attempt++) {
    for (const page of context.pages()) {
      const entry = page.getByRole('button', { name: /^(Add API Key|添加 API Key)$/ })
      if (page.url().endsWith('/welcome.html') && await entry.isVisible()) {
        await entry.click()
        await page.getByRole('button', { name: /^(Set up later|稍后配置)$/ }).click()
      }
      const plugins = page.getByRole('button', { name: /^(Plugins|插件)$/ })
      if (!page.isClosed() && await plugins.isVisible()) return page
    }
    await delay(300)
  }
  throw new Error('The official Desktop workspace did not become available')
}

async function inDesktop(run) {
  const portFile = join(userData, 'DevToolsActivePort')
  await rm(portFile, { force: true })
  const app = spawn(executable, [
    '--user-data-dir=' + userData, '--remote-debugging-address=127.0.0.1', '--remote-debugging-port=0',
  ], { stdio: 'ignore' })
  const exited = new Promise(resolve => app.once('exit', resolve))
  let browser
  try {
    for (let attempt = 0; attempt < 160 && app.exitCode === null; attempt++) {
      const port = (await readFile(portFile, 'utf8').catch(() => '')).split('\n')[0]
      if (/^\d+$/.test(port)) {
        browser = await chromium.connectOverCDP('http://127.0.0.1:' + port)
        break
      }
      await delay(250)
    }
    assert.ok(browser, 'The signed application did not expose its local test renderer')
    const [context] = browser.contexts()
    const page = await desktopWorkspace(context)
    console.log('desktopChromium=' + browser.version())
    page.setDefaultTimeout(45_000)
    await run(page)
  } finally {
    await browser?.close()
    if (app.exitCode === null && app.signalCode === null) app.kill('SIGTERM')
    await exited
  }
}

await inDesktop(async page => {
  console.log('desktopRendererReady=true')
  await openInstalled(page)
  await page.getByRole('button', { name: /^(Add plugin|添加插件)$/ }).click()
  await page.getByRole('textbox', { name: /^(Package name or address|包名或地址)$/ }).fill(artifact)
  await page.getByRole('button', { name: /^(Install|安装)$/ }).click()
  const enable = page.getByRole('button', { name: /^(Enable now|立即启用)$/ })
  try {
    await enable.waitFor()
  } catch (error) {
    const dialog = page.getByRole('dialog')
    if (await dialog.count()) console.error('Install dialog:', await dialog.first().innerText())
    throw error
  }
  console.log('desktopManagerInstalled=true')
  await enable.click()
  console.log('desktopProbe=' + JSON.stringify(await verifyClient(page)))
  const profile = JSON.parse(await readFile(join(process.env.DSH_HOME, 'profiles/desktop/package.json'), 'utf8'))
  assert.equal(profile.dependencies['@local/dsh-chatgpt-siwc'], 'file:' + artifact)
  console.log('desktopProfileBoundToArtifact=true')
})

await inDesktop(async page => {
  await verifyClient(page)
  console.log('desktopPluginRestoredAfterRestart=true')
})
