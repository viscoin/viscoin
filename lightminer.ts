import * as config from './config.json'
import Miner from './src/Miner'
import { Worker, isMainThread, parentPort, threadId } from 'worker_threads'
import LightMinerClient from './src/LightMinerClient'
import base58 from './src/base58'
import { setPriority } from 'os'
import * as chalk from 'chalk'

if (isMainThread) {
    const client = new LightMinerClient(base58.decode(config.LightMinerClient.miningRewardAddress))
    client.on('hashrate', hashrate => console.log(`${chalk.magentaBright(new Date().toLocaleTimeString())} ${chalk.yellowBright(hashrate)} ${chalk.redBright('H/s')}`))
    client.on('mined', (block, code) => console.log('mined', block.height, 'code', code))
    setPriority(19)
    for (let i = 0; i < client.threads; i++) {
        client.addWorker(new Worker(__filename))
    }
}
else {
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