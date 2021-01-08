import mongoose from './src/mongoose/mongoose'
import BaseClient from './src/BaseClient'
import * as config from './config.json'
import * as chalk from 'chalk'
import base58 from './src/base58'

mongoose.init()
const client = new BaseClient()
console.log(chalk.cyanBright('Starting node...'))
client.node.on('listening', () => console.log(`${chalk.cyanBright('Node (TCP) listening on')} ${chalk.blueBright(`${config.TCPNetworkNode.server.address}:${config.TCPNetworkNode.server.port}`)}`))
client.tcpServer.on('listening', () => console.log(`${chalk.cyanBright('API (HTTP) listening on')} ${chalk.blueBright(`${config.HTTPApi.host}:${config.HTTPApi.port}`)}`))
client.httpApi.on('listening', () => console.log(`${chalk.cyanBright('API (TCP) listening on')} ${chalk.blueBright(`${config.TCPApi.host}:${config.TCPApi.port}`)}`))
client.on('socket', socket => console.log(`New TCP connection ${socket.address().address}:${socket.address().port} - ${socket.remoteAddress}:${socket.remotePort}`))
client.on('blacklist', (socket, reason) => console.log(`Banned ${socket.remoteAddress}:${socket.remotePort} ${reason}`))
client.on('transaction', (transaction, code) => {
    if (code === 0) console.log(`${chalk.green('new')} ${chalk.yellow('Transaction')} { from: ${chalk.yellowBright(base58.encode(transaction.from))} }`)
})
client.on('block', (block, code) => {
    if (code === 0) console.log(`${chalk.green('new')} ${chalk.yellow('Block')} { height: ${chalk.yellowBright(block.height)} }`)
})
client.on('node', node => console.log(`Received new node ${node.address}:${node.port}`))