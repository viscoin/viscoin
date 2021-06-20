import init from './src/mongoose/init'
import Node from './src/Node'
import * as configNetwork from './config/network.json'
import base58 from './src/base58'
import LTS from './src/chalk/LocaleTimeString'
import NodeThread from './src/NodeThread'
import { Worker, isMainThread } from 'worker_threads'
import { setPriority, cpus } from 'os'
import * as chalk from 'chalk'

if (isMainThread) {
    init()
    const _cpus = chalk.blueBright([...new Set(cpus().map(e => e.model))].join(', '))
    const threads = new Set()
    const blocks = []
    const transactions = []
    const sync = []
    const logs = []
    const node = new Node()
    node.on('transaction', (transaction, code) => transactions.push({ transaction, code }))
    node.on('block', (block, code) => blocks.push({ block, code }))
    node.on('sync', () => {
        const hashes = []
        for (const hash of node.hashes) hashes.push(Buffer.from(hash, 'binary').toString('hex'))
        sync.push(hashes.join(' '))
    })
    node.blockchain.on('loading', (current, percent) => logs.push(` ${chalk.cyan('Loading blockchain')} ${chalk.yellowBright(current)} ${chalk.yellowBright(percent)}${chalk.yellow('%')}`))
    node.blockchain.on('loaded', (ms, height) => logs.push(` ${chalk.cyan('Loaded')} ${chalk.yellowBright(height)} ${chalk.cyan(`hashes in ${chalk.yellowBright(ms / 1000)} seconds`)}`))
    node.blockchain.on('repair', (info, height) => logs.push(` ${chalk.redBright('Missing')} ${chalk.cyanBright('Block')} ${chalk.cyan('at height')} ${chalk.yellowBright(height)}`))
    node.httpApi.on('error', e => logs.push(` ${chalk.cyanBright(`API (${chalk.cyan('HTTP')})`)} ${chalk.redBright('error')} ${chalk.blueBright(`${configNetwork.Node.HTTPApi.host}:${configNetwork.Node.HTTPApi.port}`)} ${chalk.redBright(e?.code)}`))
    node.tcpApi.on('error', e => logs.push(` ${chalk.cyanBright(`API (${chalk.cyan('TCP')})`)} ${chalk.redBright('error')} ${chalk.blueBright(`${configNetwork.Node.TCPApi.host}:${configNetwork.Node.TCPApi.port}`)} ${chalk.redBright(e?.code)}`))
    node.tcpApi.on('connection', (port, address) => logs.push(` ${chalk.cyanBright(`API (${chalk.cyan('TCP')})`)} ${chalk.cyan('connection')} ${chalk.blueBright(`${address}:${port}`)}`))
    node.tcpNode.on('error', e => logs.push(` ${chalk.cyanBright(`Node (${chalk.cyan('TCP')})`)} ${chalk.redBright('error')} ${chalk.blueBright(`${configNetwork.Node.TCPNode.host}:${configNetwork.Node.TCPNode.port}`)} ${chalk.redBright(e?.code)}`))
    node.tcpNode.on('peer-connect', peer => logs.push(` ${chalk.cyanBright('Peer')} ${chalk.cyan('connected')} ${chalk.blueBright(`${peer.remoteAddress}:${peer.remotePort} ${chalk.cyan('-')} ${peer.address}:${peer.port}`)} ${chalk.cyan('Total')} ${chalk.yellowBright(node.tcpNode.peers.size)}`))
    node.tcpNode.on('peer-disconnect', peer => logs.push(` ${chalk.cyanBright('Peer')} ${chalk.cyan('disconnected')} ${chalk.blueBright(`${peer.remoteAddress}:${peer.remotePort} ${chalk.cyan('-')} ${peer.address}:${peer.port}`)} ${chalk.cyan('Total')} ${chalk.yellowBright(node.tcpNode.peers.size)}`))
    node.tcpNode.on('peer-ban', peer => logs.push(` ${chalk.cyanBright('Peer')} ${chalk.redBright('banned')} ${chalk.blueBright(`${peer.remoteAddress}:${peer.remotePort} ${chalk.cyan('-')} ${peer.address}:${peer.port}`)}`))
    node.on('thread', threadId => threads.add(threadId))
    node.on('verifyrate', ({ block, transaction }) => {
        while (transaction.length > 5) transaction.shift()
        while (blocks.length > 5) blocks.shift()
        while (sync.length > 5) sync.shift()
        while (logs.length > 10) logs.shift()
        console.clear()
        console.log(`${LTS()} ${chalk.cyanBright('Viscoin Node')}`)
        console.log()
        console.log(_cpus)
        console.log(`${chalk.cyanBright('Threads active')} ${chalk.yellowBright([...threads.keys()].sort((a: number, b: number) => a - b).join(' '))}`)
        console.log()
        console.log(`${chalk.cyanBright('Node')} ${chalk.cyan('TCP')} ${node.tcpNode.server.listening === true ? chalk.greenBright(`${configNetwork.Node.TCPNode.host}:${configNetwork.Node.TCPNode.port}`) : chalk.redBright(`${configNetwork.Node.TCPNode.host}:${configNetwork.Node.TCPNode.port}`)} ${chalk.gray('|')} ${chalk.cyanBright('API')} ${chalk.cyan('TCP')} ${node.tcpApi.server.listening === true ? chalk.greenBright(`${configNetwork.Node.TCPApi.host}:${configNetwork.Node.TCPApi.port}`) : chalk.redBright(`${configNetwork.Node.TCPApi.host}:${configNetwork.Node.TCPApi.port}`)} ${chalk.gray('|')} ${chalk.cyanBright('API')} ${chalk.cyan('HTTP')} ${node.httpApi.server.listening === true ? chalk.greenBright(`${configNetwork.Node.HTTPApi.host}:${configNetwork.Node.HTTPApi.port}`) : chalk.redBright(`${configNetwork.Node.HTTPApi.host}:${configNetwork.Node.HTTPApi.port}`)}`)
        console.log(`${chalk.cyanBright('Verifyrate')} ${chalk.yellowBright(block)} ${chalk.cyan(`B${chalk.cyanBright('/')}s`)} ${chalk.yellowBright(transaction)} ${chalk.cyan(`T${chalk.cyanBright('/')}s`)}`)
        console.log()
        console.log(chalk.cyanBright('Logs'))
        for (const log of logs) console.log(log)
        console.log()
        console.log(chalk.cyanBright('Latest blocks'))
        for (const { block, code } of blocks) console.log(` ${chalk.cyan('Block')} ${chalk.yellowBright(block.height)} ${chalk.cyan('code')} ${chalk.yellowBright(code)}`)
        console.log()
        console.log(chalk.cyanBright('Latest transactions'))
        for (const { transaction, code } of transactions) console.log(` ${chalk.cyan('Transaction')} ${chalk.blueBright(base58.encode(transaction.from))} ${chalk.cyan('code')} ${chalk.yellowBright(code)}`)
        console.log()
        console.log(chalk.cyanBright('Latest sync hashes'))
        for (const hashes of sync) console.log(` ${chalk.blueBright(hashes)}`)
    })
    console.clear()
    console.log(`${LTS()} ${chalk.cyanBright('Viscoin Node')}`)
    console.log(`${chalk.cyanBright('Starting')} ${chalk.cyan(`node with ${chalk.yellowBright(node.threads)} threads...`)}`)
    setPriority(19)
    for (let i = 0; i < node.threads; i++) node.addWorker(new Worker(__filename))
}
else new NodeThread()