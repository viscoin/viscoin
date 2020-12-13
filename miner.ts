import mongoose from './src/mongoose/mongoose'
import * as config from './config.json'
import Miner from './src/Miner'
import { Worker, isMainThread, parentPort, threadId } from 'worker_threads'
import MinerClient from './src/MinerClient'
import base58 from './src/base58'
import { setPriority } from 'os'

if (isMainThread) {
    mongoose.init()
    const client = new MinerClient(base58.decode(config.miner.miningRewardAddress))
    client.on('mined', (block, code) => console.log('mined', block.height, 'code', code))
    // client.on('transaction', (transaction, code) => console.log('transaction', code))
    // client.on('block', (block, code) => console.log('block', code))
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
        }
    })
    parentPort.postMessage(JSON.stringify({ code: 'ready' }))
}