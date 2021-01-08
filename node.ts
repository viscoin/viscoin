import mongoose from './src/mongoose/mongoose'
import BaseClient from './src/BaseClient'
import * as config from './config.json'
import * as chalk from 'chalk'

console.log('Starting node')
if (config.HTTPApi.enabled) console.log(`API (HTTP): ${config.HTTPApi.host}:${config.HTTPApi.port}`)
if (config.TCPApi.enabled) console.log(`API (TCP): ${config.TCPApi.host}:${config.TCPApi.port}`)
mongoose.init()
const client = new BaseClient()
client.on('listening', () => console.log('Server listening'))
client.on('socket', socket => console.log(`New TCP connection ${socket.address().address}:${socket.address().port} - ${socket.remoteAddress}:${socket.remotePort}`))
client.on('blacklist', (socket, reason) => console.log(`Banned ${socket.remoteAddress}:${socket.remotePort} ${reason}`))
// client.on('transaction', (transaction, code) => console.log(`Received new transaction ${chalk.yellowBright(code)}`))
// client.on('block', (block, code) => console.log(`Received new block ${chalk.yellowBright(code)}`))
client.on('node', node => console.log(`Received new node ${node.address}:${node.port}`))