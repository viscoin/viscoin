import * as net from 'net'
import * as events from 'events'
import * as config from '../config.json'
import protocol from './protocol'
interface Socket extends net.Socket {
    data: Buffer
}
interface TCPApi {
    server: net.Server
}
class TCPApi extends events.EventEmitter {
    constructor() {
        super()
        this.server = new net.Server()
        this.server.maxConnections = config.TCPApi.maxConnections
        this.server.on('connection', (socket: Socket) => {
            socket.data = Buffer.alloc(0)
            socket.on('data', chunk => {
                socket.data = Buffer.concat([socket.data, chunk])
                let index = null
                while (index !== -1 && !socket.destroyed) {
                    index = protocol.getEndIndex(socket.data)
                    if (index !== -1) {
                        const data = socket.data.slice(0, index)
                        this.onData(data, socket)
                        socket.data = socket.data.slice(index + 32)
                    }
                }
            })
        })
    }
    start() {
        this.server.listen(config.TCPApi.port, config.TCPApi.host)
    }
    stop() {
        this.server.close()
    }
    async onData(buf: Buffer, socket: Socket) {
        const args = buf.toString('binary').split(' ')
        console.log(args)
        this.emit(args.shift(), socket, ...args)
    }
}
export default TCPApi