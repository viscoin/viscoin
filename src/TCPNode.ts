import * as net from 'net'
import * as events from 'events'
import * as configSettings from '../config/settings.json'
import * as configNetwork from '../config/network.json'
import * as crypto from 'crypto'
import protocol from './protocol'
import parseNodes from './parseNodes'
import Peer from './Peer'
import * as fs from 'fs'
interface TCPNode {
    hashes: Array<{ hash: Buffer, timestamp: number }>
    peers: Set<Peer>
    banned: Array<String>
    // server
    server: net.Server
    // client
}
class TCPNode extends events.EventEmitter {
    constructor() {
        super()
        this.hashes = []
        this.peers = new Set()
        this.banned = []
        if (configSettings.logs.use && fs.existsSync(`${configSettings.logs.path}/banned.txt`)) this.banned = parseNodes(fs.readFileSync(`${configSettings.logs.path}/banned.txt`, 'binary')).map(e => `${e.address}:${e.port}`)
        this.on('ban', (peer: Peer) => this.banned.push(peer.socket.remoteAddress))
        // server
        this.server = new net.Server()
        this.server.maxConnections = configSettings.TCPNode.maxConnectionsIn
        this.server
            .on('connection', socket => this.add(new Peer(socket), true))
            .on('listening', () => this.emit('listening'))
            .on('error', e => this.emit('error', e))
            // .on('close', () => {})
        // client
    }
    add(peer: Peer, server: boolean) {
        if (this.banned.includes(peer.socket.remoteAddress)) return peer.del()
        peer
            .on('add', () => {
                if (this.hasSocketWithRemoteAddress(peer) || this.peers.size >= configSettings.TCPNode.maxConnectionsOut) return peer.del()
                this.peers.add(peer)
                this.emit('peer', peer)
                if (server === false) {
                    this.broadcast(protocol.constructBuffer('node', {
                        address: peer.socket.remoteAddress,
                        port: peer.socket.remotePort
                    }))
                }
            })
            .on('del', () => this.peers.delete(peer))
            .on('ban', () => this.emit('ban', peer))
        for (const type of protocol.types) {
            peer.on(type, (data, buffer, cb) => {
                this.emit(type, data, code => {
                    cb(code)
                    if (code === 0) this.broadcast(buffer)
                })
            })
        }
    }
    broadcast(buffer: Buffer) {
        return <Promise<void>> new Promise(resolve => {
            const hash = crypto.createHash('sha256').update(buffer).digest()
            if (this.peers.size === 0) resolve()
            let i = 0
            const cb = () => {
                if (++i === this.peers.size) resolve()
            }
            for (const peer of this.peers) {
                if (peer.compareHash(hash) === true) cb()
                else {
                    peer.addHash(hash)
                    peer.write(buffer, () => cb())
                }
            }
        })
    }
    hasSocketWithRemoteAddress(peer: Peer) {
        for (const _peer of this.peers) {
            if (peer.socket.remoteAddress === _peer.socket.remoteAddress) return true
        }
        return false
    }
    static shuffle(arr: Array<any>) {
        let j, x
        for (let i = arr.length - 1; i > 0; i--) {
            j = Math.floor(Math.random() * (i + 1))
            x = arr[i]
            arr[i] = arr[j]
            arr[j] = x
        }
        return arr
    }
    static verifyNode({ port, address }: { port: number, address: string }) {
        if (typeof port !== 'number') return 1
        if (typeof address !== 'string') return 2
        if (address !== 'localhost') {
            if (Buffer.byteLength(Buffer.from(address.split('.'))) !== 4
            && Buffer.byteLength(Buffer.from(address.split(':'))) > 8) return 3
        }
        if (port < 1024 || port > 49151) return 4
        if (configSettings.TCPNode.allowConnectionsToSelf === false
        && port === configNetwork.TCPNode.port
        && address === configNetwork.TCPNode.address) return 5
        return 0
    }
    connectToNetwork(nodes: Array<{ port: number, address: string }>) {
        nodes = TCPNode.shuffle(nodes)
        for (const node of nodes) {
            if (TCPNode.verifyNode(node) !== 0) continue
            const socket = net.connect(node.port, node.address)
            this.add(new Peer(socket), false)
        }
    }
    connectToNode({ port, address }: { port: number, address: string }) {
        const code = TCPNode.verifyNode({ port, address })
        if ([ 0, 4, 5 ].includes(code) === false) return 1
        else if (code === 4) port = configNetwork.TCPNode.port
        else if (code === 5) return 2
        const socket = net.connect(port, address)
        this.add(new Peer(socket), false)
        return 0
    }
    disconnectFromNetwork() {
        for (const peer of this.peers) {
            peer.del()
        }
    }
    // server
    start() {
        this.server.listen(configNetwork.TCPNode.port, configNetwork.TCPNode.address)
    }
    stop() {
        this.server.close()
    }
    // client
}
export default TCPNode