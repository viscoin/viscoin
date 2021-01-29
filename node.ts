import init from './src/mongoose/init'
init()
import Node from './src/Node'
import * as config from './config.json'
import * as chalk from 'chalk'
import base58 from './src/base58'
import toLocaleTimeString from './src/chalk/LocaleTimeString'
import NodeThread from './src/NodeThread'
import { Worker, isMainThread } from 'worker_threads'
import { setPriority } from 'os'

if (isMainThread) {
    const node = new Node()
    console.log(`${toLocaleTimeString()} ${chalk.cyanBright('Starting node...')}`)
    node.node.on('listening', () => console.log(`${toLocaleTimeString()} ${chalk.cyanBright('Node (TCP) listening on')} ${chalk.blueBright(`${config.TCPNetworkNode.server.address}:${config.TCPNetworkNode.server.port}`)}`))
    node.tcpServer.on('listening', () => console.log(`${toLocaleTimeString()} ${chalk.cyanBright('API (HTTP) listening on')} ${chalk.blueBright(`${config.HTTPApi.address}:${config.HTTPApi.port}`)}`))
    node.httpApi.on('listening', () => console.log(`${toLocaleTimeString()} ${chalk.cyanBright('API (TCP) listening on')} ${chalk.blueBright(`${config.TCPApi.address}:${config.TCPApi.port}`)}`))
    node.tcpServer.on('connection', (port, address) => console.log(`${toLocaleTimeString()} ${chalk.cyanBright('API (TCP) connection')} ${chalk.blueBright(`${address}:${port}`)}`))
    node.on('socket', socket => console.log(`${toLocaleTimeString()} New TCP connection ${socket.address().address}:${socket.address().port} - ${socket.remoteAddress}:${socket.remotePort}`))
    node.on('blacklist', (socket, reason) => console.log(`${toLocaleTimeString()} Banned ${socket.remoteAddress}:${socket.remotePort} ${reason}`))
    node.on('transaction', (transaction, code) => {
        if (code === 0) console.log(`${toLocaleTimeString()} ${chalk.green('new')} ${chalk.yellow('Transaction')} { from: ${chalk.yellowBright(base58.encode(transaction.from))} }`)
    })
    node.on('block', (block, code) => {
        if (code === 0) console.log(`${toLocaleTimeString()} ${chalk.green('new')} ${chalk.yellow('Block')} { height: ${chalk.yellowBright(block.height)} }`)
    })
    node.on('node', node => console.log(`${toLocaleTimeString()} Received new node ${node.address}:${node.port}`))
    setPriority(19)
    for (let i = 0; i < node.threads; i++) {
        node.addWorker(new Worker(__filename))
    }
}
else {
    new NodeThread()
}