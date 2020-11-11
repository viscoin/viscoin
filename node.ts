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