import * as settings from './config/settings.json'
import MinerThread from './src/MinerThread'
import { Worker, isMainThread } from 'worker_threads'
import * as configSettings from './config/settings.json'
import Miner from './src/Miner'
import base58 from './src/base58'
import { setPriority } from 'os'
import * as chalk from 'chalk'
import LTS from './src/chalk/LocaleTimeString'
import { cpus } from 'os'

if (isMainThread) {
    const _cpus = chalk.blueBright([...new Set(cpus().map(e => e.model))].join(', '))
    const threads = new Set()
    const hashrate = {
        "10": {
            previous: [],
            avg: "0"
        },
        "100": {
            previous: [],
            avg: "0"
        }
    }
    const mined = []
    let socket = chalk.redBright('disconnected')
    const miner = new Miner(base58.decode(settings.Miner.miningRewardAddress))
    miner.on('mined', (block, code) => {
        mined.push({ block, code })
        while (mined.length > 5) mined.shift()
    })
    miner.tcpClient.on('connect', (port, address) => socket = chalk.greenBright(`${address}:${port}`))
    miner.tcpClient.on('disconnect', (port, address) => socket = chalk.redBright(`${address}:${port}`))
    miner.on('thread', threadId => threads.add(threadId))
    miner.on('hashrate', e => {
        console.clear()
        hashrate[10].previous.push(e)
        while (hashrate[10].previous.length > 10) hashrate[10].previous.shift()
        hashrate[10].avg = (hashrate[10].previous.reduce((a, b) => a + b, 0) / hashrate[10].previous.length).toFixed(1)
        hashrate[100].previous.push(e)
        while (hashrate[100].previous.length > 100) hashrate[100].previous.shift()
        hashrate[100].avg = (hashrate[100].previous.reduce((a, b) => a + b, 0) / hashrate[100].previous.length).toFixed(2)
        console.log(`${LTS()} ${chalk.cyanBright('Viscoin Miner')}`)
        console.log()
        console.log(_cpus)
        console.log(`${chalk.cyanBright('Threads active')} ${chalk.yellowBright([...threads.keys()].sort((a: number, b: number) => a - b).join(' '))}`)
        console.log()
        console.log(`${chalk.cyanBright('API')} ${chalk.cyan('TCP')} ${socket}`)
        console.log(`${chalk.cyanBright('Hashrate')} ${chalk.yellowBright(e)} ${chalk.gray('|')} ${chalk.yellowBright(hashrate[10].avg)} ${chalk.gray('|')} ${chalk.yellowBright(hashrate[100].avg)} ${chalk.cyan(`H${chalk.cyanBright('/')}s`)}`)
        console.log()
        console.log(`${chalk.cyanBright('Latest mined blocks by')} ${chalk.greenBright(configSettings.Miner.miningRewardAddress)}`)
        for (const { block, code } of mined) {
            console.log(` ${chalk.cyan('Block')} ${chalk.yellowBright(`${block.height} ${chalk.cyan('code')} ${chalk.yellowBright(code)}`)}`)
        }
    })
    console.clear()
    console.log(`${LTS()} ${chalk.cyanBright('Viscoin Miner')}`)
    console.log(`${chalk.cyanBright('Starting')} ${chalk.cyan(`miner with ${chalk.yellowBright(miner.threads)} threads...`)}`)
    setPriority(19)
    for (let i = 0; i < miner.threads; i++) miner.addWorker(new Worker(__filename))
}
else new MinerThread()