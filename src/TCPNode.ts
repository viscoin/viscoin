import * as net from 'net'
import * as events from 'events'
import * as configSettings from '../config/settings.json'
import * as configNetwork from '../config/network.json'
import * as crypto from 'crypto'
import protocol from './protocol'
import Peer from './Peer'
import Model_Node from './mongoose/model/node'
import isValidHostname from './isValidHostname'

interface TCPNode {
    hashes: Array<{ hash: Buffer, timestamp: number }>
    peers: Set<Peer>
    server: net.Server
}
class TCPNode extends events.EventEmitter {
    constructor() {
        super()
        this.hashes = []
        this.peers = new Set()
        this.server = new net.Server()
        this.server.maxConnections = configSettings.TCPNode.maxConnectionsIn
        this.server
            .on('connection', socket => this.add(new Peer(socket), true))
            .on('listening', () => this.emit('listening'))
            .on('error', e => this.emit('error', e))
            .on('close', () => {})
    }
    add(peer: Peer, server: boolean) {
        peer
            .on('add', async () => {
                if ((await Model_Node.findOne({ host: peer.remoteAddress }).exec())?.banned > Date.now() - configSettings.Node.banTimeout) return peer.delete()
                if (this.hasSocketWithRemoteAddress(peer) || this.peers.size >= configSettings.TCPNode.maxConnectionsOut) return peer.delete()
                this.peers.add(peer)
                this.emit('peer-connect', peer, server)
                if (server === false) {
                    this.broadcast(protocol.constructBuffer('node', {
                        address: peer.remoteAddress,
                        port: peer.remotePort
                    }))
                }
                else {
                    this.broadcast(protocol.constructBuffer('node', {
                        address: peer.remoteAddress,
                        port: configNetwork.Node.TCPNode.port
                    }))
                }
            })
            .on('delete', () => {
                if (this.peers.delete(peer)) this.emit('peer-disconnect', peer, server)
            })
            .on('ban', async () => {
                this.emit('peer-ban', peer, server)
            })
        for (const type of protocol.types) {
            peer.on(type, (data, buffer, cb) => {
                this.emit(type, data, res => cb(res))
            })
        }
    }
    broadcast(buffer: Buffer, skipHash = false) {
        return <Promise<void>> new Promise(resolve => {
            const hash = skipHash === false ? crypto.createHash('sha256').update(buffer).digest() : null
            if (this.peers.size === 0) resolve()
            let i = 0
            const cb = () => {
                if (++i === this.peers.size) resolve()
            }
            for (const peer of this.peers) {
                if (skipHash === true) {
                    peer.write(buffer, () => cb())
                }
                else {
                    if (peer.compareHash(hash) === true) cb()
                    else {
                        peer.addHash(hash)
                        peer.write(buffer, () => cb())
                    }
                }
            }
        })
    }
    hasSocketWithRemoteAddress(peer: Peer) {
        for (const _peer of this.peers) {
            if (peer.remoteAddress === _peer.remoteAddress) return true
        }
        return false
    }
    static shuffle(arr: Array<any>) {
        let j, x
        for (let i = arr.length - 1; i > 0; i--) {
            j = Math.floor(Math.random() * (i + 1))
            x = arr[i]
            arr[i] = arr[j]
            arr[j] = x
        }
        return arr
    }
    connectToNetwork(hosts: Array<string>) {
        hosts = TCPNode.shuffle(hosts)
        for (const host of hosts) {
            if (isValidHostname(host) !== 0) continue
            if (configSettings.TCPNode.allowConnectionsToSelf !== true
            && host === configNetwork.Node.TCPNode.host) continue
            const socket = net.connect(configNetwork.Node.TCPNode.port, host)
            this.add(new Peer(socket), false)
        }
    }
    connectToNode(host: string) {
        if (isValidHostname(host) !== 0) return 2
        if (configSettings.TCPNode.allowConnectionsToSelf !== true
        && host === configNetwork.Node.TCPNode.host) return 3
        const socket = net.connect(configNetwork.Node.TCPNode.port, host)
        this.add(new Peer(socket), false)
        return 0
    }
    disconnectFromNetwork() {
        for (const peer of this.peers) {
            peer.delete()
        }
    }
    start() {
        this.server.listen(configNetwork.Node.TCPNode.port, configNetwork.Node.TCPNode.host)
    }
    stop() {
        this.server.close()
    }
}
export default TCPNode