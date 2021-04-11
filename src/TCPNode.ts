import * as net from 'net'
import * as events from 'events'
import * as configSettings from '../config/settings.json'
import * as configNetwork from '../config/network.json'
import * as crypto from 'crypto'
import protocol from './protocol'
import Peer from './Peer'
import * as fs from 'fs'
interface TCPNode {
    hashes: Array<{ hash: Buffer, timestamp: number }>
    peers: Set<Peer>
    banned: Set<String>
    server: net.Server
}
class TCPNode extends events.EventEmitter {
    constructor() {
        super()
        this.hashes = []
        this.peers = new Set()
        this.banned = new Set()
        if (configSettings.logs.use && fs.existsSync(`${configSettings.logs.path}/banned.txt`)) {
            this.banned = new Set(fs.readFileSync(`${configSettings.logs.path}/banned.txt`).toString().split(configSettings.EOL))
            this.banned.delete('')
        }
        this.server = new net.Server()
        this.server.maxConnections = configSettings.TCPNode.maxConnectionsIn
        this.server
            .on('connection', socket => this.add(new Peer(socket), true))
            .on('listening', () => this.emit('listening'))
            .on('error', e => this.emit('error', e))
            .on('close', () => {})
    }
    add(peer: Peer, server: boolean) {
        peer
            .on('add', () => {
                if (this.banned.has(peer.remoteAddress)) return peer.delete()
                if (this.hasSocketWithRemoteAddress(peer) || this.peers.size >= configSettings.TCPNode.maxConnectionsOut) return peer.delete()
                this.peers.add(peer)
                this.emit('peer-connect', peer, server)
                if (server === false) {
                    this.broadcast(protocol.constructBuffer('node', {
                        address: peer.remoteAddress,
                        port: peer.remotePort
                    }))
                }
                else {
                    this.broadcast(protocol.constructBuffer('node', {
                        address: peer.remoteAddress,
                        port: configNetwork.TCPNode.port
                    }))
                }
            })
            .on('delete', () => {
                if (this.peers.delete(peer)) this.emit('peer-disconnect', peer, server)
            })
            .on('ban', () => {
                this.banned.add(peer.remoteAddress)
                this.emit('peer-ban', peer, server)
            })
        for (const type of protocol.types) {
            peer.on(type, (data, buffer, cb) => {
                this.emit(type, data, res => cb(res))
            })
        }
    }
    broadcast(buffer: Buffer, skipHash = false) {
        return <Promise<void>> new Promise(resolve => {
            const hash = skipHash === false ? crypto.createHash('sha256').update(buffer).digest() : null
            if (this.peers.size === 0) resolve()
            let i = 0
            const cb = () => {
                if (++i === this.peers.size) resolve()
            }
            for (const peer of this.peers) {
                if (skipHash === true) {
                    peer.write(buffer, () => cb())
                }
                else {
                    if (peer.compareHash(hash) === true) cb()
                    else {
                        peer.addHash(hash)
                        peer.write(buffer, () => cb())
                    }
                }
            }
        })
    }
    hasSocketWithRemoteAddress(peer: Peer) {
        for (const _peer of this.peers) {
            if (peer.remoteAddress === _peer.remoteAddress) return true
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
        if (port === undefined && address === undefined) return 6
        if (typeof port !== 'number') return 1
        if (typeof address !== 'string') return 2
        if (address !== 'localhost') {
            if (Buffer.byteLength(Buffer.from(address.split('.'))) !== 4
            && Buffer.byteLength(Buffer.from(address.split(':'))) > 8) return 3
        }
        if (port < 1024 || port > 49151) return 4
        if (configSettings.TCPNode.allowConnectionsToSelf !== true
        && port === configNetwork.TCPNode.port
        && address === configNetwork.TCPNode.address) return 5
        return 0
    }
    connectToNetwork(nodes: Array<{ port: number, address: string }>) {
        nodes = TCPNode.shuffle(nodes)
        for (const node of nodes) {
            let code = TCPNode.verifyNode(node)
            if (code === 4) {
                node.port = configNetwork.TCPNode.port
                code = TCPNode.verifyNode(node)
            }
            if (code !== 0) continue
            const socket = net.connect(node.port, node.address)
            this.add(new Peer(socket), false)
        }
    }
    connectToNode({ port, address }: { port: number, address: string }) {
        let code = TCPNode.verifyNode({ port, address })
        if (code === 4) {
            port = configNetwork.TCPNode.port
            code = TCPNode.verifyNode({ port, address })
        }
        if ([ 1, 2, 3 ].includes(code)) return 1
        else if (code !== 0) return 2
        const socket = net.connect(port, address)
        this.add(new Peer(socket), false)
        return 0
    }
    disconnectFromNetwork() {
        for (const peer of this.peers) {
            peer.delete()
        }
    }
    start() {
        this.server.listen(configNetwork.TCPNode.port, configNetwork.TCPNode.address)
    }
    stop() {
        this.server.close()
    }
}
export default TCPNode