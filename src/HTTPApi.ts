import * as net from 'net'
import * as events from 'events'
import * as config_settings from '../config/settings.json'
import * as http from 'http'
import * as express from 'express'
import Transaction from './Transaction'
import base58 from './base58'
import Block from './Block'
import * as rateLimit from 'express-rate-limit'
import log from './log'
import * as config_default_env from '../config/default_env.json'
import Address from './Address'

const beautify = (block) => {
    try {
        block = new Block(Block.beautify(block))
        for (const i in block) {
            if (block[i] instanceof Buffer) block[i] = block[i].toString('hex')
            if (i === 'transactions') block[i] = block[i].map(transaction => {
                for (const i in transaction) {
                    if ([ 'to', 'from' ].includes(i)) transaction[i] = Address.toString(transaction[i])
                    else if (transaction[i] instanceof Buffer) transaction[i] = transaction[i].toString('hex')
                }
                return transaction
            })
        }
        return block
    }
    catch {
        return null
    }
}

interface HTTPApi {
    server: net.Server
    HTTP_API: {
        host: string
        port: number
    }
    commit: string
}
interface IP_Address {
    host: string
    port: number
}
class HTTPApi extends events.EventEmitter {
    constructor(commit: string) {
        super()
        this.commit = commit
        const HTTP_API = process.env.HTTP_API || config_default_env.HTTP_API
        this.HTTP_API = {
            host: HTTP_API.split(':').slice(0, -1).join(':'),
            port: parseInt(HTTP_API.split(':').reverse()[0])
        }
        if (process.env.HTTP_API) log.info('Using HTTP_API:', this.HTTP_API)
        else log.warn('Unset environment value! Using default value for HTTP_API:', this.HTTP_API)
        const app = express()
        app.use(express.urlencoded({ extended: true }))
        app.use(express.json({ limit: '2mb' }))
        app.use(rateLimit(config_settings.HTTPApi.rateLimit))
        if (config_settings.HTTPApi.get['/addresses'] === true) app.get('/addresses', (req, res) => {
            this.emit('get-addresses', parseInt(req.query.start), parseInt(req.query.amount), addresses => {
                HTTPApi.resEndJSON(res, addresses)
            })
        })
        if (config_settings.HTTPApi.get['/commit'] === true) app.get('/commit', (req, res) => {
            HTTPApi.resEndJSON(res, this.commit)
        })
        if (config_settings.HTTPApi.get['/config'] === true) app.get('/config', (req, res) => this.emit('get-config', config => HTTPApi.resEndJSON(res, config)))
        if (config_settings.HTTPApi.get['/block'] === true) app.get('/block', (req, res) => {
            this.emit('get-block-latest', block => {
                if (req.query.b) block = beautify(block)
                HTTPApi.resEndJSON(res, block)
            })
        })
        if (config_settings.HTTPApi.get['/transactions/pending'] === true) app.get('/transactions/pending', (req, res) => this.emit('get-transactions-pending', transactions => HTTPApi.resEndJSON(res, transactions)))
        if (config_settings.HTTPApi.get['/block/:h'] === true) app.get('/block/:h', (req, res) => {
            if (req.params.h === parseInt(req.params.h).toString()) {
                const height = parseInt(req.params.h)
                if (isNaN(height)) return res.status(400).end()
                this.emit('get-block-height', height, block => {
                    if (req.query.b) block = beautify(block)
                    HTTPApi.resEndJSON(res, block)
                })
            }
            else {
                try {
                    const hash = Buffer.from(req.params.h, 'hex')
                    if (Buffer.byteLength(hash) !== 32) return res.status(400).end()
                    this.emit('get-block-hash', hash, block => {
                        if (req.query.b) block = beautify(block)
                        HTTPApi.resEndJSON(res, block)
                    })
                }
                catch {
                    res.status(400).end()
                }
            }
        })
        if (config_settings.HTTPApi.get['/balance/:address'] === true) app.get('/balance/:address', (req, res) => {
            try {
                const address = Address.toBuffer(req.params.address)
                this.emit('get-balance-address', address, balance => HTTPApi.resEndJSON(res, balance))
            }
            catch {
                res.status(400).end()
            }
        })
        if (config_settings.HTTPApi.get['/peers'] === true) app.get('/peers', (req, res) => this.emit('get-peers', peers => HTTPApi.resEndJSON(res, peers)))
        if (config_settings.HTTPApi.post['/transaction'] === true) app.post('/transaction', (req, res) => {
            try {
                const beautified = Transaction.beautify(req.body)
                if (beautified.timestamp) beautified.timestamp = parseInt(beautified.timestamp)
                if (beautified.recoveryParam) beautified.recoveryParam = parseInt(beautified.recoveryParam)
                const transaction = new Transaction(beautified)
                this.emit('transaction', transaction, code => HTTPApi.resEndJSON(res, '0x' + code.toString(16)))
            }
            catch {
                res.status(400).end()
            }
        })
        if (config_settings.HTTPApi.post['/block'] === true) app.post('/block', (req, res) => {
            try {
                const block = new Block(Block.beautify(req.body))
                this.emit('block', block, code => HTTPApi.resEndJSON(res, '0x' + code.toString(16)))
            }
            catch {
                res.status(400).end()
            }
        })
        this.server = http.createServer(app)
        this.server
            .on('listening', () => log.info('HTTP_API listening', this.server.address()))
            .on('error', e => log.error('HTTP_API', e))
            .on('close', () => log.warn('HTTP_API close'))
    }
    static resEndJSON(res, data) {
        res.end(JSON.stringify(data, null, 4))
    }
    start() {
        this.server.listen(this.HTTP_API.port, this.HTTP_API.host)
    }
    stop() {
        this.server.close()
    }
    static get({ host, port }: IP_Address, path: string) {
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
    static post({ host, port }: IP_Address, path: string, data: string) {
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
    static async getBalanceOfAddress(address: IP_Address, _address: string) {
        try {
            return await this.get(address, `/balance/${_address}`)
        }
        catch {
            return null
        }
    }
    static async send(address: IP_Address, transaction: Transaction) {
        try {
            return await this.post(address, '/transaction', JSON.stringify(Transaction.minify(transaction)))
        }
        catch {
            return null
        }
    }
    static async getBlockByHeight(address: IP_Address, height: number) {
        try {
            const block = await this.get(address, `/block/${height}`)
            if (!block) return null
            return new Block(Block.beautify(block))
        }
        catch {
            return null
        }
    }
    static async getBlockByHash(address: IP_Address, hash: Buffer) {
        try {
            const block = await this.get(address, `/block/${hash.toString('hex')}`)
            if (!block) return null
            return new Block(Block.beautify(block))
        }
        catch {
            return null
        }
    }
    static async getLatestBlock(address: IP_Address) {
        try {
            const block = await this.get(address, '/block')
            if (!block) return null
            return new Block(Block.beautify(block))
        }
        catch {
            return null
        }
    }
    static async getPendingTransactions(address: IP_Address) {
        try {
            const transactions = await this.get(address, '/transactions/pending')
            return transactions.map(e => new Transaction(Transaction.beautify(e)))
        }
        catch {
            return null
        }
    }
    static async getAddresses(address: IP_Address, start: number = 0, amount: number = 0) {
        try {
            return await this.get(address, `/addresses?start=${start}&amount=${amount}`)
        }
        catch {
            return null
        }
    }
    static async getNewBlock(address: IP_Address, _address: Buffer) {
        try {
            const block = await this.get(address, `/block/new/${Address.toString(_address)}`)
            if (!block) return null
            return new Block(Block.beautify(block))
        }
        catch {
            return null
        }
    }
    static async postBlock(address: IP_Address, block: Block) {
        try {
            return await this.post(address, '/block', JSON.stringify(Block.minify(block)))
        }
        catch {
            return null
        }
    }
}
export default HTTPApi