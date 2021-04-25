import * as mongoose from 'mongoose'
import * as configMongoose from '../../config/mongoose.json'
export default (log: boolean = true) => {
    const dbOptions = {
        useNewUrlParser: true,
        autoIndex: false,
        poolSize: 5,
        connectTimeoutMS: 10000,
        useUnifiedTopology: true
    }
    mongoose.set("useFindAndModify", false)
    mongoose.connection.on("connected", () => {
        if (log === true) console.log("Mongoose connection successfully opened!")
    })
    mongoose.connection.on("err", err => {
        if (log === true) console.error(`Mongoose connection error:\n${err.stack}`)
    })
    mongoose.connection.on("disconnected", () => {
        if (log === true) console.log("Mongoose connection disconnected")
    })
    mongoose.connect(configMongoose.connectionString, dbOptions)
}