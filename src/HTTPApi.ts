import * as net from 'net'
import * as events from 'events'
import * as configNetwork from '../config/network.json'
import * as configSettings from '../config/settings.json'
import * as http from 'http'
import * as express from 'express'
import Transaction from './Transaction'
import base58 from './base58'
import Block from './Block'
import * as rateLimit from 'express-rate-limit'
interface HTTPApi {
    server: net.Server
}
interface Address {
    host: string,
    port: number
}
class HTTPApi extends events.EventEmitter {
    constructor() {
        super()
        const app = express()
        app.use(express.json({ limit: '2mb' }))
        app.use(rateLimit(configSettings.HTTPApi.rateLimit))
        if (configSettings.HTTPApi.get['/config'] === true) app.get('/config', (req, res) => this.emit('get-config', config => HTTPApi.resEndJSON(res, config)))
        if (configSettings.HTTPApi.get['/block'] === true) app.get('/block', (req, res) => this.emit('get-block-latest', block => HTTPApi.resEndJSON(res, block)))
        if (configSettings.HTTPApi.get['/transactions/pending'] === true) app.get('/transactions/pending', (req, res) => this.emit('get-transactions-pending', transactions => HTTPApi.resEndJSON(res, transactions)))
        if (configSettings.HTTPApi.get['/block/:h'] === true) app.get('/block/:h', (req, res) => {
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
        if (configSettings.HTTPApi.get['/block/new/:address'] === true) app.get('/block/new/:address', (req, res) => {
            try {
                const address = base58.decode(req.params.address)
                this.emit('get-block-new', address, block => HTTPApi.resEndJSON(res, block))
            }
            catch {
                res.status(400).end()
            }
        })
        if (configSettings.HTTPApi.get['/transactions/:address'] === true) app.get('/transactions/:address', (req, res) => {
            try {
                const address = base58.decode(req.params.address)
                this.emit('get-transactions-address', address, transactions => HTTPApi.resEndJSON(res, transactions))
            }
            catch {
                res.status(400).end()
            }
        })
        if (configSettings.HTTPApi.get['/balance/:address'] === true) app.get('/balance/:address', (req, res) => {
            try {
                const address = base58.decode(req.params.address)
                this.emit('get-balance-address', address, balance => HTTPApi.resEndJSON(res, balance))
            }
            catch {
                res.status(400).end()
            }
        })
        if (configSettings.HTTPApi.get['/block/transaction/:signature'] === true) app.get('/block/transaction/:signature', (req, res) => {
            try {
                const signature = base58.decode(req.params.signature)
                this.emit('get-block-transaction-signature', signature, block => HTTPApi.resEndJSON(res, block))
            }
            catch {
                res.status(400).end()
            }
        })
        if (configSettings.HTTPApi.get['/peers'] === true) app.get('/peers', (req, res) => this.emit('get-peers', peers => HTTPApi.resEndJSON(res, peers)))
        if (configSettings.HTTPApi.post['/transaction'] === true) app.post('/transaction', (req, res) => {
            try {
                const transaction = new Transaction(Transaction.beautify(req.body))
                this.emit('transaction', transaction, code => HTTPApi.resEndJSON(res, code))
            }
            catch {
                res.status(400).end()
            }
        })
        if (configSettings.HTTPApi.post['/block'] === true) app.post('/block', (req, res) => {
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
        this.server.listen(configNetwork.Node.HTTPApi.port, configNetwork.Node.HTTPApi.host)
    }
    stop() {
        this.server.close()
    }
    static get({ host, port }: Address, path: string) {
        return <any> new Promise((resolve, reject) => {
            const req = http.request({
                host,
                port,
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
    static post({ host, port }: Address, path: string, data: string) {
        return <any> new Promise((resolve, reject) => {
            const req = http.request({
                host,
                port,
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
    static async getBalanceOfAddress(address: Address, _address: string) {
        try {
            return await this.get(address, `/balance/${_address}`)
        }
        catch {
            return null
        }
    }
    static async getTransactionsOfAddress(address: Address, _address: string) {
        try {
            const transactions = await this.get(address, `/transactions/${_address}`)
            return transactions.map(e => new Transaction(Transaction.beautify(e)))
        }
        catch {
            return null
        }
    }
    static async send(address: Address, transaction: Transaction) {
        try {
            return await this.post(address, '/transaction', JSON.stringify(Transaction.minify(transaction)))
        }
        catch {
            return null
        }
    }
    static async getBlockByHeight(address: Address, height: number) {
        try {
            const block = await this.get(address, `/block/${height}`)
            if (!block) return null
            return new Block(Block.beautify(block))
        }
        catch {
            return null
        }
    }
    static async getBlockByHash(address: Address, hash: Buffer) {
        try {
            const block = await this.get(address, `/block/${hash.toString('hex')}`)
            if (!block) return null
            return new Block(Block.beautify(block))
        }
        catch {
            return null
        }
    }
    static async getBlockByTransactionSignature(address: Address, signature: Buffer) {
        try {
            const block = await this.get(address, `/block/transaction/${base58.encode(signature)}`)
            if (!block) return null
            return new Block(Block.beautify(block))
        }
        catch {
            return null
        }
    }
    static async getLatestBlock(address: Address) {
        try {
            const block = await this.get(address, '/block')
            if (!block) return null
            return new Block(Block.beautify(block))
        }
        catch {
            return null
        }
    }
    static async getPendingTransactions(address: Address) {
        try {
            const transactions = await this.get(address, '/transactions/pending')
            return transactions.map(e => new Transaction(Transaction.beautify(e)))
        }
        catch {
            return null
        }
    }
    static async getNewBlock(address: Address, _address: Buffer) {
        try {
            const block = await this.get(address, `/block/new/${base58.encode(_address)}`)
            if (!block) return null
            return new Block(Block.beautify(block))
        }
        catch {
            return null
        }
    }
    static async postBlock(address: Address, block: Block) {
        try {
            return await this.post(address, '/block', JSON.stringify(Block.minify(block)))
        }
        catch {
            return null
        }
    }
}
export default HTTPApi