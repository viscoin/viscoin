import * as config from './config.json'
import MinerThread from './src/MinerThread'
import { Worker, isMainThread, parentPort, threadId } from 'worker_threads'
import Miner from './src/Miner'
import base58 from './src/base58'
import { setPriority } from 'os'
import * as chalk from 'chalk'
import toLocaleTimeString from './src/chalk/LocaleTimeString'

if (isMainThread) {
    const miner = new Miner(base58.decode(config.Miner.miningRewardAddress))
    console.log(`${toLocaleTimeString()} ${chalk.cyanBright('Starting miner with')} ${chalk.yellowBright(miner.threads)} ${chalk.cyanBright('threads...')}`)
    miner.tcpClient.on('connect', (port, address) => console.log(`${toLocaleTimeString()} ${chalk.cyanBright('API (TCP) connected')} ${chalk.blueBright(`${address}:${port}`)}`))
    miner.on('hashrate', hashrate => console.log(`${toLocaleTimeString()} ${chalk.yellowBright(hashrate)} ${chalk.redBright('H/s')}`))
    miner.on('mined', (block, code) => console.log(`${toLocaleTimeString()} ${chalk.blueBright('Mined')} ${chalk.green('new')} ${chalk.yellow('Block')} { height: ${chalk.yellowBright(block.height)} } { code: ${chalk.yellowBright(code)} }`))
    setPriority(19)
    for (let i = 0; i < miner.threads; i++) {
        miner.addWorker(new Worker(__filename))
    }
}
else {
    console.log(`${toLocaleTimeString()} ${chalk.cyanBright('Forking miner')} { threadId: ${chalk.yellowBright(threadId)} }`)
    const minerThread = new MinerThread()
    minerThread.on('mined', block => parentPort.postMessage(JSON.stringify({ code: 'mined', block })))
    minerThread.on('hashrate', hashrate => parentPort.postMessage(JSON.stringify({ code: 'hashrate', hashrate })))
    parentPort.on('message', e => {
        e = JSON.parse(e)
        switch (e.code) {
            case 'mine':
                e.block.nonce = threadId
                minerThread.emit('mine', e.block, e.threads)
                break
            case 'pause':
                minerThread.emit('pause')
                break
        }
    })
    parentPort.postMessage(JSON.stringify({ code: 'ready' }))
}