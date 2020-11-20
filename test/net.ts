import * as mongoose from '../src/mongoose/mongoose'
import * as config from '../config.json'
import * as nodes from '../nodes.json'
import BaseClient from '../src/BaseClient'
mongoose.init()

for (let i = 0; i < 2; i++) {
    config.network.port++
    nodes.push({ address: '192.168.0.7', port: config.network.port })
    const client = new BaseClient()
    client.on('block', block => {
        console.log('block', block.height, block.hash.toString('utf-16le'))
    })
    client.on('socket', socket => {
        console.log(`socket ${socket.address().address}:${socket.address().port} <---> ${socket.remoteAddress}:${socket.remotePort}`)
    })
}