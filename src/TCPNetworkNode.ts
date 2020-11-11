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
        // server
        this.server = new net.Server()
        this.server.maxConnections = config.maxConnections
        // client
    }
    addSocket(socket: net.Socket) {
        let index = this.sockets.indexOf(undefined)
        const addSocket = () => {
            const _socket = this.hasSocket(socket)
            if (_socket !== false) {
                _socket.destroy()
                index = this.sockets.indexOf(_socket)
                this.sockets[index] = socket
            }
            else if (index !== -1) this.sockets[index] = socket
            else {
                this.sockets.push(socket)
                index = this.sockets.length - 1
            }
            this.emit('socket', socket)
        }
        if (socket.connecting) socket.on('connect', () => addSocket())
        else addSocket()
        socket
            .on('error', err => {
                socket.destroy()
                this.sockets[index] = undefined
            })
            .on('close', err => {
                socket.destroy()
                this.sockets[index] = undefined
            })
    }
    verifyData(data: Buffer) {
        if (Buffer.byteLength(data) > config.byteLength.verifyData) return false
        const hash = customHash(data)
        if (this.dataHashes.find(e => e.compare(hash) === 0)) return false
        if (protocol.parseDataBuffer(data) === null) return false
        this.dataHashes.push(hash)
        if (this.dataHashes.length > config.dataHashesLength) this.dataHashes.shift()
        return true
    }
    broadcast(data: Buffer) {
        for (const socket of this.sockets) {
            if (!socket) continue
            socket.write(data)
        }
    }
    broadcastAndStoreDataHash(data: Buffer) {
        if (!this.verifyData(data)) return
        this.broadcast(data)
    }
    hasSocket(socket) {
        const info = <net.AddressInfo> socket.address()
        for (const _socket of this.sockets) {
            if (!_socket) continue
            const _info = <net.AddressInfo> _socket.address()
            if (info.port === _info.port
                && info.address === _info.address) return _socket
            if (info.port === _socket.remotePort
                && info.address === _socket.remoteAddress) return _socket
            if (_info.port === socket.remotePort
                && _info.address === socket.remoteAddress) return _socket
            if (socket.remotePort === _socket.remotePort
                && socket.remoteAddress === _socket.remoteAddress) return _socket
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
            const socket = this.createSocket(node.port, node.address)
            socket.on('connect', () => console.log('connected to socket :)'))
        }
    }
    disconnectFromNetwork() {
        for (const socket of this.sockets) {
            socket.destroy()
        }
        this.sockets = []
    }
    async handleData(raw) {
        if (!this.verifyData(raw)) return
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
                this.addSocket(socket)
                socket.on('data', data => this.emit('data', data))
            })
            .on('listening', () => this.emit('listening'))
            .on('close', () => {})
            .on('error', () => {})
            .listen(port, address)
    }
    stop() {
        this.server.close()
    }
    // client
    createSocket(port: number, address: string) {
        const socket = net.connect(port, address)
        this.addSocket(socket)
        socket.on('data', data => this.emit('data', data))
        return socket
    }
}
export default TCPNetworkNode