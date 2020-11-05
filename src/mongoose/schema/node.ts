import * as mongoose from 'mongoose'
const schema = mongoose.Schema({
    address: String,
    port: Number,
    family: String
},
{
    collection: "nodes"
})
export default mongoose.model("Node", schema)