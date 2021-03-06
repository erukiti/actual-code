import * as fs from 'fs'
import * as os from 'os'
import * as path from 'path'
import { promisify } from 'util'

const mkdtemp = promisify(fs.mkdtemp)
const writeFile = promisify(fs.writeFile)

import { ActualCode } from '.'
import { CodeBlock } from '@actual-code/source'
import { Reporter } from './reporter'

export interface SandboxOptions {
  timeout?: number
  runMode?: boolean
  browser?: boolean
  file?: string
  // settings: { [props: string]: string }
}

export interface Sandbox {
  rootPath: string
  run: (
    code: string,
    hash: string,
    lang: string,
    meta: SandboxOptions
  ) => Promise<boolean>
}

const mergeOption = (
  opt1: SandboxOptions,
  opt2: SandboxOptions
): SandboxOptions => {
  return {
    timeout: opt2.timeout || opt1.timeout,
    runMode: 'runMode' in opt2 ? opt2.runMode : opt1.runMode,
    browser: opt2.browser || opt1.browser,
    file: opt2.file,
  }
}

export type SandboxPlugin = (
  reporter: Reporter,
  rootPath: string
) => Promise<Sandbox>

export class ActualCodeSandbox {
  private _actualCode: ActualCode
  private _reporter: Reporter
  private _boxes: Sandbox[] = []
  private _rootPath: string
  private _init

  constructor(actualCode: ActualCode, reporter: Reporter) {
    this._reporter = reporter
    this._actualCode = actualCode
    this._reporter.debug('create Sandbox')
    const init = async () => {
      this._rootPath = await mkdtemp(path.join(os.tmpdir(), 'actual-'))
      process.chdir(this._rootPath)
    }
    this._init = init()
  }

  async addPlugin(plugin: SandboxPlugin) {
    await this._init
    this._boxes.push(await plugin(this._reporter, this._rootPath))
  }

  async run(codeBlock: CodeBlock, opts: SandboxOptions) {
    await this._init
    const { code, lang, meta, hash } = codeBlock
    const opts2 = mergeOption(opts, meta)

    if (meta.plugin) {
      await this._actualCode.registerPlugin(code)
      return
    }
    if (!opts2.runMode) {
      this._reporter.event('sandbox skip', { hash })
      return
    }

    this._reporter.event('sandbox run', { hash })

    if (opts2.file) {
      await writeFile(opts2.file, code)
    }

    for (const box of this._boxes) {
      if (await box.run(code, hash, lang, opts2)) {
        break
      }
    }
    this._reporter.event('sandbox end', { hash })
  }
}
