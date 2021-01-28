import * as net from 'net'
import * as events from 'events'
import * as config from '../config.json'
import * as crypto from 'crypto'
import protocol from './protocol'
import parseNodes from './parseNodes'
import * as fs from 'fs'
interface Socket extends net.Socket {
    bytesReadLastSecond: number
    data: Buffer
}
interface TCPNetworkNode {
    hashes: Array<{ hash: Buffer, timestamp: number }>
    sockets: Set<Socket>
    blacklisted: Array<String>
    // server
    server: net.Server
    // client
}
class TCPNetworkNode extends events.EventEmitter {
    constructor() {
        super()
        this.hashes = []
        this.sockets = new Set()
        this.blacklisted = []
        if (config.logs.use && fs.existsSync(`${config.logs.path}/blacklisted.txt`)) this.blacklisted = parseNodes(fs.readFileSync(`${config.logs.path}/blacklisted.txt`, 'binary')).map(e => `${e.address}:${e.port}`)
        this.on('blacklist', (socket: Socket, reason: string) => {
            this.destroySocket(socket)
            this.blacklisted.push(socket.remoteAddress)
        })
        setInterval(this.interval[0].bind(this), 1000)
        setInterval(this.interval[1].bind(this), config.TCPNetworkNode.hashes.interval)
        // server
        this.server = new net.Server()
        this.server.maxConnections = config.TCPNetworkNode.server.maxConnectionsIn
        this.server
            .on('connection', (socket: Socket) => {
                this.addSocket(socket)
                this.emit('connection', socket)
            })
            .on('listening', () => this.emit('listening'))
            .on('close', () => {})
            .on('error', () => {})
        // client
    }
    interval: Array<Function> = [
        () => {
            for (const socket of this.sockets) {
                socket.bytesReadLastSecond = 0
            }
        },
        () => {
            this.hashes = this.hashes.filter(e => e.timestamp > Date.now() - config.TCPNetworkNode.hashes.timeToLive)
        }
    ]
    addSocket(socket: Socket) {
        if (this.blacklisted.includes(socket.remoteAddress)) return this.destroySocket(socket)
        const add = () => {
            socket.setTimeout(config.TCPNetworkNode.socket.setTimeout)
            if (this.hasSocket(socket) || this.sockets.size >= config.TCPNetworkNode.maxConnectionsOut) return this.destroySocket(socket)
            this.sockets.add(socket)
            this.broadcastAndStoreDataHash(protocol.constructDataBuffer('node', {
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
            .on('timeout', () => this.emit('blacklist', socket, 'idle'))
            .on('data', chunk => {
                const byteLength = Buffer.byteLength(chunk)
                socket.bytesReadLastSecond += byteLength
                if (socket.bytesReadLastSecond > config.TCPNetworkNode.socket.maxBytesPerSecond) return this.emit('blacklist', socket, 'sending data too fast')
                socket.data = Buffer.concat([socket.data, chunk])
                if (Buffer.byteLength(socket.data) > config.TCPNetworkNode.socket.maxBytesInMemory) return this.emit('blacklist', socket, 'sending too much data without end')
                let index = protocol.getEndIndex(socket.data)
                while (index !== -1 && !socket.destroyed) {
                    const buffer = socket.data.slice(0, index)
                    socket.data = socket.data.slice(index + Buffer.byteLength(protocol.end))
                    if (Buffer.byteLength(buffer) !== 0) {
                        if (this.compareAndStoreHash(buffer)) continue
                        const parsed = protocol.parse(buffer)
                        // if (parsed === null) return this.emit('blacklist', socket, 'parsed === null')
                        if (parsed === null) continue
                        const { type, data } = parsed
                        this.emit(type, data)
                        this.broadcastAndStoreDataHash(buffer)
                    }
                    index = protocol.getEndIndex(socket.data)
                }
            })
    }
    compareAndStoreHash(data: Buffer) {
        const hash = crypto.createHash('sha256').update(data).digest()
        this.addHash(hash)
        if (this.hashes.find(e => e.hash.compare(hash) === 0)) return true
        return false
    }
    addHash(data: Buffer) {
        const hash = crypto.createHash('sha256').update(data).digest()
        this.hashes.push({ hash, timestamp: Date.now() })
        if (this.hashes.length > config.TCPNetworkNode.hashes.length) this.hashes.shift()
    }
    broadcast(data: Buffer) {
        for (const socket of this.sockets) {
            if (!socket) continue
            socket.write(data)
            socket.write(protocol.end)
        }
    }
    broadcastAndStoreDataHash(data: Buffer) {
        this.addHash(data)
        this.broadcast(data)
    }
    hasSocket(socket) {
        for (const _socket of this.sockets) {
            if (!_socket) continue
            if (socket.remotePort === _socket.remotePort
            && socket.remoteAddress === _socket.remoteAddress) return true
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
                && Buffer.byteLength(Buffer.from(node.address.split(':'))) > 16) continue
            }
            if (node.port === config.TCPNetworkNode.server.port
            && node.address === config.TCPNetworkNode.server.address) continue
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
        this.server.listen(config.TCPNetworkNode.server.port, config.TCPNetworkNode.server.address)
    }
    stop() {
        this.server.close()
    }
    // client
}
export default TCPNetworkNode