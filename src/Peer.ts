import * as config_settings from '../config/settings.json'
import * as net from 'net'
import * as events from 'events'
import * as crypto from 'crypto'
import protocol from './protocol'
import Block from './Block'
import * as secp256k1 from 'secp256k1'
import addressFromPublicKey from './addressFromPublicKey'
import Address from './Address'
import isValidOnion from './isValidOnion'
import log from './log'
interface Peer extends events.EventEmitter {
    socket: net.Socket
    remotePort: number
    remoteAddress: string
    localPort: number
    localAddress: string
    bytesRead: number
    bytesWritten: number
    buffer: Buffer
    requests: {
        block: number
        blocks: number
        transaction: number
        sync: number
        node: number
    }
    hashes: Array<{ hash: Buffer, timestamp: number }>
    index: number
    height: number
    synced: boolean
    latestBlock: Block
    address: string
    timestamp: number
    onion: string
}
class Peer extends events.EventEmitter {
    constructor(socket: net.Socket, { address, privateKey }: { address: Buffer, privateKey: Buffer }, onion: string) {
        super()
        this.socket = socket
        this.address = ''
        this.timestamp = 0
        this.onion = ''
        this.bytesRead = this.bytesRead
        this.bytesWritten = this.bytesWritten
        this.buffer = Buffer.alloc(0)
        this.requests = {
            block: 0,
            blocks: 0,
            transaction: 0,
            sync: 0,
            node: 0
        }
        this.hashes = []
        setInterval(this.interval['1s'].bind(this), 1000)
        setInterval(this.interval.hashes.bind(this), config_settings.Peer.hashes.interval)
        this.socket.setTimeout(config_settings.Peer.socket.setTimeout)
        if (this.socket.connecting === false) setImmediate(() => this.emit('meta-send'))
        this.socket
            .on('connect', () => this.emit('meta-send'))
            .on('error', () => {})
            .on('close', () => this.delete(1))
            .on('timeout', () => this.emit('ban', 0x800000000000000))
            .on('data', chunk => this.onData(chunk))
        this
            .once('meta-send', () => {
                const timestamp = Date.now()
                const hash = crypto.createHash('sha256').update(timestamp.toString()).digest()
                const signature = secp256k1.ecdsaSign(hash, privateKey)
                this.socket.write(protocol.constructBuffer('meta', {
                    address,
                    timestamp,
                    hash,
                    signature: {
                        signature: Buffer.from(signature.signature),
                        recid: signature.recid
                    },
                    onion
                }))
                this.remotePort = socket.remotePort
                this.remoteAddress = socket.remoteAddress
                this.localPort = socket.localPort
                this.localAddress = socket.localAddress
            })
            .on('ban', () => this.delete(2))
    }
    interval = {
        '1s': () => {
            this.bytesRead = this.socket.bytesRead
            this.bytesWritten = this.socket.bytesWritten
            this.requests = {
                block: 0,
                blocks: 0,
                transaction: 0,
                sync: 0,
                node: 0
            }
        },
        hashes: () => {
            this.hashes = this.hashes.filter(e => e.timestamp > Date.now() - config_settings.Peer.hashes.timeToLive)
        }
    }
    delete(code) {
        this.emit('delete', code)
        this.socket.destroy()
    }
    onData(chunk: Buffer) {
        if (this.socket.bytesRead - this.bytesRead > config_settings.Peer.socket.maxBytesRead1s) return this.emit('ban', 0x1000000000000000)
        this.buffer = Buffer.concat([ this.buffer, chunk ])
        if (Buffer.byteLength(this.buffer) > config_settings.Peer.maxBytesInMemory) return this.emit('ban', 0x2000000000000000)
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
            if (type === 'meta') {
                if (this.address !== '') return this.emit('ban', 0x4000000000000000)
                const code = this.meta(data)
                if (code) return this.emit('ban', 0x8000000000000000)
                this.emit('meta-received')
            }
            else if (this.address === '') return this.emit('ban', 0x10000000000000000)
            if (this.requests[type]++ > config_settings.Peer.maxRequestsPerSecond[type]) continue
            this.addHash(hash)
            this.emit(type, data, b, res => {
                // if (res === 1) this.emit('ban', 4)
                // need to add new checks
                if (type === 'sync' && res !== null) this.write(protocol.constructBuffer('blocks', res), () => {})
            })
        }
    }
    meta(data: { address: Buffer, timestamp: number, hash: Buffer, signature: { recid: number, signature: Uint8Array }, onion: string }) {
        try {
            if (!crypto.createHash('sha256').update(data.timestamp.toString()).digest().equals(data.hash)) return 0x80000000000n
            const publicKey = secp256k1.ecdsaRecover(data.signature.signature, data.signature.recid, data.hash, false)
            const address = addressFromPublicKey(Buffer.from(publicKey))
            if (!address.equals(data.address)) return 0x100000000000n
            if (data.onion && !isValidOnion(data.onion)) return 0x200000000000n
            this.address = Address.toString(data.address)
            this.timestamp = data.timestamp
            this.onion = data.onion
            return 0x0n
        }
        catch {
            return 0x400000000000n
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