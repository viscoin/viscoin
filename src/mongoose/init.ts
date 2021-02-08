import * as mongoose from 'mongoose'
import * as configMongoose from '../../config/mongoose.json'
export default () => {
    const dbOptions = {
        useNewUrlParser: true,
        autoIndex: false,
        poolSize: 5,
        connectTimeoutMS: 10000,
        family: 4,
        useUnifiedTopology: true
    }
    mongoose.set("useFindAndModify", false)
    mongoose.Promise = global.Promise
    mongoose.connection.on("connected", () => {
        // console.log("Mongoose connection successfully opened!")
    })
    mongoose.connection.on("err", err => {
        console.error(`Mongoose connection error:\n${err.stack}`)
    })
    mongoose.connection.on("disconnected", () => {
        console.log("Mongoose connection disconnected")
    })
    mongoose.connect(configMongoose.connectionString, dbOptions)
}