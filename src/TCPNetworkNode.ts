import * as net from 'net'
import * as events from 'events'
import * as config from '../config.json'
import customHash from './customHash'
import protocol from './protocol'
import Transaction from './Transaction'
import Block from './Block'
interface Socket extends net.Socket {
    bytesReadLastSecond: number
    data: Buffer
}
interface TCPNetworkNode {
    hashes: Array<{ hash: Buffer, timestamp: number }>
    sockets: Array<Socket>
    blacklisted: Array<String>
    // server
    server: net.Server
    // client
}
class TCPNetworkNode extends events.EventEmitter {
    constructor() {
        super()
        this.hashes = []
        this.sockets = []
        this.blacklisted = []
        this.on('blacklist', (socket: Socket, reason: string) => {
            socket.destroy()
            this.blacklisted.push(socket.remoteAddress)
        })
        setInterval(this.interval[0].bind(this), 1000)
        setInterval(this.interval[1].bind(this), config.node.hashes.interval)
        // server
        this.server = new net.Server()
        this.server.maxConnections = config.network.maxConnections
        // client
    }
    interval: Array<Function> = [
        () => {
            for (const socket of this.sockets) {
                if (!socket) continue
                // console.info('bytesReadLastSecond', socket.bytesReadLastSecond)
                socket.bytesReadLastSecond = 0
            }
        },
        () => {
            this.hashes = this.hashes.filter(e => e.timestamp > Date.now() - config.node.hashes.timeToLive)
        }
    ]
    addSocket(socket: Socket) {
        if (this.blacklisted.includes(socket.remoteAddress)) return socket.destroy()
        let index = this.sockets.indexOf(undefined)
        const add = () => {
            socket.setTimeout(config.node.socket.setTimeout)
            if (this.hasSocket(socket)) {
                return socket.destroy()
            }
            if (index !== -1) {
                this.sockets[index] = socket
            }
            else {
                this.sockets.push(socket)
                index = this.sockets.length - 1
            }
            this.broadcastAndStoreDataHash(protocol.constructDataBuffer('node', {
                address: socket.remoteAddress,
                family: socket.remoteFamily,
                port: socket.remotePort
            }))
            this.emit('socket', socket)
        }
        if (!socket.connecting) add()
        socket.bytesReadLastSecond = socket.bytesRead
        socket.data = Buffer.alloc(0)
        socket
            .on('connect', () => {
                add()
                this.emit('connect', socket)
            })
            .on('error', () => socket.destroy())
            .on('close', () => {
                socket.destroy()
                this.sockets[index] = undefined
            })
            .on('timeout', () => this.emit('blacklist', socket, 'not sending data'))
            .on('data', chunk => {
                const byteLength = Buffer.byteLength(chunk)
                socket.bytesReadLastSecond += byteLength
                if (socket.bytesReadLastSecond > config.node.socket.maxBytesPerSecond) return this.emit('blacklist', socket, 'sending data too fast')
                socket.data = Buffer.concat([socket.data, chunk])
                if (Buffer.byteLength(socket.data) > config.node.socket.maxBytesInMemory) return this.emit('blacklist', socket, 'sending too much data without end')
                let index = null
                while (index !== -1 && !socket.destroyed) {
                    index = protocol.getEndIndex(socket.data)
                    if (index !== -1) {
                        const data = socket.data.slice(0, index)
                        this.handleData(data, socket)
                        this.emit('data', data, socket)
                        socket.data = socket.data.slice(index + 32)
                    }
                }
            })
            .on('end', () => socket.destroy())
            .on('drain', () => {})
            .on('lookup', () => {})
    }
    // !
    // isValidBuffer(buf: Buffer) {
    //     // + 1 for the protocol byte in the beginning of the buffer
    //     if (Buffer.byteLength(buf) > 1 + config.mining.blockSize) return false
    //     if (protocol.parseDataBuffer(buf) === null) return false
    //     return true
    // }
    compareAndStoreHash(data: Buffer) {
        const hash = customHash(data)
        this.addHash(hash)
        if (this.hashes.find(e => e.hash.compare(hash) === 0)) return true
        return false
    }
    addHash(data: Buffer) {
        const hash = customHash(data)
        this.hashes.push({ hash, timestamp: Date.now() })
        if (this.hashes.length > config.node.hashes.length) this.hashes.shift()
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
    connectToNetwork(nodes: Array<{ port: number, address: string }>) {
        for (const node of nodes) {
            if (typeof node.port !== 'number') continue
            if (typeof node.address !== 'string') continue
            if (node.port < 0 || node.port > 65535) continue
            if (node.address !== 'localhost') {
                if (Buffer.byteLength(Buffer.from(node.address.split('.'))) !== 4
                    && Buffer.byteLength(Buffer.from(node.address.split(':'))) > 16) continue
            }
            // !
            // if (node.port === config.network.port
            //     && node.address === config.network.address) continue
            const socket = <Socket> net.connect(node.port, node.address)
            this.addSocket(socket)
        }
    }
    disconnectFromNetwork() {
        for (const socket of this.sockets) {
            socket.destroy()
            socket.removeAllListeners()
        }
        this.sockets = []
    }
    async handleData(buf: Buffer, socket: Socket) {
        if (this.compareAndStoreHash(buf)) return
        const parsed = protocol.parseDataBuffer(buf)
        if (!parsed) return this.emit('blacklist', socket, 'invalid buffer')
        switch (parsed.type) {
            case 'block':
                if (!parsed.data) return this.emit('blacklist', socket, 'invalid parsed data block')
                const block = new Block(Block.beautify(parsed.data))
                this.emit('block', block)
                break
            case 'transaction':
                if (!parsed.data) return this.emit('blacklist', socket, 'invalid parsed data transaction')
                const transaction = new Transaction(Transaction.beautify(parsed.data))
                this.emit('transaction', transaction)
                break
            case 'node':
                if (!parsed.data) return this.emit('blacklist', socket, 'invalid parsed data node')
                if (config.node.connectToNodes) this.connectToNetwork([ <{ port: number, address: string }> parsed.data ])
                this.emit('node', parsed.data)
                break
        }
        this.broadcastAndStoreDataHash(buf)
    }
    // server
    start(port: number, address: string) {
        this.server
            .on('connection', (socket: Socket) => {
                this.addSocket(socket)
                this.emit('connection', socket)
            })
            .on('listening', () => {})
            .on('close', () => {})
            .on('error', () => {})
            .listen(port, address)
    }
    stop() {
        this.server.close()
    }
    // client
}
export default TCPNetworkNode