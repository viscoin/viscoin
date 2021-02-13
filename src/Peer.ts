import * as configSettings from '../config/settings.json'
import * as net from 'net'
import * as events from 'events'
import * as crypto from 'crypto'
import protocol from './protocol'
interface Peer extends events.EventEmitter {
    socket: net.Socket
    bytesRead: number
    bytesWritten: number
    buffer: Buffer
    requests: number
    hashes: Array<{ hash: Buffer, timestamp: number }>
    index: number
    height: number
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
        if (this.socket.connecting === false) setImmediate(() => this.add())
        this.socket
            .on('connect', () => this.add())
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
    async add() {
        if (configSettings.Peer.sync.enabled === true
        && await <Promise<boolean>> new Promise(resolve => this.emit('add', added => resolve(added)))) this.sync()
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
            if (++this.requests > configSettings.Peer.maxRequests1s
            && configSettings.Peer.maxRequests1s !== 0) {
                if (configSettings.Peer.banRequestsAbuse === true) return this.emit('ban')
                this.buffer = Buffer.alloc(0)
            }
            else {
                const a = index + Buffer.byteLength(protocol.end)
                const b = this.buffer.slice(0, a) 
                this.buffer = this.buffer.slice(a)
                const c = b.slice(0, 32)
                const d = b.slice(32, a - Buffer.byteLength(protocol.end))
                if (Buffer.byteLength(c) > 0
                && Buffer.byteLength(d) > 0) {
                    const hash = crypto.createHash('sha256').update(b).digest()
                    if (this.compareHash(hash) === true) continue
                    this.addHash(hash)
                    if (crypto.createHash('sha256').update(d).digest().equals(c) === false) continue
                    const parsed = protocol.parse(d)
                    if (parsed === null) continue
                    const { type, data } = parsed
                    if (type === 'post-block' && this.index === data?.height) this.index++
                    this.emit(type, data, b)
                }
            }
            index = protocol.getEndIndex(this.buffer)
        }
    }
    write(buffer: Buffer, cb) {
        if (this.socket.bytesWritten + Buffer.byteLength(buffer) - this.bytesWritten > configSettings.Peer.socket.maxBytesWritten1s) {
            if (cb !== undefined) cb()
            return
        }
        this.socket.write(buffer, () => {
            if (cb !== undefined) cb()
        })
    }
    compareHash(hash: Buffer) {
        return this.hashes.find(e => e.hash.equals(hash)) !== undefined ? true : false
    }
    addHash(hash: Buffer) {
        this.hashes.push({ hash, timestamp: Date.now() })
        if (this.hashes.length > configSettings.Peer.hashes.length) this.hashes.shift()
    }
    async sync() {
        this.emit('get-height', (height: number) => this.height = height)
        if (this.height !== undefined) {
            if (this.index === undefined
            || this.index > this.height) this.index = this.height - configSettings.trustedAfterBlocks
            const buffer = protocol.constructBuffer('get-block', this.index)
            const hash = crypto.createHash('sha256').update(buffer).digest()
            this.addHash(hash)
            await <Promise<void>> new Promise(resolve => this.write(buffer, () => resolve()))
        }
        this.syncTimeout = setTimeout(this.sync.bind(this), configSettings.Peer.sync.timeout)
    }
}
export default Peer