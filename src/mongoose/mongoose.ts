import * as mongoose from 'mongoose'

export = client

const client = {
    init: () => {
        const dbOptions = {
            useNewUrlParser: true,
            autoIndex: false,
            reconnectTries: Number.MAX_VALUE,
            poolSize: 5,
            connectTimeoutMS: 10000,
            family: 4
        }
        
        mongoose.connect("mongodb://localhost:27017/js-coin", dbOptions)
        mongoose.set("useFindAndModify", false)
        mongoose.Promise = global.Promise

        mongoose.connection.on("connected", () => {
            console.log("Mongoose connection successfully opened!")
        })

        mongoose.connection.on("err", err => {
            console.error(`Mongoose connection error:\n${err.stack}`)
        })

        mongoose.connection.on("disconnected", () => {
            console.log("Mongoose connection disconnected")
        })
    }
}