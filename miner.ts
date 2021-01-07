import mongoose from './src/mongoose/mongoose'
import * as config from './config.json'
import Miner from './src/Miner'
import { Worker, isMainThread, parentPort, threadId } from 'worker_threads'
import MinerClient from './src/MinerClient'
import base58 from './src/base58'
import { setPriority } from 'os'
import * as chalk from 'chalk'

if (isMainThread) {
    console.log(`Starting miner with threads: ${chalk.yellowBright(config.MinerClient.threads)}`)
    if (config.HTTPApi.enabled) console.log(`API (HTTP): ${config.HTTPApi.host}:${config.HTTPApi.port}`)
    if (config.TCPApi.enabled) console.log(`API (TCP): ${config.TCPApi.host}:${config.TCPApi.port}`)
    mongoose.init()
    const client = new MinerClient(base58.decode(config.MinerClient.miningRewardAddress))
    client.on('hashrate', hashrate => console.log(`${chalk.magentaBright(new Date().toLocaleTimeString())} ${chalk.yellowBright(hashrate)} ${chalk.redBright('H/s')}`))
    client.on('mined', (block, code) => console.log(`Mined new block ${chalk.yellowBright(block.height)} ${block.hash.toString('hex')}`))
    setPriority(19)
    client.on('listening', () => console.log('Server listening'))
    client.on('socket', socket => console.log(`New TCP connection ${socket.address().address}:${socket.address().port} - ${socket.remoteAddress}:${socket.remotePort}`))
    client.on('blacklist', (socket, reason) => console.log(`Banned ${socket.remoteAddress}:${socket.remotePort} ${reason}`))
    client.on('transaction', (transaction, code) => console.log(`Received new transaction ${chalk.yellowBright(code)}`))
    client.on('block', (block, code) => console.log(`Received new block ${chalk.yellowBright(code)}`))
    client.on('node', node => console.log(`Received new node ${node.address}:${node.port}`))
    for (let i = 0; i < client.threads; i++) {
        client.addWorker(new Worker(__filename))
    }
}
else {
    console.log(`Forking miner id: ${chalk.yellowBright(threadId)}`)
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