import * as configSettings from '../config/settings.json'
import * as net from 'net'
import * as events from 'events'
import * as crypto from 'crypto'
import protocol from './protocol'
import Block from './Block'
interface Peer extends events.EventEmitter {
    socket: net.Socket
    bytesRead: number
    bytesWritten: number
    buffer: Buffer
    requests: number
    hashes: Array<{ hash: Buffer, timestamp: number }>
    index: number
    height: number
    synced: boolean
    latestBlock: Block
    syncTimeout: NodeJS.Timeout
}
class Peer extends events.EventEmitter {
    constructor(socket: net.Socket) {
        super()
        this.socket = socket
        this.bytesRead = this.bytesRead
        this.bytesWritten = this.bytesWritten
        this.buffer = Buffer.alloc(0)
        this.requests = 0
        this.hashes = []
        setInterval(this.interval['1s'].bind(this), 1000)
        setInterval(this.interval.hashes.bind(this), configSettings.Peer.hashes.interval)
        this.socket.setTimeout(configSettings.Peer.socket.setTimeout)
        if (this.socket.connecting === false) setImmediate(() => this.emit('add'))
        this.socket
            .on('connect', () => this.emit('add'))
            .on('error', () => {})
            .on('close', () => this.del())
            .on('timeout', () => this.emit('ban'))
            .on('data', chunk => this.onData(chunk))
            .on('ban', () => this.del())
    }
    interval = {
        '1s': () => {
            this.bytesRead = this.socket.bytesRead
            this.bytesWritten = this.socket.bytesWritten
            this.requests = 0
        },
        hashes: () => {
            this.hashes = this.hashes.filter(e => e.timestamp > Date.now() - configSettings.Peer.hashes.timeToLive)
        }
    }
    del() {
        this.emit('del')
        this.socket.destroy()
        this.socket.removeAllListeners()
        this.removeAllListeners()
        clearTimeout(this.syncTimeout)
    }
    onData(chunk: Buffer) {
        if (this.socket.bytesRead - this.bytesRead > configSettings.Peer.socket.maxBytesRead1s) return this.emit('ban')
        this.buffer = Buffer.concat([ this.buffer, chunk ])
        if (Buffer.byteLength(this.buffer) > configSettings.Peer.maxBytesInMemory) return this.emit('ban')
        this.extract()
    }
    extract() {
        let index = protocol.getEndIndex(this.buffer)
        while (index !== -1 && this.socket.destroyed === false) {
            const a = index + Buffer.byteLength(protocol.end)
            const b = this.buffer.slice(0, a)
            this.buffer = this.buffer.slice(a)
            const hash = crypto.createHash('sha256').update(b).digest()
            if (this.compareHash(hash) === false) {
                this.addHash(hash)
                const d = b.slice(0, a - Buffer.byteLength(protocol.end))
                if (Buffer.byteLength(d) > 0) {
                    const parsed = protocol.parse(d)
                    if (parsed !== null) {
                        const { type, data } = parsed
                        this.emit(type, data, b, code => {
                            if (code === 1) this.emit('ban')
                        })
                    }
                }
            }
            index = protocol.getEndIndex(this.buffer)
        }
    }
    write(buffer: Buffer, cb) {
        if (this.socket.bytesWritten + Buffer.byteLength(buffer) - this.bytesWritten > configSettings.Peer.socket.maxBytesWritten1s) return cb()
        this.socket.write(buffer, () => cb())
    }
    compareHash(hash: Buffer) {
        return this.hashes.find(e => e.hash.equals(hash)) !== undefined ? true : false
    }
    addHash(hash: Buffer) {
        this.hashes.push({ hash, timestamp: Date.now() })
        if (this.hashes.length > configSettings.Peer.hashes.length) this.hashes.shift()
    }
}
export default Peer