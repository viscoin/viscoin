import * as net from 'net'
import * as events from 'events'
import * as config from '../config.json'
import * as http from 'http'
import * as express from 'express'
interface HTTPApi {
    server: net.Server
}
class HTTPApi extends events.EventEmitter {
    constructor() {
        super()
        const app = express()
        app.use(express.urlencoded({ extended: true }))
        app.use(express.json())
        app.use('/config', (req, res) => {
            this.emit('config', res)
        })
        app.use('/block/latest', (req, res) => {
            this.emit('latest-block', res)
        })
        app.use('/block/:height', (req, res) => {
            this.emit('block', res, req.params.height)
        })
        app.use('/block', (req, res) => {
            this.emit('latest-block', res)
        })
        app.use('/transactions/pending', (req, res) => {
            this.emit('pending-transactions', res)
        })
        this.server = http.createServer(app)
    }
    start() {
        this.server.listen(config.api.http.port, config.api.http.host)
    }
    stop() {
        this.server.close()
    }
}
export default HTTPApi