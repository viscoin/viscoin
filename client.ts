import * as mongoose from './src/mongoose/mongoose'
import Miner from './src/Miner'
import { Worker, isMainThread, parentPort, threadId } from 'worker_threads'
import MinerClient from './src/MinerClient'
import protocol from './src/protocol'
import Block from './src/Block'

if (isMainThread) {
    mongoose.init()
    const client = new MinerClient()
    for (let i = 0; i < client.threads; i++) {
        const worker = new Worker(__filename)
        client.workers.push(worker)
        worker.on('message', async e => {
            e = JSON.parse(e)
            switch (e.code) {
                case 'ready':
                    if (++client.threadsReady === client.threads) await client.mineNewBlock()
                    break
                case 'mined':
                    console.log('mined', e.block.height)
                    await client.blockchain.addBlock(new Block(e.block))
                    client.blockchain.pendingTransactions = []
                    client.node.broadcastAndStoreDataHash(protocol.constructDataBuffer('block', e.block))
                    await client.mineNewBlock()
                    break
                case 'hashrate':
                    client.hashrate += e.hashrate
                    break
            }
        })
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