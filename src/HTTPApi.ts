import * as net from 'net'
import * as events from 'events'
import * as config from '../config.json'
import * as http from 'http'
import * as express from 'express'
import Transaction from './Transaction'
import base58 from './base58'
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
            this.emit('config', res)
        })
        app.get('/block/:height', (req, res) => {
            const height = parseInt(req.params.height)
            if (isNaN(height)) return
            this.emit('block', res, height)
        })
        app.get('/block', (req, res) => {
            this.emit('latest-block', res)
        })
        app.get('/transactions/pending', (req, res) => {
            this.emit('pending-transactions', res)
        })
        app.get('/transactions/:address', (req, res) => {
            try {
                const address = base58.decode(req.params.address)
                this.emit('address-transactions', res, address)
            }
            catch {}
        })
        app.get('/balance/:address', (req, res) => {
            try {
                const address = base58.decode(req.params.address)
                this.emit('address-balance', res, address)
            }
            catch {}
        })
        app.post('/send', (req, res) => {
            try {
                const transaction = new Transaction(Transaction.beautify(req.body))
                this.emit('send', res, transaction)
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
                res.on('error', () => {
                    reject()
                })
            })
            req.on('error', () => {
                reject()
            })
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
                res.on('error', () => {
                    reject()
                })
            })
            req.on('error', () => {
                reject()
            })
            req.write(data)
            req.end()
        })
    }
    static async balanceAddress(address: string) {
        return await this.get(`/balance/${address}`)
    }
    static async transactionsAddress(address: string) {
        return await this.get(`/transactions/${address}`)
    }
    static async send(transaction: Transaction) {
        return await this.post('/send', JSON.stringify(Transaction.minify(transaction)))
    }
    static async index() {
        return await this.get('/')
    }
    static async getBlockByHeight(height: number) {
        return await this.get(`/block/${height}`)
    }
    static async getLatestBlock() {
        return await this.get('/block')
    }
    static async getPendingTransactions() {
        return await this.get('/transactions/pending')
    }
}
export default HTTPApi