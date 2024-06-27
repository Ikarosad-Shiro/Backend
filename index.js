const express = require('express');
const bodyParser = require('body-parser');
const admin = require('firebase-admin');
const cors = require('cors');
const mongoose = require('mongoose');
const User = require('./models/user.model');
const nodemailer = require('nodemailer');
require('dotenv').config();

const serviceAccount = require('./proyectoangular-4b10a-firebase-adminsdk-hiim5-11171eb105.json');

// Inicializar Firebase Admin SDK
admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    databaseURL: 'https://proyectoangular-4b10a.firebaseio.com'
});

// Conexión a MongoDB
mongoose.connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
    serverSelectionTimeoutMS: 5000 // 5 segundos de timeout
});

mongoose.connection.once('open', () => {
    console.log('MongoDB conectado');
}).on('error', (error) => {
    console.log('Error de conexión:', error);
});

const app = express();
app.use(cors());
app.use(bodyParser.json());

// Configurar Nodemailer
const transporter = nodemailer.createTransport({
    service: 'Gmail',
    auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_PASS
    }
});

// Función para enviar correos electrónicos de verificación
async function sendVerificationEmail(email, verificationLink) {
    const mailOptions = {
        from: process.env.GMAIL_USER,
        to: email,
        subject: 'Verifica tu cuenta',
        text: `Haz clic en el siguiente enlace para verificar tu cuenta: ${verificationLink}`
    };

    try {
        await transporter.sendMail(mailOptions);
        console.log('Correo de verificación enviado');
    } catch (error) {
        console.error('Error enviando correo de verificación:', error);
    }
}

// Registrar usuario
app.post('/api/register', async(req, res) => {
    const { email, password, name } = req.body;
    console.log(`Solicitud de registro recibida para el correo: ${email}`);

    try {
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            console.error('El usuario ya existe en MongoDB');
            return res.status(400).send({ error: 'El correo electrónico ya está en uso por otra cuenta en MongoDB.' });
        }

        console.log('El usuario no existe, creando nuevo usuario en Firebase...');
        const userRecord = await admin.auth().createUser({
            email,
            password,
        });
        console.log(`Usuario de Firebase creado: ${userRecord.uid}`);

        const newUser = new User({ email, password, name, firebaseUid: userRecord.uid });
        console.log('Intentando guardar usuario en MongoDB:', newUser);
        await newUser.save();
        console.log('Usuario guardado en MongoDB');

        const verificationLink = await admin.auth().generateEmailVerificationLink(email);
        console.log('Enlace de verificación generado:', verificationLink);

        await sendVerificationEmail(email, verificationLink);

        res.status(201).send({ message: 'Registro exitoso: Se ha enviado un correo de verificación. Por favor, revisa tu correo y confirma tu cuenta.' });
    } catch (error) {
        console.error('Error durante el registro:', error);
        if (error.code === 'auth/email-already-exists') {
            res.status(400).send({ error: 'El correo electrónico ya está en uso por otra cuenta.' });
        } else if (error.code === 'auth/too-many-requests') {
            res.status(201).send({ message: 'Correo de verificación enviado. Por favor, revisa tu bandeja de entrada.' });
        } else {
            res.status(500).send({ error: error.message });
        }
    }
});

// Iniciar sesión
app.post('/api/login', async(req, res) => {
    const { email, password } = req.body;
    console.log(`Solicitud de inicio de sesión recibida para el correo: ${email}`);

    try {
        const userCredential = await admin.auth().getUserByEmail(email);
        if (!userCredential) {
            console.error('Usuario no encontrado en Firebase.');
            return res.status(400).send({ error: 'Usuario no encontrado en Firebase.' });
        }

        const userFromDB = await User.findOne({ email });
        if (!userFromDB) {
            console.error('Usuario no encontrado en la base de datos.');
            return res.status(400).send({ error: 'Usuario no encontrado en la base de datos.' });
        }

        if (userFromDB.password !== password) {
            console.error('Contraseña incorrecta.');
            return res.status(400).send({ error: 'Contraseña incorrecta.' });
        }

        if (!userCredential.emailVerified) {
            console.error('Correo no verificado.');
            return res.status(400).send({ error: 'Correo no verificado. Por favor, revisa tu correo y confirma tu cuenta.' });
        }

        res.status(200).send({
            message: 'Inicio de sesión exitoso',
            userId: userCredential.uid,
            emailVerified: userCredential.emailVerified,
            userName: userFromDB.name
        });
    } catch (error) {
        console.error('Error durante el inicio de sesión:', error);
        res.status(500).send({ error: error.message });
    }
});

// Verificar correo electrónico
app.get('/api/verify-email', async(req, res) => {
    const token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;
    if (!token) {
        return res.status(401).send({ verified: false });
    }

    try {
        const decodedToken = await admin.auth().verifyIdToken(token);
        const userRecord = await admin.auth().getUser(decodedToken.uid);
        res.status(200).send({ verified: userRecord.emailVerified });
    } catch (error) {
        console.error('Error al verificar el token:', error);
        res.status(500).send({ verified: false });
    }
});

// Obtener datos del usuario
app.get('/api/users/:firebaseUid', async(req, res) => {
    const firebaseUid = req.params.firebaseUid;
    console.log(`Obteniendo datos del usuario con UID: ${firebaseUid}`);

    try {
        const user = await User.findOne({ firebaseUid: firebaseUid });
        if (!user) {
            console.error('Usuario no encontrado');
            return res.status(404).send({ error: 'Usuario no encontrado' });
        }
        res.status(200).send(user);
    } catch (error) {
        console.error('Error al obtener los datos del usuario:', error);
        res.status(500).send({ error: 'Error al obtener los datos del usuario' });
    }
});

// Actualizar número de teléfono del usuario
app.put('/api/users/:id/phone', async(req, res) => {
    const { id } = req.params;
    const { phoneNumber } = req.body;

    try {
        const user = await User.findOne({ firebaseUid: id });
        if (!user) {
            return res.status(404).send({ error: 'Usuario no encontrado' });
        }

        user.phoneNumber = phoneNumber;
        await user.save();
        res.status(200).send({ message: 'Número de teléfono actualizado correctamente' });
    } catch (error) {
        console.error('Error al actualizar el número de teléfono:', error);
        res.status(500).send({ error: error.message });
    }
});

// Actualizar perfil del usuario
app.put('/api/users/:id', async(req, res) => {
    const { id } = req.params;
    const { name, phoneNumber } = req.body;

    try {
        const user = await User.findOne({ firebaseUid: id });
        if (!user) {
            return res.status(404).send({ error: 'Usuario no encontrado' });
        }

        user.name = name;
        user.phoneNumber = phoneNumber;
        await user.save();
        res.status(200).send({ message: 'Perfil actualizado correctamente' });
    } catch (error) {
        console.error('Error al actualizar el perfil:', error);
        res.status(500).send({ error: error.message });
    }
});

// Eliminar cuenta de usuario
app.delete('/api/users/:id', async(req, res) => {
    const { id } = req.params;

    try {
        const user = await User.findOneAndDelete({ firebaseUid: id });
        if (!user) {
            return res.status(404).send({ error: 'Usuario no encontrado' });
        }

        await admin.auth().deleteUser(id);
        res.status(200).send({ message: 'Cuenta eliminada correctamente' });
    } catch (error) {
        console.error('Error al eliminar la cuenta:', error);
        res.status(500).send({ error: error.message });
    }
});

app.listen(3000, () => {
    console.log('Servidor corriendo en el puerto 3000');
});