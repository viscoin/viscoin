import * as mongoose from 'mongoose'
import * as config_mongoose from '../../../config/mongoose.json'
import schema_transaction from './transaction'
const options = {}
for (const property in config_mongoose.block) {
    switch (config_mongoose.block[property].type) {
        case 'String':
            options[config_mongoose.block[property].name] = String
            break
        case 'Number':
            options[config_mongoose.block[property].name] = Number
            break
        case '[transaction]':
            options[config_mongoose.block[property].name] = [schema_transaction]
            break
    }
}
export default new mongoose.Schema(options, { collection: 'blocks', versionKey: false })