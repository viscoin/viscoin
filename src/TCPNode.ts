import * as net from 'net'
import * as events from 'events'
import * as configSettings from '../config/settings.json'
import * as configNetwork from '../config/network.json'
import * as crypto from 'crypto'
import protocol from './protocol'
import parseNodes from './parseNodes'
import * as fs from 'fs'
interface Socket extends net.Socket {
    bytesReadLastSecond: number
    data: Buffer
    requests: number
}
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
        this.on('ban', (socket: Socket) => {
            this.destroySocket(socket)
            this.banned.push(socket.remoteAddress)
        })
        setInterval(this.interval[0].bind(this), 1000)
        setInterval(this.interval[1].bind(this), configSettings.TCPNode.hashes.interval)
        // server
        this.server = new net.Server()
        this.server.maxConnections = configSettings.TCPNode.server.maxConnectionsIn
        this.server
            .on('connection', (socket: Socket) => {
                this.addSocket(socket)
                this.emit('connection', socket)
            })
            .on('listening', () => this.emit('listening'))
            .on('error', e => this.emit('error', e))
            .on('close', () => {})
        // client
    }
    interval: Array<Function> = [
        () => {
            for (const socket of this.sockets) {
                socket.bytesReadLastSecond = 0
                socket.requests = 0
            }
        },
        () => {
            this.hashes = this.hashes.filter(e => e.timestamp > Date.now() - configSettings.TCPNode.hashes.timeToLive)
        }
    ]
    addSocket(socket: Socket) {
        if (this.banned.includes(socket.remoteAddress)) return this.destroySocket(socket)
        const add = () => {
            socket.setTimeout(configSettings.TCPNode.socket.setTimeout)
            if (this.hasSocketWithRemoteAddress(socket) || this.sockets.size >= configSettings.TCPNode.maxConnectionsOut) return this.destroySocket(socket)
            this.sockets.add(socket)
            this.broadcastAndStoreDataHash(protocol.constructDataBuffer('post-node', {
                address: socket.remoteAddress,
                family: socket.remoteFamily,
                port: socket.remotePort
            }))
            this.emit('socket', socket)
        }
        if (socket.connecting === false) add()
        socket.bytesReadLastSecond = socket.bytesRead
        socket.data = Buffer.alloc(0)
        socket
            .on('connect', () => add())
            .on('error', () => {})
            .on('close', () => this.destroySocket(socket))
            .on('timeout', () => this.emit('ban', socket))
            .on('data', async chunk => {
                const byteLength = Buffer.byteLength(chunk)
                socket.bytesReadLastSecond += byteLength
                if (socket.bytesReadLastSecond > configSettings.TCPNode.socket.maxBytesPerSecond) return this.emit('ban', socket)
                socket.data = Buffer.concat([socket.data, chunk])
                if (Buffer.byteLength(socket.data) > configSettings.TCPNode.socket.maxBytesInMemory) return this.emit('ban', socket)
                let index = protocol.getEndIndex(socket.data)
                while (index !== -1 && !socket.destroyed) {
                    if (++socket.requests > configSettings.TCPNode.socket.maxRequestsPerSecond) {
                        if (configSettings.TCPNode.socket.onAbuseRequestsBehaviour === 'continue') continue
                        else if (configSettings.TCPNode.socket.onAbuseRequestsBehaviour === 'ban') return this.emit('ban', socket)
                    }
                    const a = index + Buffer.byteLength(protocol.end)
                    const b = socket.data.slice(0, a) 
                    socket.data = socket.data.slice(a)
                    const c = b.slice(0, 32)
                    const d = b.slice(32, a - Buffer.byteLength(protocol.end))
                    if (Buffer.byteLength(c) > 0
                    && Buffer.byteLength(d) > 0) {
                        if (this.compareAndStoreHash(b)) continue
                        if (crypto.createHash('sha256').update(d).digest().equals(c) === false) continue
                        const parsed = protocol.parse(d)
                        if (parsed === null) continue
                        const { type, data } = parsed
                        this.emit(type, data, socket)
                        if (type.startsWith('post')) await this.broadcast(b)
                        // if (type.startsWith('post')) await this.broadcastAndStoreDataHash(b)
                    }
                    index = protocol.getEndIndex(socket.data)
                }
            })
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
            for (const socket of this.sockets) {
                socket.write(data, () => {
                    if (++i === this.sockets.size) resolve(true)
                })
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
            this.addSocket(socket)
        }
    }
    disconnectFromNetwork() {
        for (const socket of this.sockets) {
            this.destroySocket(socket)
        }
    }
    destroySocket(socket: Socket) {
        socket.destroy()
        socket.removeAllListeners()
        this.sockets.delete(socket)
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