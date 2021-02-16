import init from './src/mongoose/init'
init()
import Node from './src/Node'
import * as configNetwork from './config/network.json'
import * as chalk from 'chalk'
import base58 from './src/base58'
import toLocaleTimeString from './src/chalk/LocaleTimeString'
import NodeThread from './src/NodeThread'
import { Worker, isMainThread } from 'worker_threads'
import { setPriority } from 'os'

if (isMainThread) {
    const node = new Node()
    console.log(`${toLocaleTimeString()} ${chalk.cyanBright('Starting node...')}`)
    node.node.on('listening', () => console.log(`${toLocaleTimeString()} ${chalk.cyanBright('Node (TCP) listening on')} ${chalk.blueBright(`${configNetwork.TCPNetworkNode.address}:${configNetwork.TCPNetworkNode.port}`)}`))
    node.node.on('error', e => console.log(`${toLocaleTimeString()} ${chalk.redBright('Node (TCP) error')} ${chalk.blueBright(`${configNetwork.TCPNetworkNode.address}:${configNetwork.TCPNetworkNode.port}`)} ${chalk.redBright(e?.code)}`))
    node.tcpServer.on('listening', () => console.log(`${toLocaleTimeString()} ${chalk.cyanBright('API (HTTP) listening on')} ${chalk.blueBright(`${configNetwork.HTTPApi.address}:${configNetwork.HTTPApi.port}`)}`))
    node.tcpServer.on('error', e => console.log(`${toLocaleTimeString()} ${chalk.redBright('API (HTTP) error')} ${chalk.blueBright(`${configNetwork.HTTPApi.address}:${configNetwork.HTTPApi.port}`)} ${chalk.redBright(e?.code)}`))
    node.httpApi.on('listening', () => console.log(`${toLocaleTimeString()} ${chalk.cyanBright('API (TCP) listening on')} ${chalk.blueBright(`${configNetwork.TCPApi.address}:${configNetwork.TCPApi.port}`)}`))
    node.httpApi.on('error', e => console.log(`${toLocaleTimeString()} ${chalk.redBright('API (TCP) error')} ${chalk.blueBright(`${configNetwork.TCPApi.address}:${configNetwork.TCPApi.port}`)} ${chalk.redBright(e?.code)}`))
    node.tcpServer.on('connection', (port, address) => console.log(`${toLocaleTimeString()} ${chalk.cyanBright('API (TCP) connection')} ${chalk.blueBright(`${address}:${port}`)}`))
    node.on('peer', peer => console.log(`${toLocaleTimeString()} ${chalk.green('new')} ${chalk.yellow('Socket')} ${peer.socket.remoteAddress}:${peer.socket.remotePort}`))
    node.on('ban', peer => console.log(`${toLocaleTimeString()} ${chalk.redBright('Banned')} ${peer.socket.remoteAddress}:${peer.socket.remotePort}`))
    node.on('transaction', (transaction, code) => {
        if (code === 0) console.log(`${toLocaleTimeString()} ${chalk.green('new')} ${chalk.yellow('Transaction')} { from: ${chalk.yellowBright(base58.encode(transaction.from))} }`)
    })
    node.on('block', (block, code) => {
        if (code === 0) console.log(`${toLocaleTimeString()} ${chalk.green('new')} ${chalk.yellow('Block')} { height: ${chalk.yellowBright(block.height)} }`)
    })
    setPriority(19)
    for (let i = 0; i < node.threads; i++) {
        node.addWorker(new Worker(__filename))
    }
}
else {
    new NodeThread()
}