import * as net from 'net'
import * as crypto from 'crypto'
import * as config from '../../config.json'
interface Node {
    dataHashes: Array<String>
}
class Node {
    constructor() {
        this.dataHashes = []
    }
    onData(socket: net.Socket, data: Buffer) {
        const hash = crypto.createHash('sha256').update(data).digest('base64')
        if (this.dataHashes.find(e => e === hash)) return
        this.dataHashes.push(hash)
        if (this.dataHashes.length > config.dataHashesLength) this.dataHashes.shift()
        socket.write(data)
        console.log(data)
    }
}
export default Node