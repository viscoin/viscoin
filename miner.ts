import * as mongoose from './src/mongoose/mongoose'
import Miner from './src/Miner'
import { Worker, isMainThread, parentPort, threadId } from 'worker_threads'
import MinerClient from './src/MinerClient'

if (isMainThread) {
    mongoose.init()
    const client = new MinerClient()
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
                miner.emit('mine', e.block)
                break
        }
    })
    parentPort.postMessage(JSON.stringify({ code: 'ready' }))
}