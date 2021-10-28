import * as net from 'net'
import * as events from 'events'
import * as config_settings from '../config/settings.json'
import * as crypto from 'crypto'
import * as dns from 'dns'
import { hostname } from 'os'
import protocol from './protocol'
import Peer from './Peer'
import log from './log'
import * as config_default_env from '../config/default_env.json'
import { SocksClient, SocksClientOptions, SocksProxy } from 'socks'
import isValidHost from './isValidHost'
import keygen from './keygen'
import publicKeyFromPrivateKey from './publicKeyFromPrivateKey'
import addressFromPublicKey from './addressFromPublicKey'
import Address from './Address'
import isValidOnion from './isValidOnion'
interface TCPNode {
    nodes: any
    host: string
    hashes: Array<{ hash: Buffer, timestamp: number }>
    peers: Set<Peer>
    server: net.Server
    TCP_NODE: {
        host: string
        port: number
    },
    USE_PROXY: boolean
    ONION_ADDRESS: string
    privateKey: Buffer
    address: Buffer
}
class TCPNode extends events.EventEmitter {
    constructor(nodes) {
        super()
        this.privateKey = keygen()
        this.address = addressFromPublicKey(publicKeyFromPrivateKey(this.privateKey))
        log.info('TCPNode Address:', Address.toString(this.address))
        this.nodes = nodes
        const TCP_NODE = process.env.TCP_NODE || config_default_env.TCP_NODE
        this.TCP_NODE = {
            host: TCP_NODE.split(':').slice(0, -1).join(':'),
            port: parseInt(TCP_NODE.split(':').reverse()[0])
        }
        if (process.env.TCP_NODE) log.info('Using TCP_NODE:', this.TCP_NODE)
        else log.warn('Unset environment value! Using default value for TCP_NODE:', this.TCP_NODE)
        this.USE_PROXY = Boolean(process.env.USE_PROXY || config_default_env.USE_PROXY)
        if (process.env.USE_PROXY) log.info('Using USE_PROXY:', this.USE_PROXY)
        else log.warn('Unset environment value! Using default value for USE_PROXY:', this.USE_PROXY)
        this.ONION_ADDRESS = process.env.ONION_ADDRESS || config_default_env.ONION_ADDRESS
        if (process.env.ONION_ADDRESS) log.info('Using ONION_ADDRESS:', this.ONION_ADDRESS)
        else log.warn('Unset environment value! Using default value for ONION_ADDRESS:', this.ONION_ADDRESS)
        this.host = null
        dns.lookup(hostname(), (err, host) => {
            if (err) throw err
            this.host = host
        })
        this.hashes = []
        this.peers = new Set()
        this.server = new net.Server()
        this.server.maxConnections = config_settings.TCPNode.maxConnectionsIn
        this.server
            .on('connection', socket => this.addPeer(new Peer(socket, { address: this.address, privateKey: this.privateKey }, this.ONION_ADDRESS), true))
            .on('listening', () => log.info('TCP_NODE listening', this.server.address()))
            .on('error', e => log.error('TCP_NODE', e))
            .on('close', () => log.warn('TCP_NODE close'))
    }
    addPeer(peer: Peer, server: boolean) {
        const broadcastNode = () => {
            this.broadcast(protocol.constructBuffer('node', peer.remoteAddress))
        }
        peer
            .once('meta-received', async () => {
                const _peer = this.getPeerByAddress(peer.address)
                if (_peer) {
                    if (_peer.timestamp < peer.timestamp) _peer.delete(3)
                    else {
                        peer.delete(4)
                        return
                    }
                }
                this.peers.add(peer)
                if (!peer.onion) return
                if (this.USE_PROXY && TCPNode.removeIPv6Prefix(peer.remoteAddress) === TCPNode.removeIPv6Prefix(config_settings.proxy.host)) peer.remoteAddress = peer.onion
                this.nodes.get(peer.onion, (err, bannedTimestamp) => {
                    if (bannedTimestamp > Date.now() - config_settings.Node.banTimeout) return peer.delete(5)
                })
                await this.nodes.put(peer.onion, '0')
                log.debug(2, 'Peer verified', `${peer.remoteAddress}:${peer.remotePort}`)
                broadcastNode()
            })
            .once('meta-send', async () => {
                this.nodes.get(peer.remoteAddress, (err, bannedTimestamp) => {
                    if (bannedTimestamp > Date.now() - config_settings.Node.banTimeout) return peer.delete(6)
                })
                if (!peer.remoteAddress || this.hasSocketWithRemoteAddress(peer.remoteAddress) || this.peers.size >= config_settings.TCPNode.maxConnectionsOut) return peer.delete(7)
                if (peer.remoteAddress) await this.nodes.put(peer.remoteAddress, '0')
                log.debug(1, 'Peer connection', server ? 'in' : 'out', `${peer.remoteAddress}:${peer.remotePort}`)
                broadcastNode()
            })
            .once('delete', code => {
                this.peers.delete(peer)
                log.debug(1, 'Peer disconnected', server ? 'in' : 'out', `${peer.remoteAddress}:${peer.remotePort}`)
                log.debug(4, 'Peer deleted', code)
            })
            .once('ban', async code => {
                if (peer.remoteAddress) {
                    await this.nodes.put(peer.remoteAddress, Date.now())
                    log.warn('Peer banned', server ? 'in' : 'out', `${peer.remoteAddress}:${peer.remotePort}`, 'code:', code)
                }
                else log.debug(2, 'Peer', server ? 'in' : 'out', 'connection failed')
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
    getPeerByAddress(address: string) {
        for (const _peer of this.peers) {
            if (_peer.address === '') continue
            if (_peer.address === address) return _peer
        }
    }
    hasSocketWithRemoteAddress(remoteAddress) {
        for (const _peer of this.peers) {
            if (TCPNode.removeIPv6Prefix(remoteAddress) === '127.0.0.1') continue // proxy
            if (TCPNode.removeIPv6Prefix(remoteAddress) === TCPNode.removeIPv6Prefix(_peer.remoteAddress)) return true
        }
        return false
    }
    static removeIPv6Prefix(ip: string) {
        if (ip.substr(0, 7) == "::ffff:") {
            ip = ip.substr(7)
        }
        return ip
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
            const code = this.connectToNode(host)
            log.debug(3, 'connectToNode', host, code)
        }
    }
    connectToNode(host: string) {
        if (!isValidHost(host)) return 0x800000000000n
        if (config_settings.TCPNode.allowConnectionsToSelf !== true
        && (host === this.host
            || host === this.ONION_ADDRESS
            || host === this.TCP_NODE.host)) return 0x1000000000000n
        if (this.hasSocketWithRemoteAddress(host)) return 0x2000000000000n
        if (this.USE_PROXY) {
            const options: SocksClientOptions = {
                proxy: <SocksProxy> config_settings.proxy,
                command: 'connect',
                destination: {
                    host,
                    port: 9333
                }
            }
            SocksClient.createConnection(options, (err, info) => {
                if (err) return log.debug(3, 'Proxy connection failed')
                const peer = new Peer(info.socket, { address: this.address, privateKey: this.privateKey }, this.ONION_ADDRESS)
                peer.once('meta-send', () => {
                    peer.remoteAddress = host
                    peer.remotePort = 9333
                    this.addPeer(peer, false)
                })
            })
        }
        else {
            if (isValidOnion(host)) return 0x4000000000000n
            const socket = net.connect(9333, host)
            this.addPeer(new Peer(socket, { address: this.address, privateKey: this.privateKey }, this.ONION_ADDRESS), false)
        }
        return 0x0n
    }
    disconnectFromNetwork() {
        for (const peer of this.peers) {
            peer.delete(8)
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