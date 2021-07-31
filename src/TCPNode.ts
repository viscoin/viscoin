import * as net from 'net'
import * as events from 'events'
import * as config_settings from '../config/settings.json'
import * as crypto from 'crypto'
import * as dns from 'dns'
import { hostname } from 'os'
import protocol from './protocol'
import Peer from './Peer'
import Model_Node from './mongoose/model/node'
import isValidHost from './isValidHost'
import log from './log'
import * as config_default_env from '../config/default_env.json'

interface TCPNode {
    host: string
    hashes: Array<{ hash: Buffer, timestamp: number }>
    peers: Set<Peer>
    server: net.Server
    TCP_NODE: {
        host: string
        port: number
    }
}
class TCPNode extends events.EventEmitter {
    constructor() {
        super()
        const TCP_NODE = process.env.TCP_NODE || config_default_env.TCP_NODE
        this.TCP_NODE = {
            host: TCP_NODE.split(':').slice(0, -1).join(':'),
            port: parseInt(TCP_NODE.split(':').reverse()[0])
        }
        if (process.env.TCP_NODE) log.info('Using TCP_NODE:', this.TCP_NODE)
        else log.warn('Unset environment value! Using default value for TCP_NODE:', this.TCP_NODE)
        this.host = null
        dns.lookup(hostname(), (err, add) => {
            if (err) throw err
            this.host = add
        })
        this.hashes = []
        this.peers = new Set()
        this.server = new net.Server()
        this.server.maxConnections = config_settings.TCPNode.maxConnectionsIn
        this.server
            .on('connection', socket => this.add(new Peer(socket), true))
            .on('listening', () => log.info('TCP_NODE listening', this.server.address()))
            .on('error', e => log.error('TCP_NODE', e))
            .on('close', () => log.warn('TCP_NODE close'))
    }
    add(peer: Peer, server: boolean) {
        peer
            .on('add', async () => {
                if ((await Model_Node.findOne({ host: peer.remoteAddress }).exec())?.banned > Date.now() - config_settings.Node.banTimeout) return peer.delete()
                if (this.hasSocketWithRemoteAddress(peer) || this.peers.size >= config_settings.TCPNode.maxConnectionsOut) return peer.delete()
                this.peers.add(peer)
                // this.emit('peer-connect', peer, server)
                log.info('Peer connection', server ? 'incomming' : 'outgoing', `${peer.remoteAddress}:${peer.remotePort}`)
                if (server === false) {
                    this.broadcast(protocol.constructBuffer('node', {
                        address: peer.remoteAddress,
                        port: peer.remotePort
                    }))
                }
                else {
                    this.broadcast(protocol.constructBuffer('node', {
                        address: peer.remoteAddress,
                        port: 9333
                    }))
                }
            })
            .on('delete', () => {
                // if (this.peers.delete(peer)) this.emit('peer-disconnect', peer, server)
                if (this.peers.delete(peer)) log.info('Peer disconnected', server ? 'incomming' : 'outgoing', `${peer.remoteAddress}:${peer.remotePort}`)
            })
            .on('ban', async () => {
                // this.emit('peer-ban', peer, server)
                log.warn('Peer banned', server ? 'incomming' : 'outgoing', `${peer.remoteAddress}:${peer.remotePort}`)
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
            if (isValidHost(host) !== 0) continue
            if (config_settings.TCPNode.allowConnectionsToSelf !== true
            && host === this.host) continue
            const socket = net.connect(9333, host)
            this.add(new Peer(socket), false)
        }
    }
    connectToNode(host: string) {
        if (isValidHost(host) !== 0) return 2
        if (config_settings.TCPNode.allowConnectionsToSelf !== true
        && host === this.host) return 3
        const socket = net.connect(9333, host)
        this.add(new Peer(socket), false)
        return 0
    }
    disconnectFromNetwork() {
        for (const peer of this.peers) {
            peer.delete()
        }
    }
    start() {
        this.server.listen(this.TCP_NODE.port, this.TCP_NODE.host)
    }
    stop() {
        this.server.close()
    }
}
export default TCPNode