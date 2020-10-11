import * as net from 'net'
import * as config from '../../config.json'
interface Node {
    cache: Array<String>
}
class Node {
    constructor() {
        this.cache = []
    }
    onData(socket: net.Socket, data: Buffer) {
        const str = data.toString()
        if (this.cache.find(e => e === str)) return
        this.cache.push(str)
        if (JSON.stringify(this.cache).length > config.NodeCacheLimit) this.cache.shift()
        socket.write(data)
        console.log(data)
    }
}
export default Node