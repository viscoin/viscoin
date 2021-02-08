import * as settings from './config/settings.json'
import MinerThread from './src/MinerThread'
import { Worker, isMainThread } from 'worker_threads'
import Miner from './src/Miner'
import base58 from './src/base58'
import { setPriority } from 'os'
import * as chalk from 'chalk'
import toLocaleTimeString from './src/chalk/LocaleTimeString'

if (isMainThread) {
    const miner = new Miner(base58.decode(settings.Miner.miningRewardAddress))
    console.log(`${toLocaleTimeString()} ${chalk.cyanBright('Starting miner with')} ${chalk.yellowBright(miner.threads)} ${chalk.cyanBright('threads...')}`)
    miner.tcpClient.on('connect', (port, address) => console.log(`${toLocaleTimeString()} ${chalk.cyanBright('API (TCP) connected')} ${chalk.blueBright(`${address}:${port}`)}`))
    miner.on('mined', (block, code) => console.log(`${toLocaleTimeString()} ${chalk.blueBright('Mined')} ${chalk.green('new')} ${chalk.yellow('Block')} { height: ${chalk.yellowBright(block.height)} } { code: ${chalk.yellowBright(code)} }`))
    setPriority(19)
    for (let i = 0; i < miner.threads; i++) {
        miner.addWorker(new Worker(__filename))
    }
}
else {
    new MinerThread()
}