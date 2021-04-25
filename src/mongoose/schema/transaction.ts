import * as mongoose from 'mongoose'
import * as configMongoose from '../../../config/mongoose.json'
const options = {
    _id: String
}
for (const property in configMongoose.schema.transaction) {
    options[configMongoose.schema.transaction[property].name] = configMongoose.schema.transaction[property].type
}
export default new mongoose.Schema(options)