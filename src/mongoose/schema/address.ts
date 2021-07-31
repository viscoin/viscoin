import * as mongoose from 'mongoose'
import * as config_mongoose from '../../../config/mongoose.json'
const options = {}
for (const property in config_mongoose.address) {
    options[config_mongoose.address[property].name] = config_mongoose.address[property].type
}
export default new mongoose.Schema(options, { collection: 'addresses', versionKey: false })