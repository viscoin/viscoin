import * as net from 'net'
import * as events from 'events'
import * as configSettings from '../config/settings.json'
import * as configNetwork from '../config/network.json'
import * as crypto from 'crypto'
import protocol from './protocol'
import parseNodes from './parseNodes'
import Socket from './Socket'
import * as fs from 'fs'
interface TCPNetworkNode {
    hashes: Array<{ hash: Buffer, timestamp: number }>
    sockets: Set<Socket>
    banned: Array<String>
    // server
    server: net.Server
    // client
}
class TCPNetworkNode extends events.EventEmitter {
    constructor() {
        super()
        this.hashes = []
        this.sockets = new Set()
        this.banned = []
        if (configSettings.logs.use && fs.existsSync(`${configSettings.logs.path}/banned.txt`)) this.banned = parseNodes(fs.readFileSync(`${configSettings.logs.path}/banned.txt`, 'binary')).map(e => `${e.address}:${e.port}`)
        this.on('ban', (socket: Socket) => this.banned.push(socket.remoteAddress))
        setInterval(this.clear.bind(this), configSettings.TCPNode.hashes.interval)
        // server
        this.server = new net.Server()
        this.server.maxConnections = configSettings.TCPNode.server.maxConnectionsIn
        this.server
            .on('connection', (socket: Socket) => {
                this.add(socket)
                this.emit('connection', socket)
            })
            .on('listening', () => this.emit('listening'))
            .on('error', e => this.emit('error', e))
            .on('close', () => {})
        // client
    }
    clear() {
        this.hashes = this.hashes.filter(e => e.timestamp > Date.now() - configSettings.TCPNode.hashes.timeToLive)
    }
    add(socket: Socket) {
        if (this.banned.includes(socket.remoteAddress)) return socket.del()
        socket
            .on('add', () => {
                if (this.hasSocketWithRemoteAddress(socket) || this.sockets.size >= configSettings.TCPNode.maxConnectionsOut) return socket.del()
                this.sockets.add(socket)
                this.broadcastAndStoreDataHash(protocol.constructDataBuffer('post-node', {
                    address: socket.remoteAddress,
                    family: socket.remoteFamily,
                    port: socket.remotePort
                }))
                this.emit('socket', socket)
            })
            .on('del', () => this.sockets.delete(socket))
            .on('ban', () => this.emit('ban', socket))
        for (const type in protocol.types) {
            socket.on(type, (data, buffer) => {
                if (this.compareAndStoreHash(buffer)) return
                this.emit(type, data)
                if (type.startsWith('post')) this.broadcast(buffer)
            })
        }
    }
    compareAndStoreHash(data: Buffer) {
        const hash = crypto.createHash('sha256').update(data).digest()
        const found = this.hashes.find(e => e.hash.equals(hash)) ? true : false
        if (found === false) this.addHash(hash)
        return found
    }
    addHash(hash: Buffer) {
        this.hashes.push({ hash, timestamp: Date.now() })
        if (this.hashes.length > configSettings.TCPNode.hashes.length) this.hashes.shift()
    }
    broadcast(data: Buffer) {
        return <any> new Promise(resolve => {
            if (this.sockets.size === 0) resolve(true)
            let i = 0
            const cb = () => {
                if (++i === this.sockets.size) resolve(true)
            }
            for (const socket of this.sockets) {
                if (configSettings.TCPNode.socket.maxRequestsPerSecond !== 0
                && ++socket.requests > configSettings.TCPNode.socket.maxRequestsPerSecond) cb()
                socket.write(data, () => cb())
            }
        })
    }
    async broadcastAndStoreDataHash(data: Buffer) {
        this.compareAndStoreHash(data)
        await this.broadcast(data)
    }
    hasSocketWithRemoteAddress(socket) {
        for (const _socket of this.sockets) {
            if (socket.remoteAddress === _socket.remoteAddress) return true
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
            const socket = <Socket> net.connect(node.port, node.address)
            this.add(socket)
        }
    }
    disconnectFromNetwork() {
        for (const socket of this.sockets) {
            this.emit('del', (socket))
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