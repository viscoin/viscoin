import * as net from 'net'
import * as events from 'events'
import * as config from '../config.json'
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
        app.use(express.urlencoded({ extended: true }))
        app.use(express.json())
        app.get('/', (req, res) => {
            res.end(JSON.stringify({
                get: [
                    '/config',
                    '/block/latest',
                    '/block/:height',
                    '/block',
                    '/transactions/pending',
                    '/transactions/:address',
                    '/balance/:address'
                ],
                post: [
                    '/send'
                ]
            }, null, 4))
        })
        app.get('/config', (req, res) => {
            this.emit('get-config', res)
        })
        app.get('/block/:height', (req, res) => {
            const height = parseInt(req.params.height)
            if (isNaN(height)) return
            this.emit('get-block', res, height)
        })
        app.get('/block', (req, res) => {
            this.emit('get-block-latest', res)
        })
        app.get('/block/new/:address', (req, res) => {
            try {
                const address = base58.decode(req.params.address)
                this.emit('get-block-new', res, address)
            }
            catch {}
        })
        app.get('/transactions/pending', (req, res) => {
            this.emit('get-transactions-pending', res)
        })
        app.get('/transactions/:address', (req, res) => {
            try {
                const address = base58.decode(req.params.address)
                this.emit('get-transactions-address', res, address)
            }
            catch {}
        })
        app.get('/balance/:address', (req, res) => {
            try {
                const address = base58.decode(req.params.address)
                this.emit('get-balance-address', res, address)
            }
            catch {}
        })
        app.post('/transaction', (req, res) => {
            try {
                const transaction = new Transaction(Transaction.beautify(req.body))
                this.emit('post-transaction', res, transaction)
            }
            catch {}
        })
        app.post('/block', (req, res) => {
            try {
                const block = new Block(Block.beautify(req.body))
                this.emit('post-block', res, block)
            }
            catch {}
        })
        this.server = http.createServer(app)
    }
    start() {
        this.server.listen(config.HTTPApi.port, config.HTTPApi.host)
    }
    stop() {
        this.server.close()
    }
    static get(path: string) {
        return <any> new Promise((resolve, reject) => {
            const req = http.request({
                host: config.HTTPApi.host,
                port: config.HTTPApi.port,
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
                host: config.HTTPApi.host,
                port: config.HTTPApi.port,
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