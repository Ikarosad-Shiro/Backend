const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
    email: { type: String, required: true, unique: true },
    password: { type: String, required: true },
    name: { type: String, required: true },
    phoneNumber: { type: String } // Añadido campo de teléfono
});

module.exports = mongoose.model('User', userSchema);