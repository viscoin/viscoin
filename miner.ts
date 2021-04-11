import * as settings from './config/settings.json'
import MinerThread from './src/MinerThread'
import { Worker, isMainThread } from 'worker_threads'
import * as configSettings from './config/settings.json'
import Miner from './src/Miner'
import base58 from './src/base58'
import logHardware from './src/logHardware'
import { setPriority } from 'os'
import * as chalk from 'chalk'
import LTS from './src/chalk/LocaleTimeString'

if (isMainThread) {
    const miner = new Miner(base58.decode(settings.Miner.miningRewardAddress))
    if (configSettings.log.starting === true) console.log(`${LTS()} ${chalk.cyanBright('Starting')} ${chalk.cyan(`miner with ${chalk.yellowBright(miner.threads)} threads...`)}`)
    if (configSettings.log.hardware === true) logHardware()
    if (configSettings.log.connect === true) miner.tcpClient.on('connect', (port, address) => console.log(`${LTS()} ${chalk.cyanBright(`API (${chalk.cyan('TCP')})`)} ${chalk.cyan('connect')} ${chalk.blueBright(`${address}:${port}`)}`))
    if (configSettings.log.mined === true) miner.on('mined', (block, code) => console.log(`${LTS()} ${chalk.cyanBright('Mined')} ${chalk.cyan('new Block')} ${chalk.yellowBright(`${block.height} ${chalk.cyan('code')} ${chalk.yellowBright(code)}`)}`))
    if (configSettings.log.thread === true) miner.on('thread', threadId => console.log(`${LTS()} ${chalk.cyanBright('Thread')} ${chalk.yellowBright(threadId)} ${chalk.cyan('ready')}`))
    if (configSettings.log.hashrate === true) miner.on('hashrate', hashrate => console.log(`${LTS()} ${chalk.yellowBright(hashrate)} ${chalk.cyan(`H${chalk.cyanBright('/')}s`)}`))
    setPriority(19)
    for (let i = 0; i < miner.threads; i++) {
        miner.addWorker(new Worker(__filename))
    }
}
else {
    new MinerThread()
}