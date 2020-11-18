import * as net from 'net'
import * as events from 'events'
import * as config from '../config.json'
import customHash from './customHash'
import protocol from './protocol'
import schema_node from './mongoose/schema/node'
import Transaction from './Transaction'
import Block from './Block'
interface TCPNetworkNode {
    dataHashes: Array<Buffer>
    sockets: Array<net.Socket>
    // server
    server: net.Server
    // client
}
class TCPNetworkNode extends events.EventEmitter {
    constructor() {
        super()
        this.dataHashes = []
        this.sockets = []
        this.on('data', data => this.handleData(data))
        this.on('socket', socket => this.handleSocket(socket))
        // server
        this.server = new net.Server()
        this.server.maxConnections = config.maxConnections
        // client
    }
    addSocket(socket: net.Socket) {
        let index = this.sockets.indexOf(undefined)
        const add = () => {
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
            this.emit('socket', socket)
        }
        if (!socket.connecting) add()
        socket
            .on('connect', () => {
                this.emit('connect', socket)
                add()
            })
            .on('error', () => {
                socket.destroy()
                this.sockets[index] = undefined
            })
            .on('close', () => {
                socket.destroy()
                this.sockets[index] = undefined
            })
            .on('data', data => this.emit('data', data))
            .on('drain', () => {})
            .on('end', () => {})
            .on('lookup', () => {})
            .on('timeout', () => {})
    }
    isValidBuffer(data: Buffer) {
        if (Buffer.byteLength(data) > config.byteLength.isValidBuffer) return false
        if (protocol.parseDataBuffer(data) === null) return false
        if (this.dataHashes.length > config.dataHashesLength) this.dataHashes.shift()
        return true
    }
    compareHash(data: Buffer) {
        const hash = customHash(data)
        if (this.dataHashes.find(e => e.compare(hash) === 0)) return true
        return false
    }
    addHash(data: Buffer) {
        const hash = customHash(data)
        this.dataHashes.push(hash)
    }
    broadcast(data: Buffer) {
        for (const socket of this.sockets) {
            if (!socket) continue
            socket.write(data)
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
            if (node.port === config.network.port
                && node.address === config.network.address) continue
            const socket = net.connect(node.port, node.address)
            this.addSocket(socket)
        }
    }
    disconnectFromNetwork() {
        for (const socket of this.sockets) {
            socket.destroy()
        }
        this.sockets = []
    }
    async handleData(raw) {
        if (!this.isValidBuffer(raw)) return
        if (this.compareHash(raw)) return
        const parsed = protocol.parseDataBuffer(raw)
        if (parsed === null) return
        switch (parsed.type) {
            case 'block':
                if (!parsed.data) return
                const block = new Block(parsed.data)
                this.emit('block', block)
                break
            case 'transaction':
                if (!parsed.data) return
                const transaction = new Transaction(parsed.data)
                this.emit('transaction', transaction)
                break
            case 'node':
                // if remote socket is serverNode (probably)
                // if ([8333, 8334, 8335].includes(processed.data.port)) {
                //     this.emit('node', processed.data)
                // }
                if (!parsed.data) return
                // if (processed.data.port !== 8333) processed.data.port = 8333
                this.emit('node', parsed.data)
                break
        }
        this.broadcastAndStoreDataHash(raw)
    }
    async handleSocket(socket) {
        this.broadcastAndStoreDataHash(protocol.constructDataBuffer('node', {
            address: socket.remoteAddress,
            family: socket.remoteFamily,
            port: socket.remotePort
        }))
        if (config.save_connected_nodes) await new schema_node({
            address: socket.remoteAddress,
            family: socket.remoteFamily,
            port: socket.remotePort
        }).save()
    }
    // server
    start(port: number, address: string) {
        this.server
            .on('connection', socket => {
                this.emit('connection', socket)
                this.addSocket(socket)
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