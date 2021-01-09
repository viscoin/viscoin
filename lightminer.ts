import * as config from './config.json'
import Miner from './src/Miner'
import { Worker, isMainThread, parentPort, threadId } from 'worker_threads'
import LightMinerClient from './src/LightMinerClient'
import base58 from './src/base58'
import { setPriority } from 'os'
import * as chalk from 'chalk'
import toLocaleTimeString from './src/chalk/LocaleTimeString'

if (isMainThread) {
    const client = new LightMinerClient(base58.decode(config.LightMinerClient.miningRewardAddress))
    console.log(`${toLocaleTimeString()} ${chalk.cyanBright('Starting lightminer with')} ${chalk.yellowBright(client.threads)} ${chalk.cyanBright('threads...')}`)
    client.tcpClient.on('connect', (port, address) => console.log(`${toLocaleTimeString()} ${chalk.cyanBright('API (TCP) connected')} ${chalk.blueBright(`${address}:${port}`)}`))
    client.on('hashrate', hashrate => console.log(`${toLocaleTimeString()} ${chalk.yellowBright(hashrate)} ${chalk.redBright('H/s')}`))
    client.on('mined', (block, code) => console.log(`${toLocaleTimeString()} ${chalk.blueBright('Mined')} ${chalk.green('new')} ${chalk.yellow('Block')} { height: ${chalk.yellowBright(block.height)} } { code: ${chalk.yellowBright(code)} }`))
    setPriority(19)
    for (let i = 0; i < client.threads; i++) {
        client.addWorker(new Worker(__filename))
    }
}
else {
    console.log(`${toLocaleTimeString()} ${chalk.cyanBright('Forking miner')} { threadId: ${chalk.yellowBright(threadId)} }`)
    const miner = new Miner()
    miner.on('mined', block => parentPort.postMessage(JSON.stringify({ code: 'mined', block })))
    miner.on('hashrate', hashrate => parentPort.postMessage(JSON.stringify({ code: 'hashrate', hashrate })))
    parentPort.on('message', e => {
        e = JSON.parse(e)
        switch (e.code) {
            case 'mine':
                e.block.nonce = threadId
                miner.emit('mine', e.block, e.threads)
                break
            case 'pause':
                miner.emit('pause')
                break
        }
    })
    parentPort.postMessage(JSON.stringify({ code: 'ready' }))
}