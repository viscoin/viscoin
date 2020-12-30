import mongoose from './src/mongoose/mongoose'
import BaseClient from './src/BaseClient'
mongoose.init()
const client = new BaseClient()
client.on('block', (block, code) => {
    console.log('block', code)
})
client.on('transaction', (transaction, code) => {
    console.log('transaction', code)
})
client.on('node', node => {
    console.log('node', node)
})
client.on('listening', () => {
    console.log('listening')
})
client.on('socket', socket => {
    console.log(`socket ${socket.address().address}:${socket.address().port} <---> ${socket.remoteAddress}:${socket.remotePort}`)
})
client.on('blacklist', (socket, reason) => {
    console.log(`Banned socket: ${socket.remoteAddress}:${socket.remotePort} Reason: ${reason}`)
})