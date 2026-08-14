const nodemailer = require('nodemailer');
require('dotenv').config(); // Säkerställer att .env-variabler laddas
 
// Konfigurera e-posttransportören med värden från .env-filen
const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: process.env.SMTP_PORT,
    secure: false, // true för port 465, false för andra portar som 25
    tls: {
        rejectUnauthorized: false // Kan vara nödvändigt för vissa interna relays
    }
});
 
/**
 * Skickar ett e-postmeddelande.
 * @param {string} subject Ämnesraden för e-postmeddelandet.
 * @param {string} html Innehållet i e-postmeddelandet (HTML-formaterat).
 */
async function sendEmail(subject, html) {
    if (!process.env.SMTP_HOST || !process.env.ERROR_TO || !process.env.ERROR_FROM) {
        console.error('❌ E-postinställningar saknas i .env-filen. Kan inte skicka e-post.');
        return;
    }
 
    const mailOptions = {
        from: `SQL Monitor <${process.env.ERROR_FROM}>`,
        to: process.env.ERROR_TO,
        subject: subject,
        html: html
    };
 
    try {
        let info = await transporter.sendMail(mailOptions);
        console.log(`✅ E-post skickat: ${info.messageId}`);
    } catch (error) {
        console.error(`❌ Kunde inte skicka e-post:`, error);
    }
}
 
// Exportera funktionen så att den kan användas i andra filer
module.exports = { sendEmail };
