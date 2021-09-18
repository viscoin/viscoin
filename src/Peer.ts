import * as config_settings from '../config/settings.json'
import * as net from 'net'
import * as events from 'events'
import * as crypto from 'crypto'
import protocol from './protocol'
import Block from './Block'
interface Peer extends events.EventEmitter {
    socket: net.Socket
    remotePort: number
    remoteAddress: string
    port: number
    address: string
    bytesRead: number
    bytesWritten: number
    buffer: Buffer
    requests: {
        block: number
        transaction: number
        sync: number
        node: number
    }
    hashes: Array<{ hash: Buffer, timestamp: number }>
    index: number
    height: number
    synced: boolean
    latestBlock: Block
}
class Peer extends events.EventEmitter {
    constructor(socket: net.Socket) {
        super()
        this.socket = socket
        this.bytesRead = this.bytesRead
        this.bytesWritten = this.bytesWritten
        this.buffer = Buffer.alloc(0)
        this.requests = {
            block: 0,
            transaction: 0,
            sync: 0,
            node: 0
        }
        this.hashes = []
        setInterval(this.interval['1s'].bind(this), 1000)
        setInterval(this.interval.hashes.bind(this), config_settings.Peer.hashes.interval)
        this.socket.setTimeout(config_settings.Peer.socket.setTimeout)
        if (this.socket.connecting === false) setImmediate(() => this.emit('add'))
        this.socket
            .on('connect', () => this.emit('add'))
            .on('error', () => {})
            .on('close', () => this.delete())
            .on('timeout', () => this.emit('ban', 1))
            .on('data', chunk => this.onData(chunk))
        this
            .on('add', () => {
                this.remotePort = socket.remotePort
                this.remoteAddress = socket.remoteAddress
                const address = <net.AddressInfo> socket.address()
                this.port = address.port
                this.address = address.address
            })
            .on('ban', () => this.delete())
    }
    interval = {
        '1s': () => {
            this.bytesRead = this.socket.bytesRead
            this.bytesWritten = this.socket.bytesWritten
            this.requests = {
                block: 0,
                transaction: 0,
                sync: 0,
                node: 0
            }
        },
        hashes: () => {
            this.hashes = this.hashes.filter(e => e.timestamp > Date.now() - config_settings.Peer.hashes.timeToLive)
        }
    }
    delete() {
        this.emit('delete')
        this.socket.destroy()
    }
    onData(chunk: Buffer) {
        if (this.socket.bytesRead - this.bytesRead > config_settings.Peer.socket.maxBytesRead1s) return this.emit('ban', 2)
        this.buffer = Buffer.concat([ this.buffer, chunk ])
        if (Buffer.byteLength(this.buffer) > config_settings.Peer.maxBytesInMemory) return this.emit('ban', 3)
        this.extract()
    }
    extract() {
        let index = protocol.getEndIndex(this.buffer)
        while (index !== -1 && this.socket.destroyed === false) {
            const a = index + Buffer.byteLength(protocol.end)
            const b = this.buffer.slice(0, a)
            this.buffer = this.buffer.slice(a)
            index = protocol.getEndIndex(this.buffer)
            const hash = crypto.createHash('sha256').update(b).digest()
            if (this.compareHash(hash)) continue
            const d = b.slice(0, a - Buffer.byteLength(protocol.end))
            if (Buffer.byteLength(d) === 0) continue
            const parsed = protocol.parse(d)
            if (parsed === null) continue
            const { type, data } = parsed
            if (this.requests[type]++ > config_settings.Peer.maxRequestsPerSecond[type]) continue
            this.addHash(hash)
            this.emit(type, data, b, res => {
                if (res === 1) this.emit('ban', 4)
                if (type === 'sync' && res !== null) this.write(protocol.constructBuffer('blocks', res), () => {})
            })
        }
    }
    write(buffer: Buffer, cb) {
        if (this.socket.bytesWritten + Buffer.byteLength(buffer) - this.bytesWritten > config_settings.Peer.socket.maxBytesWritten1s) return cb()
        this.socket.write(buffer, () => cb())
    }
    compareHash(hash: Buffer) {
        return this.hashes.find(e => e.hash.equals(hash)) !== undefined ? true : false
    }
    addHash(hash: Buffer) {
        this.hashes.push({ hash, timestamp: Date.now() })
        if (this.hashes.length > config_settings.Peer.hashes.length) this.hashes.shift()
    }
}
export default Peer