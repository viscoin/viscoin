import * as net from 'net'
import * as crypto from 'crypto'
import * as events from 'events'
import * as config from '../../config.json'
interface Node {
    dataHashes: Array<Buffer>
    sockets: Array<net.Socket>
}
class Node extends events.EventEmitter {
    constructor() {
        super()
        this.dataHashes = []
        this.sockets = []
        this.on('socket', (socket, connected) => {
            socket
                .on('data', data => this.emit('data', data))
                .on('error', err => {
                    this.emit('error', err)
                    socket.destroy()
                    this.sockets.splice(this.sockets.indexOf(socket), 1)
                })
                .on('close', err => {
                    socket.destroy()
                    this.sockets.splice(this.sockets.indexOf(socket), 1)
                })
            if (!connected) {
                socket.on('connect', () => {
                    if (this.hasSocket(socket)) socket.destroy()
                    else this.sockets.push(socket)
                })
            }
            else this.sockets.push(socket)
        })
    }
    verifyData(data: Buffer) {
        if (Buffer.byteLength(data) > config.byteLength.verifyData) return false
        const hash = crypto.createHash('sha256').update(data).digest()
        if (this.dataHashes.find(e => e.compare(hash) === 0)) return false
        if (this.processData(data) === null) return false
        this.dataHashes.push(hash)
        if (this.dataHashes.length > config.length.dataHashes) this.dataHashes.shift()
        return true
    }
    broadcast(data: Buffer) {
        for (const socket of this.sockets) {
            socket.write(data)
        }
    }
    broadcastAndStoreDataHash(data: Buffer) {
        if (!this.verifyData(data)) return
        this.broadcast(data)
    }
    static types = [
        'null',
        'block',
        'transaction'
    ]
    static getType(type: string | number): string | number {
        if (typeof type === 'string') {
            return Node.types.indexOf(type)
        }
        else {
            return Node.types[type]
        }
    }
    processData(data: Buffer) {
        try {
            return {
                type: <string> Node.getType(data[0]),
                data: JSON.parse(String(data.slice(1)))
            }
        } catch (err) {
            return null
        }
    }
    hasSocket(socket) {
        const info = <net.AddressInfo> socket.address()
        for (const _socket of this.sockets) {
            const _info = <net.AddressInfo> _socket.address()
            if (info.port === _info.port
                && info.address === _info.address) return true
        }
        return false
    }
}
export default Node