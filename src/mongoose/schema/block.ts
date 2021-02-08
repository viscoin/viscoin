import * as mongoose from 'mongoose'
import * as configMongoose from '../../../config/mongoose.json'
import schema_transaction from './transaction'
const options = {}
for (const property in configMongoose.schema.block) {
    switch (configMongoose.schema.block[property].type) {
        case 'String':
            options[configMongoose.schema.block[property].name] = String
            break
        case 'Number':
            options[configMongoose.schema.block[property].name] = Number
            break
        case '[transaction]':
            options[configMongoose.schema.block[property].name] = [schema_transaction]
            break
    }
}
export default mongoose.Schema(options, { collection: 'blocks', versionKey: false })