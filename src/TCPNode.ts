import * as net from 'net'
import * as events from 'events'
import * as configSettings from '../config/settings.json'
import * as configNetwork from '../config/network.json'
import * as crypto from 'crypto'
import protocol from './protocol'
import parseNodes from './parseNodes'
import Peer from './Peer'
import * as fs from 'fs'
interface TCPNetworkNode {
    hashes: Array<{ hash: Buffer, timestamp: number }>
    peers: Set<Peer>
    banned: Array<String>
    // server
    server: net.Server
    // client
}
class TCPNetworkNode extends events.EventEmitter {
    constructor() {
        super()
        this.hashes = []
        this.peers = new Set()
        this.banned = []
        if (configSettings.logs.use && fs.existsSync(`${configSettings.logs.path}/banned.txt`)) this.banned = parseNodes(fs.readFileSync(`${configSettings.logs.path}/banned.txt`, 'binary')).map(e => `${e.address}:${e.port}`)
        this.on('ban', (peer: Peer) => this.banned.push(peer.socket.remoteAddress))
        setInterval(this.clear.bind(this), configSettings.TCPNode.hashes.interval)
        // server
        this.server = new net.Server()
        this.server.maxConnections = configSettings.TCPNode.maxConnectionsIn
        this.server
            .on('connection', socket => this.add(new Peer(socket)))
            .on('listening', () => this.emit('listening'))
            .on('error', e => this.emit('error', e))
            // .on('close', () => {})
        // client
    }
    clear() {
        this.hashes = this.hashes.filter(e => e.timestamp > Date.now() - configSettings.TCPNode.hashes.timeToLive)
    }
    add(peer: Peer) {
        if (this.banned.includes(peer.socket.remoteAddress)) return peer.del()
        peer
            .on('add', () => {
                if (this.hasSocketWithRemoteAddress(peer) || this.peers.size >= configSettings.TCPNode.maxConnectionsOut) return peer.del()
                this.peers.add(peer)
                this.emit('peer', peer)
                this.broadcastAndStoreHash(protocol.constructBuffer('post-node', {
                    address: peer.socket.remoteAddress,
                    family: peer.socket.remoteFamily,
                    port: peer.socket.remotePort
                }))
            })
            .on('del', () => this.peers.delete(peer))
            .on('ban', () => this.emit('ban', peer))
        for (const type of protocol.types) {
            peer.on(type, (data, buffer) => {
                if (this.compareAndStoreHash(buffer) === true) return
                this.emit(type, data, peer)
                if (type.startsWith('post')) this.broadcast(buffer)
            })
        }
    }
    compareAndStoreHash(buffer: Buffer) {
        const hash = crypto.createHash('sha256').update(buffer).digest()
        const found = this.hashes.find(e => e.hash.equals(hash)) ? true : false
        if (found === false) this.addHash(hash)
        return found
    }
    addHash(hash: Buffer) {
        this.hashes.push({ hash, timestamp: Date.now() })
        if (this.hashes.length > configSettings.TCPNode.hashes.length) this.hashes.shift()
    }
    broadcast(buffer: Buffer) {
        return <any> new Promise(resolve => {
            if (this.peers.size === 0) resolve(true)
            let i = 0
            const cb = () => {
                if (++i === this.peers.size) resolve(true)
            }
            for (const peer of this.peers) {
                if (configSettings.Peer.maxRequestsPerSecond !== 0
                && ++peer.requests > configSettings.Peer.maxRequestsPerSecond) cb()
                peer.write(buffer, () => cb())
            }
        })
    }
    async broadcastAndStoreHash(buffer: Buffer) {
        this.compareAndStoreHash(buffer)
        await this.broadcast(buffer)
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
    connectToNetwork(nodes: Array<{ port: number, address: string }>) {
        nodes = TCPNetworkNode.shuffle(nodes)
        for (const node of nodes) {
            if (typeof node.port !== 'number') continue
            if (typeof node.address !== 'string') continue
            if (node.port < 0 || node.port > 65535) continue
            if (node.address !== 'localhost') {
                if (Buffer.byteLength(Buffer.from(node.address.split('.'))) !== 4
                && Buffer.byteLength(Buffer.from(node.address.split(':'))) > 8) continue
            }
            if (configSettings.TCPNode.allowConnectionsToSelf === false
            && node.port === configNetwork.TCPNetworkNode.port
            && node.address === configNetwork.TCPNetworkNode.address) continue
            const socket = net.connect(node.port, node.address)
            this.add(new Peer(socket))
        }
    }
    disconnectFromNetwork() {
        for (const peer of this.peers) {
            peer.del()
        }
    }
    // server
    start() {
        this.server.listen(configNetwork.TCPNetworkNode.port, configNetwork.TCPNetworkNode.address)
    }
    stop() {
        this.server.close()
    }
    // client
}
export default TCPNetworkNode