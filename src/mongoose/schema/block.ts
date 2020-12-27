import * as mongoose from 'mongoose'
import * as config from '../../../config.json'
import schema_transaction from './transaction'
const options = {}
for (const property in config.mongoose.schema.block) {
    switch (config.mongoose.schema.block[property].type) {
        case 'String':
            options[config.mongoose.schema.block[property].name] = String
            break
        case 'Number':
            options[config.mongoose.schema.block[property].name] = Number
            break
        case '[transaction]':
            options[config.mongoose.schema.block[property].name] = [schema_transaction]
            break
    }
}
export default mongoose.Schema(options, { collection: 'blocks', versionKey: false })