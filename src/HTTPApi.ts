import * as net from 'net'
import * as events from 'events'
import * as configNetwork from '../config/network.json'
import * as http from 'http'
import * as express from 'express'
import Transaction from './Transaction'
import base58 from './base58'
import Block from './Block'
interface HTTPApi {
    server: net.Server
}
class HTTPApi extends events.EventEmitter {
    constructor() {
        super()
        const app = express()
        app.use(express.json({ limit: '2mb' }))
        app.get('/config', (req, res) => this.emit('get-config', config => HTTPApi.resEndJSON(res, config)))
        app.get('/block', (req, res) => this.emit('get-block-latest', block => HTTPApi.resEndJSON(res, block)))
        app.get('/transactions/pending', (req, res) => this.emit('get-transactions-pending', transactions => HTTPApi.resEndJSON(res, transactions)))
        app.get('/block/:h', (req, res) => {
            if (req.params.h === parseInt(req.params.h).toString()) {
                const height = parseInt(req.params.h)
                if (isNaN(height)) return res.status(400).end()
                this.emit('get-block-height', height, block => HTTPApi.resEndJSON(res, block))
            }
            else {
                try {
                    const hash = Buffer.from(req.params.h, 'hex')
                    if (Buffer.byteLength(hash) !== 32) return res.status(400).end()
                    this.emit('get-block-hash', hash, block => HTTPApi.resEndJSON(res, block))
                }
                catch {
                    res.status(400).end()
                }
            }
        })
        app.get('/block/new/:address', (req, res) => {
            try {
                const address = base58.decode(req.params.address)
                this.emit('get-block-new', address, block => HTTPApi.resEndJSON(res, block))
            }
            catch {
                res.status(400).end()
            }
        })
        app.get('/transactions/:address', (req, res) => {
            try {
                const address = base58.decode(req.params.address)
                this.emit('get-transactions-address', address, transactions => HTTPApi.resEndJSON(res, transactions))
            }
            catch {
                res.status(400).end()
            }
        })
        app.get('/balance/:address', (req, res) => {
            try {
                const address = base58.decode(req.params.address)
                this.emit('get-balance-address', address, balance => HTTPApi.resEndJSON(res, balance))
            }
            catch {
                res.status(400).end()
            }
        })
        app.post('/transaction', (req, res) => {
            try {
                const transaction = new Transaction(Transaction.beautify(req.body))
                this.emit('transaction', transaction, code => HTTPApi.resEndJSON(res, code))
            }
            catch {
                res.status(400).end()
            }
        })
        app.post('/block', (req, res) => {
            try {
                const block = new Block(Block.beautify(req.body))
                this.emit('block', block, code => HTTPApi.resEndJSON(res, code))
            }
            catch {
                res.status(400).end()
            }
        })
        this.server = http.createServer(app)
        this.server
            .on('listening', () => this.emit('listening'))
            .on('error', e => this.emit('error', e))
            .on('close', () => {})
    }
    static resEndJSON(res, data) {
        res.end(JSON.stringify(data, null, 4))
    }
    start() {
        this.server.listen(configNetwork.HTTPApi.port, configNetwork.HTTPApi.address)
    }
    stop() {
        this.server.close()
    }
    static get(path: string) {
        return <any> new Promise((resolve, reject) => {
            const req = http.request({
                host: configNetwork.HTTPApi.address,
                port: configNetwork.HTTPApi.port,
                method: 'GET',
                path
            }, res => {
                let str: string = ''
                res.on('data', chunk => {
                    str += chunk
                })
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(str))
                    }
                    catch {
                        reject()
                    }
                })
                res.on('error', () => reject())
            })
            req.on('error', () => reject())
            req.end()
        })
    }
    static post(path: string, data: string) {
        return <any> new Promise((resolve, reject) => {
            const req = http.request({
                host: configNetwork.HTTPApi.address,
                port: configNetwork.HTTPApi.port,
                method: 'POST',
                path,
                headers: {
                    'Content-Type': 'application/json',
                    'Content-Length': Buffer.byteLength(data)
                }
            }, res => {
                let str: string = ''
                res.on('data', chunk => {
                    str += chunk
                })
                res.on('end', () => {
                    try {
                        resolve(JSON.parse(str))
                    }
                    catch {
                        reject()
                    }
                })
                res.on('error', () => reject())
            })
            req.on('error', () => reject())
            req.write(data)
            req.end()
        })
    }
    static async getBalanceOfAddress(address: string) {
        return await this.get(`/balance/${address}`)
    }
    static async getTransactionsOfAddress(address: string) {
        const transactions = await this.get(`/transactions/${address}`)
        return transactions.map(e => new Transaction(Transaction.beautify(e)))
    }
    static async send(transaction: Transaction) {
        return await this.post('/transaction', JSON.stringify(Transaction.minify(transaction)))
    }
    static async index() {
        return await this.get('/')
    }
    static async getBlockByHeight(height: number) {
        const block = await this.get(`/block/${height}`)
        if (!block) return null
        return new Block(Block.beautify(block))
    }
    static async getBlockByHash(hash: Buffer) {
        const block = await this.get(`/block/${hash.toString('hex')}`)
        if (!block) return null
        return new Block(Block.beautify(block))
    }
    static async getLatestBlock() {
        const block = await this.get('/block')
        if (!block) return null
        return new Block(Block.beautify(block))
    }
    static async getPendingTransactions() {
        const transactions = await this.get('/transactions/pending')
        return transactions.map(e => new Transaction(Transaction.beautify(e)))
    }
    static async getNewBlock(address: Buffer) {
        const block = await this.get(`/block/new/${base58.encode(address)}`)
        if (!block) return null
        return new Block(Block.beautify(block))
    }
    static async postBlock(block: Block) {
        return await this.post('/block', JSON.stringify(Block.minify(block)))
    }
}
export default HTTPApi