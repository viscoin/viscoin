import * as mongoose from 'mongoose'
import * as configMongoose from '../../../config/mongoose.json'
const options = {}
for (const property in configMongoose.schema.address) {
    options[configMongoose.schema.address[property].name] = configMongoose.schema.address[property].type
}
export default new mongoose.Schema(options, { collection: 'addresses', versionKey: false })