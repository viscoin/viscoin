import * as mongoose from './src/mongoose/mongoose'
import Miner from './src/Miner'
import Blockchain from './src/Blockchain'
import TCPNetworkNode from './src/TCPNetworkNode'
import protocol from './src/protocol'
import * as nodes from './nodes.json'
import * as config from './config.json'
import * as chalk from 'chalk'
import { Worker, isMainThread, parentPort, threadId } from 'worker_threads'
import { cpus } from 'os'
import Block from './src/Block'

if (isMainThread) {
    mongoose.init()
    const blockchain = new Blockchain()
    const node = new TCPNetworkNode()
    node.start(config.network.port, config.network.address)
    node.connectToNetwork(nodes)
    node.on('block', block => {
        blockchain.addBlock(block)
    })
    node.on('transaction', transaction => {
        blockchain.addTransaction(transaction)
    })
    node.on('node', data => {
        node.connectToNetwork([ data.data ])
    })
    let threads = cpus().length,
    hashrate = 0
    setInterval(() => {
        console.log(`${chalk.magentaBright('Hashrate')}: ${chalk.yellowBright(hashrate)} ${chalk.redBright('H/s')}`)
        hashrate = 0
    }, 1000)
    if (config.threads) threads = config.threads
    const workers = [],
    getNewBlock = (address) => {
        return blockchain.getNewBlock(address)
    }
    for (let i = 0; i < threads; i++) {
        const worker = new Worker(__filename)
        workers.push(worker)
        worker.on('error', e => console.log('error', e))
        worker.on('exit', e => console.log('exit', e))
        worker.on('message', async e => {
            try {
                e = JSON.parse(e)
            }
            catch (err) {
                console.log(err)
            }
            switch (e.code) {
                case 'ready':
                    console.log('ready')
                    worker.postMessage(JSON.stringify({ code: 'mine', block: await getNewBlock('address') }))
                    break
                case 'mined':
                    console.log('mined', e.block.height)
                    await blockchain.addBlock(new Block(e.block))
                    blockchain.pendingTransactions = []
                    node.broadcastAndStoreDataHash(protocol.constructDataBuffer('block', e.block))
                    for (const worker of workers) {
                        worker.postMessage(JSON.stringify({ code: 'mine', block: await getNewBlock('address') }))
                    }
                    break
                case 'hashrate':
                    hashrate += e.hashrate
                    break
            }
        })
        worker.on('messageerror', e => console.log('messageerror', e))
        worker.on('online', () => {
            console.log('online')
        })
        // console.log(worker.threadId)
    }
}
else {
    console.log(threadId)
    parentPort.postMessage(JSON.stringify({ code: 'ready' }))
    const miner = new Miner()
    parentPort.on('message', e => {
        try {
            e = JSON.parse(e)
        }
        catch (err) {
            console.log(err)
        }
        switch (e.code) {
            case 'mine':
                miner.emit('mine', e.block)
                break
        }
    })
    miner.on('mined', block => parentPort.postMessage(JSON.stringify({ code: 'mined', block })))
    miner.on('hashrate', hashrate => parentPort.postMessage(JSON.stringify({ code: 'hashrate', hashrate })))
    setInterval(async () => {
        // console.log('socket connections (server)', miner.serverNode.sockets.length)
        // for (const socket of miner.serverNode.sockets) {
        //     if (!socket) continue
        //     console.log(socket.remoteAddress, socket.remotePort)
        // }
        // console.log('socket connections (client)', miner.clientNode.sockets.length)
        // for (const socket of miner.clientNode.sockets) {
        //     if (!socket) continue
        //     console.log(socket.remoteAddress, socket.remotePort)
        // }
        // const work = await miner.blockchain.getWork()
        // console.log('work', work)
        // const valid = await miner.blockchain.isChainValid()
        // console.log('valid', valid)
        // const balance = await miner.blockchain.getBalanceOfAddress(keys[0].publicKey)
        // console.log('balance', balance)
        // console.log(process.memoryUsage())
    }, 1000)
}