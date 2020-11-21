import * as mongoose from './src/mongoose/mongoose'
import BaseClient from './src/BaseClient'
mongoose.init()
const client = new BaseClient()
client.on('block', block => {
    console.log('block')
})
client.on('transaction', transaction => {
    console.log('transaction')
})
client.on('node', node => {
    console.log('node', node)
})
client.on('listening', () => {
    console.log('listening')
})
client.on('connect', socket => {
    console.log('connect')
})
client.on('connection', socket => {
    console.log('connection')
})
client.on('socket', socket => {
    console.log(`socket ${socket.address().address}:${socket.address().port} <---> ${socket.remoteAddress}:${socket.remotePort}`)
})
client.on('blacklist', (socket, reason) => {
    console.log(`Banned socket: ${socket.remoteAddress}:${socket.remotePort} Reason: ${reason}`)
})