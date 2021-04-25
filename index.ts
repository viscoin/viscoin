import init from './src/mongoose/init'
import Node from './src/Node'
import * as configSettings from './config/settings.json'
import * as configNetwork from './config/network.json'
import base58 from './src/base58'
import LTS from './src/chalk/LocaleTimeString'
import NodeThread from './src/NodeThread'
import logHardware from './src/logHardware'
import { Worker, isMainThread } from 'worker_threads'
import { setPriority } from 'os'
import * as chalk from 'chalk'

if (isMainThread) {
    init()
    const node = new Node()
    if (configSettings.log.starting === true) console.log(`${LTS()} ${chalk.cyanBright('Starting')} ${chalk.cyan(`node with ${chalk.yellowBright(node.threads)} threads...`)}`)
    if (configSettings.log.hardware === true) logHardware()
    if (configSettings.log.loading === true) node.blockchain.on('loading', (current, percent) => console.log(`${LTS()} ${chalk.cyanBright('Loading')} ${chalk.yellowBright(current)} ${chalk.yellowBright(percent)}${chalk.yellow('%')}`))
    if (configSettings.log.loaded === true) node.blockchain.on('loaded', (ms, height) => console.log(`${LTS()} ${chalk.cyanBright('Loaded')} ${chalk.yellowBright(height)} ${chalk.cyan(`hashes in ${chalk.yellowBright(ms / 1000)} seconds`)}`))
    if (configSettings.log.loaded === true) node.blockchain.on('repair', (info, height) => {
        console.log(`${LTS()} ${chalk.redBright('Missing')} ${chalk.cyanBright('Block')} ${chalk.cyan('at height')} ${chalk.yellowBright(height)}`)
        console.log(info)
    })
    if (configSettings.Node.TCPNode === true && configSettings.log.TCPNode === true) {
        node.tcpNode.on('listening', () => console.log(`${LTS()} ${chalk.cyanBright(`Node (${chalk.cyan('TCP')})`)} ${chalk.cyan('listening on')} ${chalk.blueBright(`${configNetwork.TCPNode.host}:${configNetwork.TCPNode.port}`)}`))
        node.tcpNode.on('error', e => console.log(`${LTS()} ${chalk.cyanBright(`Node (${chalk.cyan('TCP')})`)} ${chalk.redBright('error')} ${chalk.blueBright(`${configNetwork.TCPNode.host}:${configNetwork.TCPNode.port}`)} ${chalk.redBright(e?.code)}`))
        node.tcpNode.on('peer-connect', peer => console.log(`${LTS()} ${chalk.cyanBright('Peer')} ${chalk.cyan('connected')} ${chalk.blueBright(`${peer.remoteAddress}:${peer.remotePort} ${chalk.cyan('-')} ${peer.address}:${peer.port}`)} ${chalk.cyan('Total')} ${chalk.yellowBright(node.tcpNode.peers.size)}`))
        node.tcpNode.on('peer-disconnect', peer => console.log(`${LTS()} ${chalk.cyanBright('Peer')} ${chalk.cyan('disconnected')} ${chalk.blueBright(`${peer.remoteAddress}:${peer.remotePort} ${chalk.cyan('-')} ${peer.address}:${peer.port}`)} ${chalk.cyan('Total')} ${chalk.yellowBright(node.tcpNode.peers.size)}`))
        node.tcpNode.on('peer-ban', peer => console.log(`${LTS()} ${chalk.cyanBright('Peer')} ${chalk.redBright('banned')} ${chalk.blueBright(`${peer.remoteAddress}:${peer.remotePort} ${chalk.cyan('-')} ${peer.address}:${peer.port}`)}`))
    }
    if (configSettings.Node.TCPApi === true && configSettings.log.TCPApi === true) {
        node.tcpApi.on('listening', () => console.log(`${LTS()} ${chalk.cyanBright(`API (${chalk.cyan('TCP')})`)} ${chalk.cyan('listening on')} ${chalk.blueBright(`${configNetwork.TCPApi.host}:${configNetwork.TCPApi.port}`)}`))
        node.tcpApi.on('error', e => console.log(`${LTS()} ${chalk.cyanBright(`API (${chalk.cyan('TCP')})`)} ${chalk.redBright('error')} ${chalk.blueBright(`${configNetwork.TCPApi.host}:${configNetwork.TCPApi.port}`)} ${chalk.redBright(e?.code)}`))
        node.tcpApi.on('connection', (port, address) => console.log(`${LTS()} ${chalk.cyanBright(`API (${chalk.cyan('TCP')})`)} ${chalk.cyan('connection')} ${chalk.blueBright(`${address}:${port}`)}`))
    }
    if (configSettings.Node.HTTPApi === true && configSettings.log.HTTPApi === true) {
        node.httpApi.on('listening', () => console.log(`${LTS()} ${chalk.cyanBright(`API (${chalk.cyan('HTTP')})`)} ${chalk.cyan('listening on')} ${chalk.blueBright(`${configNetwork.HTTPApi.host}:${configNetwork.HTTPApi.port}`)}`))
        node.httpApi.on('error', e => console.log(`${LTS()} ${chalk.cyanBright(`API (${chalk.cyan('HTTP')})`)} ${chalk.redBright('error')} ${chalk.blueBright(`${configNetwork.HTTPApi.host}:${configNetwork.HTTPApi.port}`)} ${chalk.redBright(e?.code)}`))
    }
    node.on('transaction', (transaction, code) => {
        if (code === 0 && configSettings.log.transaction === true) console.log(`${LTS()} ${chalk.cyanBright('new')} ${chalk.cyan('Transaction')} ${chalk.blueBright(base58.encode(transaction.from))}`)
    })
    node.on('block', (block, code) => {
        if (code === 0 && configSettings.log.block === true) console.log(`${LTS()} ${chalk.cyanBright('new')} ${chalk.cyan('Block')} ${chalk.yellowBright(block.height)}`)
    })
    node.on('sync', () => {
        if (configSettings.log.sync === true) {
            const hashes = []
            for (const hash of node.hashes) {
                hashes.push(Buffer.from(hash, 'binary').toString('hex'))
            }
            console.log(`${LTS()} ${chalk.cyanBright('Sync')} ${chalk.blueBright(hashes.join(' '))}`)
        }
    })
    if (configSettings.log.thread === true) node.on('thread', threadId => console.log(`${LTS()} ${chalk.cyanBright('Thread')} ${chalk.yellowBright(threadId)} ${chalk.cyan('ready')}`))
    if (configSettings.log.verifyrate === true) node.on('verifyrate', ({ transaction, block }) => console.log(`${LTS()} ${chalk.yellowBright(block)} ${chalk.cyan(`B${chalk.cyanBright('/')}s`)} ${chalk.yellowBright(transaction)} ${chalk.cyan(`T${chalk.cyanBright('/')}s`)}`))
    setPriority(19)
    for (let i = 0; i < node.threads; i++) {
        node.addWorker(new Worker(__filename))
    }
}
else {
    new NodeThread()
}