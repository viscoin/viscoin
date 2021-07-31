import * as mongoose from 'mongoose'
import log from '../log'
import * as config_default_env from '../../config/default_env.json'
export default () => {
    const dbOptions = {
        useNewUrlParser: true,
        autoIndex: false,
        poolSize: 5,
        connectTimeoutMS: 10000,
        useUnifiedTopology: true
    }
    mongoose.set('useFindAndModify', false)
    mongoose.connection.on('connected', () => log.info('Mongoose connection successfully opened!'))
    mongoose.connection.on('err', err => log.error(`Mongoose`, err))
    mongoose.connection.on('disconnected', () => log.warn('Mongoose connection disconnected'))
    const CONNECTION_STRING = process.env.CONNECTION_STRING || config_default_env.CONNECTION_STRING
    if (process.env.CONNECTION_STRING) log.info('Using CONNECTION_STRING:', CONNECTION_STRING)
    else log.warn('Unset environment value! Using default value for CONNECTION_STRING:', CONNECTION_STRING)
    mongoose.connect(CONNECTION_STRING, dbOptions)
}