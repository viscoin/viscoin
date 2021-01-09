import mongoose from './src/mongoose/mongoose'
import * as config from './config.json'
import Miner from './src/Miner'
import { Worker, isMainThread, parentPort, threadId } from 'worker_threads'
import MinerClient from './src/MinerClient'
import base58 from './src/base58'
import { setPriority } from 'os'
import * as chalk from 'chalk'
import toLocaleTimeString from './src/chalk/LocaleTimeString'

if (isMainThread) {
    mongoose.init()
    const client = new MinerClient(base58.decode(config.MinerClient.miningRewardAddress))
    console.log(`${toLocaleTimeString()} ${chalk.cyanBright('Starting miner with')} ${chalk.yellowBright(client.threads)} ${chalk.cyanBright('threads...')}`)
    client.node.on('listening', () => console.log(`${toLocaleTimeString()} ${chalk.cyanBright('Node (TCP) listening on')} ${chalk.blueBright(`${config.TCPNetworkNode.server.address}:${config.TCPNetworkNode.server.port}`)}`))
    client.tcpServer.on('listening', () => console.log(`${toLocaleTimeString()} ${chalk.cyanBright('API (HTTP) listening on')} ${chalk.blueBright(`${config.HTTPApi.host}:${config.HTTPApi.port}`)}`))
    client.httpApi.on('listening', () => console.log(`${toLocaleTimeString()} ${chalk.cyanBright('API (TCP) listening on')} ${chalk.blueBright(`${config.TCPApi.host}:${config.TCPApi.port}`)}`))
    client.on('hashrate', hashrate => console.log(`${toLocaleTimeString()} ${chalk.yellowBright(hashrate)} ${chalk.redBright('H/s')}`))
    client.on('mined', (block, code) => console.log(`${toLocaleTimeString()} ${chalk.blueBright('Mined')} ${chalk.green('new')} ${chalk.yellow('Block')} { height: ${chalk.yellowBright(block.height)} } { code: ${chalk.yellowBright(code)} }`))
    setPriority(19)
    client.on('socket', socket => console.log(`${toLocaleTimeString()} New TCP connection ${socket.address().address}:${socket.address().port} - ${socket.remoteAddress}:${socket.remotePort}`))
    client.on('blacklist', (socket, reason) => console.log(`${toLocaleTimeString()} Banned ${socket.remoteAddress}:${socket.remotePort} ${reason}`))
    client.on('transaction', (transaction, code) => {
        if (code === 0) console.log(`${toLocaleTimeString()} ${chalk.green('new')} ${chalk.yellow('Transaction')} { from: ${chalk.yellowBright(base58.encode(transaction.from))} }`)
    })
    client.on('block', (block, code) => {
        if (code === 0) console.log(`${toLocaleTimeString()} ${chalk.green('new')} ${chalk.yellow('Block')} { height: ${chalk.yellowBright(block.height)} }`)
    })
    client.on('node', node => console.log(`${toLocaleTimeString()} Received new node ${node.address}:${node.port}`))
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
        }
    })
    parentPort.postMessage(JSON.stringify({ code: 'ready' }))
}